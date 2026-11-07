-- EM-06b: FX line validation helper + reimbursement refund (reverse last bank payment).

CREATE OR REPLACE FUNCTION public.validate_expense_claim_fx(
  _company_id UUID,
  _claim_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _allow_multi BOOLEAN := true;
  _issues JSONB := '[]'::jsonb;
  _line RECORD;
  _base CHAR(3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(s.allow_multi_currency_claims, true)
  INTO _allow_multi
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  SELECT c.base_currency INTO _base
  FROM public.companies c
  WHERE c.id = _company_id;

  FOR _line IN
    SELECT l.*
    FROM public.expense_claim_lines l
    WHERE l.claim_id = _claim.id
    ORDER BY l.line_no
  LOOP
    IF NOT COALESCE(_allow_multi, true)
       AND upper(_line.currency_code) <> upper(_claim.claim_currency) THEN
      _issues := _issues || jsonb_build_array(jsonb_build_object(
        'line_no', _line.line_no,
        'code', 'currency_mismatch',
        'message', 'Line currency must match claim currency when multi-currency claims are disabled'
      ));
    END IF;
    IF _line.exchange_rate IS NULL OR _line.exchange_rate <= 0 THEN
      _issues := _issues || jsonb_build_array(jsonb_build_object(
        'line_no', _line.line_no,
        'code', 'invalid_fx',
        'message', 'Exchange rate must be greater than zero'
      ));
    END IF;
    IF upper(_line.currency_code) = upper(COALESCE(_base, _claim.claim_currency))
       AND _line.exchange_rate <> 1 THEN
      _issues := _issues || jsonb_build_array(jsonb_build_object(
        'line_no', _line.line_no,
        'code', 'base_fx_not_one',
        'message', 'Base-currency lines should use exchange rate 1'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'claim_id', _claim.id,
    'allow_multi_currency_claims', COALESCE(_allow_multi, true),
    'base_currency', _base,
    'ok', jsonb_array_length(_issues) = 0,
    'issues', _issues
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_expense_claim_reimbursement(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _payment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _pay public.expense_claim_reimbursement_payments%ROWTYPE;
  _payable UUID;
  _journal_id UUID;
  _idem TEXT;
  _lines JSONB;
  _status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.reimburse')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim refund denied' USING ERRCODE = '42501';
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
  IF _claim.reimbursement_status NOT IN ('paid', 'partially_paid') THEN
    RAISE EXCEPTION 'Only paid or partially paid claims can be refunded';
  END IF;

  IF _payment_id IS NULL THEN
    SELECT * INTO _pay
    FROM public.expense_claim_reimbursement_payments p
    WHERE p.claim_id = _claim.id AND p.channel = 'bank'
    ORDER BY p.created_at DESC
    LIMIT 1;
  ELSE
    SELECT * INTO _pay
    FROM public.expense_claim_reimbursement_payments p
    WHERE p.id = _payment_id AND p.claim_id = _claim.id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No bank reimbursement payment found to refund';
  END IF;
  IF _pay.bank_account_id IS NULL OR _pay.journal_id IS NULL THEN
    RAISE EXCEPTION 'Payment is missing bank or journal references';
  END IF;

  -- Prevent double-refund of the same payment via idempotency key.
  _idem := 'expense_claim:' || _claim.id::text || ':refund:' || _pay.id::text;
  IF EXISTS (
    SELECT 1 FROM public.journals j
    WHERE j.company_id = _company_id AND j.idempotency_key = _idem
  ) THEN
    RAISE EXCEPTION 'This reimbursement payment was already refunded';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.employee_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure the employee payable account before refunding';
  END IF;
  _payable := _settings.employee_payable_account_id;

  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _pay.bank_account_id,
      'debit_minor', _pay.amount_minor,
      'credit_minor', 0,
      'description', 'Refund bank ' || _claim.claim_number
    ),
    jsonb_build_object(
      'account_id', _payable,
      'debit_minor', 0,
      'credit_minor', _pay.amount_minor,
      'description', 'Refund payable ' || _claim.claim_number
    )
  );

  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', CURRENT_DATE,
    'currency_code', _claim.reimbursement_currency,
    'fx_rate_to_base', 1,
    'source_type', 'expense',
    'source_id', _claim.id,
    'idempotency_key', _idem,
    'memo', 'Refund expense reimbursement ' || _claim.claim_number,
    'lines', _lines
  ));

  UPDATE public.expense_claims SET
    reimbursed_minor = GREATEST(COALESCE(reimbursed_minor, 0) - _pay.amount_minor, 0),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  _status := CASE
    WHEN COALESCE(_claim.reimbursed_minor, 0) <= 0 THEN 'refunded'
    ELSE 'partially_paid'
  END;

  UPDATE public.expense_claims SET
    reimbursement_status = _status
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'reimbursement_refunded',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Bank reimbursement refunded',
    jsonb_build_object(
      'payment_id', _pay.id,
      'amount_minor', _pay.amount_minor,
      'journal_id', _journal_id,
      'reimbursed_minor', _claim.reimbursed_minor
    )
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_expense_claim_fx(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_expense_claim_reimbursement(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_expense_claim_fx(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_expense_claim_reimbursement(UUID, UUID, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
