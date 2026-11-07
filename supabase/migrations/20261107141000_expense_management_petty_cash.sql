-- EM-08c: petty cash floats — fund/replenish from bank; settle spends via company_paid claims.

CREATE TABLE IF NOT EXISTS public.expense_petty_cash_floats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  float_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  custodian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency_code CHAR(3) NOT NULL,
  target_minor BIGINT NOT NULL CHECK (target_minor > 0),
  balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_petty_cash_floats_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT expense_petty_cash_floats_balance_le_target CHECK (balance_minor <= target_minor * 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_petty_cash_floats_company_number_uidx
  ON public.expense_petty_cash_floats (company_id, lower(float_number));
CREATE INDEX IF NOT EXISTS expense_petty_cash_floats_company_status_idx
  ON public.expense_petty_cash_floats (company_id, status, updated_at DESC);

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS petty_cash_float_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_claims_petty_cash_float_fk'
  ) THEN
    ALTER TABLE public.expense_claims
      ADD CONSTRAINT expense_claims_petty_cash_float_fk
      FOREIGN KEY (petty_cash_float_id)
      REFERENCES public.expense_petty_cash_floats(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expense_claims_petty_cash_float_idx
  ON public.expense_claims (petty_cash_float_id)
  WHERE petty_cash_float_id IS NOT NULL;

ALTER TABLE public.expense_petty_cash_floats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense petty cash floats select scoped" ON public.expense_petty_cash_floats;
CREATE POLICY "Expense petty cash floats select scoped"
  ON public.expense_petty_cash_floats FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      custodian_user_id = auth.uid()
      OR public.has_company_permission(company_id, 'expenses.manage_advances')
      OR public.has_company_permission(company_id, 'expenses.post')
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.admin')
      OR public.has_company_permission(company_id, 'expenses.audit')
    )
  );

REVOKE ALL ON TABLE public.expense_petty_cash_floats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_petty_cash_floats TO authenticated;
GRANT ALL ON TABLE public.expense_petty_cash_floats TO service_role;

INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'expense_petty_cash_float', 'PC-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- Extend manage_advances journal bridge to petty cash float fund journals.
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
      AND (
        public.has_company_permission(_company_id, 'expenses.post')
        OR public.has_company_permission(_company_id, 'expenses.reimburse')
      )
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.expense_claims c
        WHERE c.id = NULLIF(payload->>'source_id', '')::UUID
          AND c.company_id = _company_id
      )
    )
    OR (
      _source_type = 'expense'::public.journal_source_type
      AND public.has_company_permission(_company_id, 'expenses.manage_advances')
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.expense_cash_advances a
          WHERE a.id = NULLIF(payload->>'source_id', '')::UUID
            AND a.company_id = _company_id
        )
        OR EXISTS (
          SELECT 1 FROM public.expense_petty_cash_floats f
          WHERE f.id = NULLIF(payload->>'source_id', '')::UUID
            AND f.company_id = _company_id
        )
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

CREATE OR REPLACE FUNCTION private.expense_petty_cash_float_json(
  _row public.expense_petty_cash_floats
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(_row);
$$;

CREATE OR REPLACE FUNCTION public.list_expense_petty_cash_floats(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.post')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.audit')
  ) THEN
    RAISE EXCEPTION 'Petty cash list access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.status, f.name), '[]'::jsonb)
  INTO _rows
  FROM public.expense_petty_cash_floats f
  WHERE f.company_id = _company_id
    AND (
      f.custodian_user_id = auth.uid()
      OR public.has_company_permission(_company_id, 'expenses.manage_advances')
      OR public.has_company_permission(_company_id, 'expenses.post')
      OR public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.admin')
      OR public.has_company_permission(_company_id, 'expenses.audit')
    );

  RETURN jsonb_build_object('floats', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_petty_cash_float(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _name TEXT := NULLIF(btrim(COALESCE(_payload->>'name', '')), '');
  _description TEXT := NULLIF(btrim(COALESCE(_payload->>'description', '')), '');
  _currency TEXT := upper(COALESCE(NULLIF(btrim(_payload->>'currency_code'), ''), ''));
  _target BIGINT := COALESCE((_payload->>'target_minor')::BIGINT, 0);
  _notes TEXT := NULLIF(btrim(COALESCE(_payload->>'notes', '')), '');
  _expected_version INTEGER := COALESCE((_payload->>'version')::INTEGER, 0);
  _custodian UUID;
  _row public.expense_petty_cash_floats%ROWTYPE;
  _number TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Petty cash float edit denied' USING ERRCODE = '42501';
  END IF;

  _custodian := COALESCE(NULLIF(_payload->>'custodian_user_id', '')::UUID, auth.uid());
  IF _name IS NULL OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Float name is required (max 120 characters)';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;
  IF _target <= 0 THEN
    RAISE EXCEPTION 'Target float amount must be greater than zero';
  END IF;

  IF _id IS NULL THEN
    _number := public.allocate_document_number(_company_id, 'expense_petty_cash_float');
    INSERT INTO public.expense_petty_cash_floats (
      company_id, float_number, name, description, custodian_user_id,
      currency_code, target_minor, balance_minor, status, notes,
      version, created_by, updated_by
    ) VALUES (
      _company_id, _number, _name, _description, _custodian,
      _currency, _target, 0, 'active', _notes,
      1, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row
    FROM public.expense_petty_cash_floats
    WHERE id = _id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Petty cash float not found' USING ERRCODE = 'P0002';
    END IF;
    IF _row.status <> 'active' THEN
      RAISE EXCEPTION 'Only active floats can be edited';
    END IF;
    IF _row.version <> _expected_version THEN
      RAISE EXCEPTION 'Petty cash float was updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;
    IF _target < _row.balance_minor THEN
      RAISE EXCEPTION 'Target cannot be below the current float balance';
    END IF;

    UPDATE public.expense_petty_cash_floats SET
      name = _name,
      description = _description,
      custodian_user_id = _custodian,
      currency_code = _currency,
      target_minor = _target,
      notes = _notes,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  RETURN private.expense_petty_cash_float_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.fund_expense_petty_cash_float(
  _company_id UUID,
  _float_id UUID,
  _bank_account_id UUID,
  _amount_minor BIGINT,
  _expected_version INTEGER,
  _fund_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.expense_petty_cash_floats%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _petty UUID;
  _pay_date DATE;
  _journal_id UUID;
  _idem TEXT;
  _existing UUID;
  _lines JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Petty cash fund denied' USING ERRCODE = '42501';
  END IF;
  IF _amount_minor IS NULL OR _amount_minor <= 0 THEN
    RAISE EXCEPTION 'Fund amount must be greater than zero';
  END IF;

  SELECT * INTO _row
  FROM public.expense_petty_cash_floats
  WHERE id = _float_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash float not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Petty cash float was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _row.status <> 'active' THEN
    RAISE EXCEPTION 'Only active floats can be funded';
  END IF;

  IF _bank_account_id IS NULL OR NOT public.sales_is_deposit_account(_company_id, _bank_account_id) THEN
    RAISE EXCEPTION 'Choose a valid bank or cash account to fund petty cash';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.petty_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure the petty cash account in Expense Management settings before funding';
  END IF;
  _petty := _settings.petty_cash_account_id;
  IF _petty = _bank_account_id THEN
    RAISE EXCEPTION 'Petty cash account and bank account must be different';
  END IF;

  _pay_date := COALESCE(_fund_date, CURRENT_DATE);
  -- One fund attempt per float version + amount (safe retry after journal-before-balance crash).
  _idem := 'expense_petty_cash:' || _row.id::text || ':fund:v' || _row.version::text
    || ':a' || _amount_minor::text;

  SELECT id INTO _existing
  FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idem;
  IF _existing IS NOT NULL THEN
    UPDATE public.expense_petty_cash_floats SET
      balance_minor = balance_minor + _amount_minor,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _row.id AND version = _expected_version
    RETURNING * INTO _row;
    IF NOT FOUND THEN
      SELECT * INTO _row FROM public.expense_petty_cash_floats WHERE id = _float_id;
    END IF;
    RETURN private.expense_petty_cash_float_json(_row);
  END IF;

  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _petty,
      'debit_minor', _amount_minor,
      'credit_minor', 0,
      'description', 'Fund petty cash ' || _row.float_number
    ),
    jsonb_build_object(
      'account_id', _bank_account_id,
      'debit_minor', 0,
      'credit_minor', _amount_minor,
      'description', 'Bank transfer to ' || _row.float_number
    )
  );

  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _pay_date,
    'currency_code', _row.currency_code,
    'fx_rate_to_base', 1,
    'source_type', 'expense',
    'source_id', _row.id,
    'idempotency_key', _idem,
    'memo', 'Fund petty cash ' || _row.float_number || ' — ' || _row.name,
    'lines', _lines
  ));

  UPDATE public.expense_petty_cash_floats SET
    balance_minor = balance_minor + _amount_minor,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN private.expense_petty_cash_float_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_expense_petty_cash_float(
  _company_id UUID,
  _float_id UUID,
  _expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_petty_cash_floats%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Petty cash close denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_petty_cash_floats
  WHERE id = _float_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash float not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Petty cash float was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _row.status <> 'active' THEN
    RAISE EXCEPTION 'Float is already closed';
  END IF;
  IF _row.balance_minor <> 0 THEN
    RAISE EXCEPTION 'Return or spend the remaining float balance before closing';
  END IF;

  UPDATE public.expense_petty_cash_floats SET
    status = 'closed',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN private.expense_petty_cash_float_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_expense_claim_petty_cash_float(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _float_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _float public.expense_petty_cash_floats%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim edit denied' USING ERRCODE = '42501';
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
  IF _claim.approval_status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Only draft or returned claims can link a petty cash float';
  END IF;
  IF _claim.payment_source <> 'company_paid' THEN
    RAISE EXCEPTION 'Set payment source to company_paid before linking petty cash';
  END IF;
  IF _claim.claimant_user_id <> auth.uid()
    AND NOT public.has_company_permission(_company_id, 'expenses.admin') THEN
    RAISE EXCEPTION 'Only the claimant can link petty cash' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _float
  FROM public.expense_petty_cash_floats
  WHERE id = _float_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Petty cash float not found' USING ERRCODE = 'P0002';
  END IF;
  IF _float.status <> 'active' THEN
    RAISE EXCEPTION 'Petty cash float must be active';
  END IF;
  IF _float.currency_code <> _claim.claim_currency THEN
    RAISE EXCEPTION 'Petty cash currency must match the claim currency';
  END IF;
  IF _float.balance_minor < _claim.total_minor THEN
    RAISE EXCEPTION 'Petty cash balance (%) is less than claim total (%)',
      _float.balance_minor, _claim.total_minor;
  END IF;

  UPDATE public.expense_claims SET
    petty_cash_float_id = _float.id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'petty_cash_linked',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Linked petty cash ' || _float.float_number,
    jsonb_build_object('petty_cash_float_id', _float.id)
  );

  RETURN private.expense_claim_json(_claim);
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
  _adv public.expense_cash_advances%ROWTYPE;
  _float public.expense_petty_cash_floats%ROWTYPE;
  _credit_account UUID;
  _tax_account UUID;
  _lines JSONB := '[]'::jsonb;
  _line RECORD;
  _tax_total BIGINT := 0;
  _debit_total BIGINT := 0;
  _journal_id UUID;
  _idem TEXT;
  _existing UUID;
  _credit_label TEXT;
  _event_note TEXT;
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
  IF _claim.payment_source NOT IN ('employee_paid', 'cash_advance', 'company_paid') THEN
    RAISE EXCEPTION 'Posting supports employee-paid, cash-advance and company-paid claims in this release';
  END IF;
  IF _claim.posting_status = 'posted' AND _claim.posted_journal_id IS NOT NULL THEN
    IF _claim.payment_source = 'employee_paid' THEN
      PERFORM private.expense_claim_mark_awaiting_payment(_claim.id);
      SELECT * INTO _claim FROM public.expense_claims WHERE id = _claim_id;
    END IF;
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

  IF _claim.payment_source = 'employee_paid' THEN
    IF NOT FOUND OR _settings.employee_payable_account_id IS NULL THEN
      RAISE EXCEPTION 'Configure the employee payable account in Expense Management settings before posting';
    END IF;
    _credit_account := _settings.employee_payable_account_id;
    _credit_label := 'Employee payable ' || _claim.claim_number;
    _event_note := 'Claim accrued to employee payable';
  ELSIF _claim.payment_source = 'cash_advance' THEN
    IF NOT FOUND OR _settings.employee_advance_account_id IS NULL THEN
      RAISE EXCEPTION 'Configure the employee advance account in Expense Management settings before posting';
    END IF;
    IF _claim.cash_advance_id IS NULL THEN
      RAISE EXCEPTION 'Link an issued cash advance before posting a cash-advance claim';
    END IF;
    SELECT * INTO _adv
    FROM public.expense_cash_advances
    WHERE id = _claim.cash_advance_id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked cash advance not found';
    END IF;
    IF _adv.status NOT IN ('issued', 'partially_settled') THEN
      RAISE EXCEPTION 'Linked cash advance is not open for settlement (status %)', _adv.status;
    END IF;
    IF _adv.remaining_minor < _claim.total_minor THEN
      RAISE EXCEPTION 'Cash advance remaining (%) is less than claim total (%)',
        _adv.remaining_minor, _claim.total_minor;
    END IF;
    _credit_account := _settings.employee_advance_account_id;
    _credit_label := 'Settle advance ' || _adv.advance_number;
    _event_note := 'Claim settled against cash advance ' || _adv.advance_number;
  ELSE
    IF NOT FOUND OR _settings.petty_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Configure the petty cash account in Expense Management settings before posting';
    END IF;
    IF _claim.petty_cash_float_id IS NULL THEN
      RAISE EXCEPTION 'Link an active petty cash float before posting a company-paid claim';
    END IF;
    SELECT * INTO _float
    FROM public.expense_petty_cash_floats
    WHERE id = _claim.petty_cash_float_id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked petty cash float not found';
    END IF;
    IF _float.status <> 'active' THEN
      RAISE EXCEPTION 'Linked petty cash float is not active';
    END IF;
    IF _float.balance_minor < _claim.total_minor THEN
      RAISE EXCEPTION 'Petty cash balance (%) is less than claim total (%)',
        _float.balance_minor, _claim.total_minor;
    END IF;
    _credit_account := _settings.petty_cash_account_id;
    _credit_label := 'Petty cash ' || _float.float_number;
    _event_note := 'Claim paid from petty cash ' || _float.float_number;
  END IF;

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
    IF _claim.payment_source = 'employee_paid' THEN
      PERFORM private.expense_claim_mark_awaiting_payment(_claim.id);
      SELECT * INTO _claim FROM public.expense_claims WHERE id = _claim_id;
    END IF;
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
    'account_id', _credit_account,
    'debit_minor', 0,
    'credit_minor', _debit_total,
    'description', _credit_label
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

  IF _claim.payment_source = 'employee_paid' THEN
    PERFORM private.expense_claim_mark_awaiting_payment(_claim.id);
    SELECT * INTO _claim FROM public.expense_claims WHERE id = _claim_id;
  ELSIF _claim.payment_source = 'cash_advance' AND _claim.cash_advance_id IS NOT NULL THEN
    UPDATE public.expense_cash_advances SET
      remaining_minor = remaining_minor - _claim.total_minor,
      status = CASE
        WHEN remaining_minor - _claim.total_minor = 0 THEN 'settled'
        ELSE 'partially_settled'
      END,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.cash_advance_id;
  ELSIF _claim.payment_source = 'company_paid' AND _claim.petty_cash_float_id IS NOT NULL THEN
    UPDATE public.expense_petty_cash_floats SET
      balance_minor = balance_minor - _claim.total_minor,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.petty_cash_float_id;
  END IF;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'posted',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    _event_note,
    jsonb_build_object('journal_id', _journal_id, 'payment_source', _claim.payment_source)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION private.reset_demo_company_with_workflows(_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'demo.reset') THEN
    RAISE EXCEPTION 'Demo reset access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || ':workflow-reset', 0));
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND is_demo) THEN
    RAISE EXCEPTION 'Reset denied: company is not a demo company';
  END IF;

  UPDATE public.expense_claims
  SET spending_request_id = NULL, cash_advance_id = NULL, petty_cash_float_id = NULL
  WHERE company_id = _company;
  DELETE FROM public.expense_spending_requests WHERE company_id = _company;
  DELETE FROM public.expense_receipt_inbox_entries WHERE company_id = _company;
  DELETE FROM public.expense_claim_events WHERE company_id = _company;
  DELETE FROM public.expense_claim_lines WHERE company_id = _company;
  DELETE FROM public.expense_claims WHERE company_id = _company;
  DELETE FROM public.expense_claim_templates WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_cash_advances WHERE company_id = _company;
  DELETE FROM public.expense_petty_cash_floats WHERE company_id = _company;
  DELETE FROM public.expense_mileage_rates WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_petty_cash_floats(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_petty_cash_float(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fund_expense_petty_cash_float(UUID, UUID, UUID, BIGINT, INTEGER, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_expense_petty_cash_float(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_expense_claim_petty_cash_float(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_petty_cash_floats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_petty_cash_float(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fund_expense_petty_cash_float(UUID, UUID, UUID, BIGINT, INTEGER, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_expense_petty_cash_float(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_expense_claim_petty_cash_float(UUID, UUID, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
