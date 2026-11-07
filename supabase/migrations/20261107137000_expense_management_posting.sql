-- Expense Management EM-06a: post approved employee-paid claims to the ledger.
-- Accrual only (DR expense + input tax, CR employee payable). Bank payment is EM-07.
-- Bridges expenses.post into post_journal for source_type = expense when source is an expense_claim.

CREATE OR REPLACE FUNCTION public.post_journal(payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _company_id UUID;
  _journal_date DATE;
  _memo TEXT;
  _currency CHAR(3);
  _fx NUMERIC(18,8);
  _source_type public.journal_source_type;
  _source_id UUID;
  _idem TEXT;
  _reverses UUID;
  _period_id UUID;
  _period_status public.period_status;
  _journal_id UUID;
  _existing UUID;
  _line JSONB;
  _line_no INT := 0;
  _account_id UUID;
  _debit BIGINT;
  _credit BIGINT;
  _sum_debit BIGINT := 0;
  _sum_credit BIGINT := 0;
  _acct RECORD;
  _base_currency CHAR(3);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  _company_id := (payload->>'company_id')::UUID;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;

  _source_type := COALESCE((payload->>'source_type')::public.journal_source_type, 'manual');

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'accounting.post')
    OR public.has_company_permission(_company_id, 'journals.manual')
    OR (
      _source_type = 'payroll'::public.journal_source_type
      AND (
        public.has_company_permission(_company_id, 'payroll.run.post')
        OR public.has_company_permission(_company_id, 'payroll.pay')
      )
    )
    OR (
      _source_type = 'expense'::public.journal_source_type
      AND public.has_company_permission(_company_id, 'expenses.post')
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.expense_claims c
        WHERE c.id = NULLIF(payload->>'source_id', '')::UUID
          AND c.company_id = _company_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to post journals';
  END IF;

  _journal_date := (payload->>'journal_date')::DATE;
  IF _journal_date IS NULL THEN RAISE EXCEPTION 'journal_date is required'; END IF;
  _memo := NULLIF(trim(COALESCE(payload->>'memo', '')), '');
  _currency := upper(COALESCE(payload->>'currency_code', ''));
  _fx := COALESCE((payload->>'fx_rate_to_base')::NUMERIC, 1);
  IF _fx <= 0 THEN RAISE EXCEPTION 'fx_rate_to_base must be positive'; END IF;
  _source_id := NULLIF(payload->>'source_id', '')::UUID;
  _idem := NULLIF(trim(COALESCE(payload->>'idempotency_key', '')), '');
  _reverses := NULLIF(payload->>'reverses_journal_id', '')::UUID;

  SELECT base_currency INTO _base_currency FROM public.companies WHERE id = _company_id;
  IF _currency = '' THEN _currency := _base_currency; END IF;
  IF length(_currency) <> 3 THEN RAISE EXCEPTION 'Invalid currency_code'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currency_decimals WHERE code = _currency) THEN
    RAISE EXCEPTION 'Unsupported currency %', _currency;
  END IF;

  IF _idem IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journals
    WHERE company_id = _company_id AND idempotency_key = _idem;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  SELECT id, status INTO _period_id, _period_status
  FROM public.accounting_periods
  WHERE company_id = _company_id
    AND start_date <= _journal_date
    AND end_date >= _journal_date
  LIMIT 1;

  IF _period_id IS NULL THEN
    RAISE EXCEPTION 'No accounting period covers posting date %', _journal_date;
  END IF;
  IF _period_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Accounting period is %; posting is not allowed', _period_status;
  END IF;

  PERFORM public.assert_journal_date_unlocked(_company_id, _journal_date);

  IF jsonb_typeof(payload->'lines') <> 'array' OR jsonb_array_length(payload->'lines') < 2 THEN
    RAISE EXCEPTION 'Journal requires at least two lines';
  END IF;

  PERFORM set_config('linkbooks.trusted', 'on', true);

  INSERT INTO public.journals (
    company_id, journal_number, journal_date, period_id, status,
    source_type, source_id, idempotency_key, memo, currency_code, fx_rate_to_base,
    reverses_journal_id, created_by, posted_at, posted_by
  ) VALUES (
    _company_id, public.next_journal_number(_company_id), _journal_date, _period_id, 'posted',
    _source_type, _source_id, _idem, _memo, _currency, _fx,
    _reverses, _uid, now(), _uid
  ) RETURNING id INTO _journal_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(payload->'lines')
  LOOP
    _line_no := _line_no + 1;
    _account_id := (_line->>'account_id')::UUID;
    _debit := COALESCE((_line->>'debit_minor')::BIGINT, 0);
    _credit := COALESCE((_line->>'credit_minor')::BIGINT, 0);

    IF _account_id IS NULL THEN
      RAISE EXCEPTION 'Line % missing account_id', _line_no;
    END IF;
    IF (_debit > 0 AND _credit > 0) OR (_debit = 0 AND _credit = 0) THEN
      RAISE EXCEPTION 'Line % must have either debit_minor or credit_minor > 0, not both', _line_no;
    END IF;
    IF _debit < 0 OR _credit < 0 THEN
      RAISE EXCEPTION 'Line % amounts must be non-negative minor units', _line_no;
    END IF;

    SELECT * INTO _acct FROM public.accounts WHERE id = _account_id AND company_id = _company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % not found in organisation', _account_id;
    END IF;
    IF NOT _acct.is_active OR _acct.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Account % is inactive', _acct.code;
    END IF;
    IF NOT _acct.is_postable THEN
      RAISE EXCEPTION 'Account % is not postable', _acct.code;
    END IF;

    INSERT INTO public.journal_lines (
      journal_id, company_id, line_no, account_id, description, debit_minor, credit_minor
    ) VALUES (
      _journal_id, _company_id, _line_no, _account_id,
      NULLIF(trim(COALESCE(_line->>'description', '')), ''),
      _debit, _credit
    );

    _sum_debit := _sum_debit + _debit;
    _sum_credit := _sum_credit + _credit;
  END LOOP;

  IF _sum_debit <> _sum_credit THEN
    RAISE EXCEPTION 'Journal does not balance: debits % <> credits % (minor units)', _sum_debit, _sum_credit;
  END IF;
  IF _sum_debit = 0 THEN
    RAISE EXCEPTION 'Journal total cannot be zero';
  END IF;

  IF _reverses IS NOT NULL THEN
    UPDATE public.journals
    SET reversed_by_journal_id = _journal_id, updated_at = now()
    WHERE id = _reverses AND company_id = _company_id AND status = 'posted';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Journal to reverse not found or not posted';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    _company_id, _uid, 'journal.posted', 'journal', _journal_id,
    jsonb_build_object(
      'debit_minor', _sum_debit,
      'credit_minor', _sum_credit,
      'source_type', _source_type,
      'idempotency_key', _idem,
      'reverses_journal_id', _reverses
    )
  );

  PERFORM set_config('linkbooks.trusted', 'off', true);
  RETURN _journal_id;

EXCEPTION WHEN unique_violation THEN
  IF _idem IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journals
    WHERE company_id = _company_id AND idempotency_key = _idem;
    IF _existing IS NOT NULL THEN
      PERFORM set_config('linkbooks.trusted', 'off', true);
      RETURN _existing;
    END IF;
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_expense_claim(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _payable UUID;
  _tax_account UUID;
  _lines JSONB := '[]'::jsonb;
  _line RECORD;
  _tax_total BIGINT := 0;
  _debit_total BIGINT := 0;
  _journal_id UUID;
  _idem TEXT;
  _existing UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.post')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim posting denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _claim.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved claims can be posted';
  END IF;
  IF _claim.payment_source <> 'employee_paid' THEN
    RAISE EXCEPTION 'EM-06a posts only employee-paid claims. Other payment sources come later.';
  END IF;
  IF _claim.posting_status = 'posted' AND _claim.posted_journal_id IS NOT NULL THEN
    RETURN private.expense_claim_json(_claim);
  END IF;
  IF _claim.posting_status NOT IN ('ready', 'failed') THEN
    RAISE EXCEPTION 'Claim posting status must be ready (currently %)', _claim.posting_status;
  END IF;
  IF _claim.posted_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Claim already has a posted journal';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.employee_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure the employee payable account in Expense Management settings before posting';
  END IF;
  _payable := _settings.employee_payable_account_id;

  _idem := 'expense_claim:' || _claim.id::text || ':accrual';
  SELECT id INTO _existing
  FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idem;
  IF _existing IS NOT NULL THEN
    UPDATE public.expense_claims SET
      posting_status = 'posted',
      posted_journal_id = _existing,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id
    RETURNING * INTO _claim;
    PERFORM private.expense_claim_event(
      _company_id, _claim.id, 'posted',
      _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
      'Linked existing accrual journal',
      jsonb_build_object('journal_id', _existing)
    );
    RETURN private.expense_claim_json(_claim);
  END IF;

  UPDATE public.expense_claims SET
    posting_status = 'posting',
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id;

  FOR _line IN
    SELECT *
    FROM public.expense_claim_lines
    WHERE claim_id = _claim.id
    ORDER BY line_no
  LOOP
    IF _line.net_minor > 0 THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object(
        'account_id', _line.account_id,
        'debit_minor', _line.net_minor,
        'credit_minor', 0,
        'description', COALESCE(NULLIF(btrim(_line.description), ''), _claim.claim_number)
      ));
      _debit_total := _debit_total + _line.net_minor;
    END IF;
    _tax_total := _tax_total + COALESCE(_line.tax_minor, 0);
  END LOOP;

  IF _tax_total > 0 THEN
    _tax_account := public.ops_input_tax_account(_company_id);
    IF _tax_account IS NULL THEN
      UPDATE public.expense_claims SET posting_status = 'failed' WHERE id = _claim.id;
      RAISE EXCEPTION 'Input tax account is not configured for this organisation';
    END IF;
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', _tax_account,
      'debit_minor', _tax_total,
      'credit_minor', 0,
      'description', 'Input tax on ' || _claim.claim_number
    ));
    _debit_total := _debit_total + _tax_total;
  END IF;

  IF _debit_total <= 0 THEN
    UPDATE public.expense_claims SET posting_status = 'failed' WHERE id = _claim.id;
    RAISE EXCEPTION 'Claim has nothing to post';
  END IF;
  IF _debit_total <> _claim.total_minor THEN
    UPDATE public.expense_claims SET posting_status = 'failed' WHERE id = _claim.id;
    RAISE EXCEPTION 'Claim line totals do not match header total (% vs %)', _debit_total, _claim.total_minor;
  END IF;

  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'account_id', _payable,
    'debit_minor', 0,
    'credit_minor', _debit_total,
    'description', 'Employee payable ' || _claim.claim_number
  ));

  BEGIN
    _journal_id := public.post_journal(jsonb_build_object(
      'company_id', _company_id,
      'journal_date', _claim.claim_date,
      'currency_code', _claim.claim_currency,
      'fx_rate_to_base', 1,
      'source_type', 'expense',
      'source_id', _claim.id,
      'idempotency_key', _idem,
      'memo', 'Expense claim ' || _claim.claim_number || ' — ' || _claim.title,
      'lines', _lines
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.expense_claims SET
      posting_status = 'failed',
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id;
    RAISE;
  END;

  UPDATE public.expense_claims SET
    posting_status = 'posted',
    posted_journal_id = _journal_id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'posted',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Claim accrued to employee payable',
    jsonb_build_object('journal_id', _journal_id)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

REVOKE ALL ON FUNCTION public.post_expense_claim(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense_claim(UUID, UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
