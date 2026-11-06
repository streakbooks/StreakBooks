-- Basic Global Payroll Batch 5: accrual posting, net-pay payments and bank export helpers.
--
-- Requires 20261105173000 (pay runs and payslips).
--
-- Scope
--  * Post approved payroll runs to the ledger (source_type payroll) via post_journal.
--  * Record net-pay payments (bank / cash / cheque / manual) with payslip allocations.
--  * Generic bank CSV row export (does not mark payslips paid).
--
-- Non-goals: statutory engines, bank-specific file formats, auto-mark exported as paid.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS accrual_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posting_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS net_paid_minor BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_posting_idempotency_uidx
  ON public.payroll_runs (company_id, posting_idempotency_key)
  WHERE posting_idempotency_key IS NOT NULL;

ALTER TABLE public.payroll_payslips
  ADD COLUMN IF NOT EXISTS amount_paid_minor BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('bank_transfer', 'cash', 'cheque', 'manual', 'other')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  unallocated_minor BIGINT NOT NULL DEFAULT 0 CHECK (unallocated_minor >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reference TEXT,
  memo TEXT,
  clearing_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'reversed')),
  idempotency_key TEXT,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_payments_ref_len CHECK (
    reference IS NULL OR char_length(reference) <= 80
  ),
  CONSTRAINT payroll_payments_memo_len CHECK (
    memo IS NULL OR char_length(memo) <= 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_payments_company_idempotency_uidx
  ON public.payroll_payments (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS payroll_payments_company_date_idx
  ON public.payroll_payments (company_id, payment_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payroll_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payroll_payments(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES public.payroll_payslips(id) ON DELETE RESTRICT,
  run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE RESTRICT,
  run_employee_id UUID NOT NULL REFERENCES public.payroll_run_employees(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_payment_allocations_uniq UNIQUE (payment_id, payslip_id)
);

CREATE INDEX IF NOT EXISTS payroll_payment_allocations_payslip_idx
  ON public.payroll_payment_allocations (payslip_id);

CREATE INDEX IF NOT EXISTS payroll_payment_allocations_run_idx
  ON public.payroll_payment_allocations (run_id);

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll viewers can read payments" ON public.payroll_payments;
CREATE POLICY "Payroll viewers can read payments" ON public.payroll_payments
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read payment allocations" ON public.payroll_payment_allocations;
CREATE POLICY "Payroll viewers can read payment allocations" ON public.payroll_payment_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

REVOKE ALL ON public.payroll_payments, public.payroll_payment_allocations FROM PUBLIC, anon;
GRANT SELECT ON public.payroll_payments, public.payroll_payment_allocations TO authenticated;

-- ---------------------------------------------------------------------------
-- Ledger permission bridge for payroll source journals
-- ---------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.reverse_journal_on(
  _journal_id UUID,
  _reversal_date DATE,
  _idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  j RECORD;
  payload JSONB;
  lines JSONB := '[]'::jsonb;
  ln RECORD;
  new_id UUID;
  idem TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _reversal_date IS NULL THEN RAISE EXCEPTION 'A reversal date is required'; END IF;

  SELECT * INTO j FROM public.journals WHERE id = _journal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
  IF NOT public.is_company_member(j.company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT (
    public.has_company_permission(j.company_id, 'accounting.post')
    OR public.has_company_permission(j.company_id, 'journals.manual')
    OR (
      j.source_type = 'payroll'::public.journal_source_type
      AND (
        public.has_company_permission(j.company_id, 'payroll.run.post')
        OR public.has_company_permission(j.company_id, 'payroll.pay')
      )
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to reverse journals';
  END IF;
  IF j.status <> 'posted' THEN RAISE EXCEPTION 'Only posted journals can be reversed'; END IF;

  idem := COALESCE(NULLIF(trim(_idempotency_key), ''), 'reversal:' || j.id::TEXT);

  IF j.reversed_by_journal_id IS NOT NULL THEN
    SELECT id INTO new_id FROM public.journals
    WHERE company_id = j.company_id AND idempotency_key = idem;
    IF new_id IS NOT NULL THEN RETURN new_id; END IF;
    RAISE EXCEPTION 'Journal already reversed';
  END IF;

  IF _reversal_date < j.journal_date THEN
    RAISE EXCEPTION 'Reversal date % cannot be before the original journal date %', _reversal_date, j.journal_date;
  END IF;

  FOR ln IN
    SELECT account_id, description, debit_minor, credit_minor
    FROM public.journal_lines WHERE journal_id = j.id ORDER BY line_no
  LOOP
    lines := lines || jsonb_build_array(jsonb_build_object(
      'account_id', ln.account_id,
      'description', COALESCE(ln.description, 'Reversal'),
      'debit_minor', ln.credit_minor,
      'credit_minor', ln.debit_minor
    ));
  END LOOP;

  payload := jsonb_build_object(
    'company_id', j.company_id,
    'journal_date', _reversal_date,
    'memo', 'Reversal of journal #' || j.journal_number,
    'currency_code', j.currency_code,
    'fx_rate_to_base', j.fx_rate_to_base,
    'source_type', 'reversal',
    'source_id', j.id,
    'idempotency_key', idem,
    'reverses_journal_id', j.id,
    'lines', lines
  );

  new_id := public.post_journal(payload);
  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_derive_payslip_payment_status(_net BIGINT, _paid BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _paid <= 0 THEN 'unpaid'
    WHEN _paid >= _net THEN 'paid'
    ELSE 'partial'
  END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_assert_settings_accounts(_settings public.payroll_settings)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF _settings.salary_expense_account_id IS NULL
     OR _settings.net_pay_liability_account_id IS NULL
     OR _settings.deduction_liability_account_id IS NULL
     OR _settings.employer_expense_account_id IS NULL
     OR _settings.employer_liability_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure payroll GL accounts in settings before posting';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_derive_payslip_payment_status(BIGINT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_assert_settings_accounts(public.payroll_settings) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.payroll_build_accrual_journal_lines(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.payroll_settings;
  _run public.payroll_runs;
  _map JSONB := '{}'::jsonb;
  _rec RECORD;
  _acct UUID;
  _key TEXT;
  _debit BIGINT;
  _credit BIGINT;
  _lines JSONB := '[]'::jsonb;
  _net BIGINT;
BEGIN
  SELECT * INTO _run FROM public.payroll_runs WHERE id = _run_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll settings not found'; END IF;
  PERFORM public.payroll_assert_settings_accounts(_settings);

  FOR _rec IN
    SELECT l.kind, l.amount_minor,
           ct.expense_account_id, ct.liability_account_id
    FROM public.payroll_run_lines l
    JOIN public.payroll_run_employees re ON re.id = l.run_employee_id
    LEFT JOIN public.payroll_component_types ct ON ct.id = l.component_type_id
    WHERE re.run_id = _run_id AND re.company_id = _company_id AND re.status = 'included'
      AND l.amount_minor > 0
  LOOP
    IF _rec.kind = 'earning' THEN
      _acct := COALESCE(_rec.expense_account_id, _settings.salary_expense_account_id);
      _key := _acct::TEXT || ':d';
      _debit := COALESCE((_map->>_key)::BIGINT, 0) + _rec.amount_minor;
      _map := _map || jsonb_build_object(_key, _debit);
    ELSIF _rec.kind = 'deduction' THEN
      _acct := COALESCE(_rec.liability_account_id, _settings.deduction_liability_account_id);
      _key := _acct::TEXT || ':c';
      _credit := COALESCE((_map->>_key)::BIGINT, 0) + _rec.amount_minor;
      _map := _map || jsonb_build_object(_key, _credit);
    ELSIF _rec.kind = 'employer_contribution' THEN
      _acct := COALESCE(_rec.expense_account_id, _settings.employer_expense_account_id);
      _key := _acct::TEXT || ':d';
      _debit := COALESCE((_map->>_key)::BIGINT, 0) + _rec.amount_minor;
      _map := _map || jsonb_build_object(_key, _debit);
      _acct := COALESCE(_rec.liability_account_id, _settings.employer_liability_account_id);
      _key := _acct::TEXT || ':c';
      _credit := COALESCE((_map->>_key)::BIGINT, 0) + _rec.amount_minor;
      _map := _map || jsonb_build_object(_key, _credit);
    END IF;
  END LOOP;

  _net := _run.net_minor;
  IF _net > 0 THEN
    _key := _settings.net_pay_liability_account_id::TEXT || ':c';
    _credit := COALESCE((_map->>_key)::BIGINT, 0) + _net;
    _map := _map || jsonb_build_object(_key, _credit);
  END IF;

  FOR _rec IN
    SELECT split_part(k, ':', 1)::UUID AS account_id,
           CASE WHEN split_part(k, ':', 2) = 'd' THEN (v)::BIGINT ELSE 0 END AS debit,
           CASE WHEN split_part(k, ':', 2) = 'c' THEN (v)::BIGINT ELSE 0 END AS credit
    FROM jsonb_each_text(_map) AS e(k, v)
  LOOP
    IF _rec.debit > 0 THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object(
        'account_id', _rec.account_id,
        'debit_minor', _rec.debit,
        'credit_minor', 0,
        'description', 'Payroll ' || _run.run_number
      ));
    END IF;
    IF _rec.credit > 0 THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object(
        'account_id', _rec.account_id,
        'debit_minor', 0,
        'credit_minor', _rec.credit,
        'description', 'Payroll ' || _run.run_number
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'Payroll run has no amounts to post';
  END IF;

  RETURN _lines;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_build_accrual_journal_lines(UUID, UUID) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.payroll_refresh_run_payment_status(_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _paid BIGINT;
  _all_paid BOOLEAN;
BEGIN
  SELECT * INTO _run FROM public.payroll_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(p.amount_paid_minor), 0) INTO _paid
  FROM public.payroll_payslips p WHERE p.run_id = _run_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.payroll_payslips p
    JOIN public.payroll_run_employees re ON re.id = p.run_employee_id
    WHERE p.run_id = _run_id AND re.net_minor > p.amount_paid_minor
  ) INTO _all_paid;

  UPDATE public.payroll_runs SET
    net_paid_minor = _paid,
    status = CASE
      WHEN _run.status IN ('void', 'draft', 'calculated', 'reviewed', 'approved') THEN _run.status
      WHEN _run.accrual_journal_id IS NULL THEN _run.status
      WHEN _paid >= _run.net_minor AND _run.net_minor > 0 AND _all_paid THEN 'complete'
      WHEN _paid > 0 THEN 'paid'
      ELSE 'posted'
    END,
    updated_at = now()
  WHERE id = _run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_refresh_run_payment_status(UUID) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- post_payroll_run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_payroll_run(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _settings public.payroll_settings;
  _lines JSONB;
  _jid UUID;
  _idem TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.post') THEN
    RAISE EXCEPTION 'You do not have permission to post payroll runs';
  END IF;

  SELECT * INTO _run FROM public.payroll_runs
  WHERE id = _run_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  IF _run.accrual_journal_id IS NOT NULL THEN
    RETURN to_jsonb(_run);
  END IF;

  IF _run.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved runs can be posted (status: %)', _run.status;
  END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll settings not found'; END IF;
  PERFORM public.payroll_assert_settings_accounts(_settings);

  _idem := 'payroll-run:' || _run_id::TEXT || ':accrual';
  SELECT id INTO _jid FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idem;
  IF _jid IS NOT NULL THEN
    UPDATE public.payroll_runs SET
      accrual_journal_id = _jid,
      posting_idempotency_key = _idem,
      posted_at = COALESCE(posted_at, now()),
      posted_by = COALESCE(posted_by, auth.uid()),
      status = 'posted',
      updated_at = now()
    WHERE id = _run_id
    RETURNING * INTO _run;
    RETURN to_jsonb(_run);
  END IF;

  _lines := public.payroll_build_accrual_journal_lines(_company_id, _run_id);

  _jid := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _run.payment_date,
    'memo', 'Payroll ' || _run.run_number || ' (' || _run.period_start || ' – ' || _run.period_end || ')',
    'currency_code', _run.currency,
    'fx_rate_to_base', 1,
    'source_type', 'payroll',
    'source_id', _run_id,
    'idempotency_key', _idem,
    'lines', _lines
  ));

  UPDATE public.payroll_runs SET
    accrual_journal_id = _jid,
    posting_idempotency_key = _idem,
    posted_at = now(),
    posted_by = auth.uid(),
    status = 'posted',
    updated_at = now()
  WHERE id = _run_id
  RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.run.posted', 'payroll_run', _run.id::TEXT,
    jsonb_build_object('run_number', _run.run_number, 'journal_id', _jid)
  );

  RETURN to_jsonb(_run);
END;
$$;

REVOKE ALL ON FUNCTION public.post_payroll_run(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payroll_run(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- reverse_payroll_run_accrual (correction only; no payments recorded)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_payroll_run_accrual(
  _company_id UUID,
  _run_id UUID,
  _reversal_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _rev UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.post') THEN
    RAISE EXCEPTION 'You do not have permission to reverse payroll postings';
  END IF;
  IF _reversal_date IS NULL THEN RAISE EXCEPTION 'Reversal date is required'; END IF;

  SELECT * INTO _run FROM public.payroll_runs
  WHERE id = _run_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF _run.accrual_journal_id IS NULL THEN
    RAISE EXCEPTION 'This run has not been posted';
  END IF;
  IF _run.net_paid_minor > 0 OR EXISTS (
    SELECT 1 FROM public.payroll_payment_allocations a WHERE a.run_id = _run_id
  ) THEN
    RAISE EXCEPTION 'Reverse the accrual only when no net-pay payments have been recorded';
  END IF;

  _rev := public.reverse_journal_on(
    _run.accrual_journal_id,
    _reversal_date,
    'payroll-run:' || _run_id::TEXT || ':accrual:reverse'
  );

  UPDATE public.payroll_runs SET
    accrual_journal_id = NULL,
    posted_at = NULL,
    posted_by = NULL,
    posting_idempotency_key = NULL,
    status = 'approved',
    updated_at = now()
  WHERE id = _run_id
  RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.run.accrual_reversed', 'payroll_run', _run.id::TEXT,
    jsonb_build_object('reversal_journal_id', _rev)
  );

  RETURN jsonb_build_object('run', to_jsonb(_run), 'reversal_journal_id', _rev);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payroll_run_accrual(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payroll_run_accrual(UUID, UUID, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- record_payroll_payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payroll_payment(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company_id UUID;
  _date DATE;
  _method TEXT;
  _amount BIGINT;
  _bank UUID;
  _currency TEXT;
  _ref TEXT;
  _memo TEXT;
  _idem TEXT;
  _allocs JSONB;
  _a JSONB;
  _payslip_id UUID;
  _amt BIGINT;
  _alloc_sum BIGINT := 0;
  _settings public.payroll_settings;
  _slip RECORD;
  _seen UUID[] := '{}';
  _pay_id UUID;
  _jid UUID;
  _existing RECORD;
  _unalloc BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  _company_id := NULLIF(payload->>'company_id', '')::UUID;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.pay') THEN
    RAISE EXCEPTION 'You do not have permission to record payroll payments';
  END IF;

  _date := NULLIF(payload->>'payment_date', '')::DATE;
  _method := NULLIF(trim(payload->>'payment_method'), '');
  _amount := NULLIF(payload->>'amount_minor', '')::BIGINT;
  _bank := NULLIF(payload->>'clearing_account_id', '')::UUID;
  _ref := NULLIF(left(trim(COALESCE(payload->>'reference', '')), 80), '');
  _memo := NULLIF(left(trim(COALESCE(payload->>'memo', '')), 500), '');
  _idem := NULLIF(left(trim(COALESCE(payload->>'idempotency_key', '')), 100), '');
  _allocs := COALESCE(payload->'allocations', '[]'::jsonb);
  _currency := upper(COALESCE(NULLIF(payload->>'currency_code', ''), (
    SELECT payroll_currency FROM public.payroll_settings WHERE company_id = _company_id
  )));

  IF _date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  IF _method IS NULL OR _method NOT IN ('bank_transfer', 'cash', 'cheque', 'manual', 'other') THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  IF _bank IS NULL THEN RAISE EXCEPTION 'Clearing account is required'; END IF;
  IF NOT public.sales_is_deposit_account(_company_id, _bank) THEN
    RAISE EXCEPTION 'Clearing account must be an active bank or cash account';
  END IF;
  IF jsonb_typeof(_allocs) <> 'array' THEN RAISE EXCEPTION 'allocations must be an array'; END IF;

  IF _idem IS NOT NULL THEN
    SELECT id, journal_id INTO _existing
    FROM public.payroll_payments WHERE company_id = _company_id AND idempotency_key = _idem;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'payment_id', _existing.id,
        'journal_id', _existing.journal_id,
        'replayed', TRUE
      );
    END IF;
  END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.net_pay_liability_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure net pay liability account in payroll settings';
  END IF;

  FOR _a IN SELECT value FROM jsonb_array_elements(_allocs)
  LOOP
    _payslip_id := NULLIF(_a->>'payslip_id', '')::UUID;
    _amt := NULLIF(_a->>'amount_minor', '')::BIGINT;
    IF _payslip_id IS NULL THEN RAISE EXCEPTION 'Allocation missing payslip_id'; END IF;
    IF _amt IS NULL OR _amt <= 0 THEN RAISE EXCEPTION 'Allocation amounts must be positive'; END IF;
    IF _payslip_id = ANY (_seen) THEN RAISE EXCEPTION 'Each payslip can only appear once'; END IF;
    _seen := _seen || _payslip_id;
    _alloc_sum := _alloc_sum + _amt;
  END LOOP;
  IF _alloc_sum > _amount THEN RAISE EXCEPTION 'Allocations exceed payment amount'; END IF;
  _unalloc := _amount - _alloc_sum;

  IF cardinality(_seen) > 0 THEN
    PERFORM 1 FROM public.payroll_payslips
    WHERE id = ANY (_seen) AND company_id = _company_id
    ORDER BY id FOR UPDATE;

    FOR _a IN SELECT value FROM jsonb_array_elements(_allocs)
    LOOP
      _payslip_id := (_a->>'payslip_id')::UUID;
      _amt := (_a->>'amount_minor')::BIGINT;
      SELECT p.*, re.net_minor AS employee_net, r.status AS run_status, r.accrual_journal_id
      INTO _slip
      FROM public.payroll_payslips p
      JOIN public.payroll_run_employees re ON re.id = p.run_employee_id
      JOIN public.payroll_runs r ON r.id = p.run_id
      WHERE p.id = _payslip_id AND p.company_id = _company_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Payslip not found'; END IF;
      IF _slip.run_status NOT IN ('posted', 'paid', 'complete') OR _slip.accrual_journal_id IS NULL THEN
        RAISE EXCEPTION 'Payslip run must be posted before payment';
      END IF;
      IF _amt > _slip.employee_net - _slip.amount_paid_minor THEN
        RAISE EXCEPTION 'Allocation exceeds outstanding net pay for payslip %', _slip.payslip_number;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.payroll_payments (
    company_id, payment_date, payment_method, amount_minor, unallocated_minor,
    currency, reference, memo, clearing_account_id, status, idempotency_key, created_by
  ) VALUES (
    _company_id, _date, _method, _amount, _unalloc,
    _currency, _ref, _memo, _bank, 'posted', _idem, _uid
  ) RETURNING id INTO _pay_id;

  _jid := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _date,
    'memo', COALESCE(_memo, 'Payroll payment'),
    'currency_code', _currency,
    'fx_rate_to_base', 1,
    'source_type', 'payroll',
    'source_id', _pay_id,
    'idempotency_key', COALESCE(_idem, 'payroll-payment:' || _pay_id::TEXT) || ':post',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'account_id', _settings.net_pay_liability_account_id,
        'description', COALESCE(_memo, 'Net pay'),
        'debit_minor', _amount,
        'credit_minor', 0
      ),
      jsonb_build_object(
        'account_id', _bank,
        'description', COALESCE(_memo, 'Payroll payment'),
        'debit_minor', 0,
        'credit_minor', _amount
      )
    )
  ));

  UPDATE public.payroll_payments SET journal_id = _jid, updated_at = now() WHERE id = _pay_id;

  FOR _a IN SELECT value FROM jsonb_array_elements(_allocs)
  LOOP
    _payslip_id := (_a->>'payslip_id')::UUID;
    _amt := (_a->>'amount_minor')::BIGINT;

    SELECT p.id, p.run_id, p.run_employee_id, re.net_minor
    INTO _slip
    FROM public.payroll_payslips p
    JOIN public.payroll_run_employees re ON re.id = p.run_employee_id
    WHERE p.id = _payslip_id AND p.company_id = _company_id;

    INSERT INTO public.payroll_payment_allocations (
      company_id, payment_id, payslip_id, run_id, run_employee_id, amount_minor
    ) VALUES (
      _company_id, _pay_id, _payslip_id, _slip.run_id, _slip.run_employee_id, _amt
    );

    UPDATE public.payroll_payslips SET
      amount_paid_minor = amount_paid_minor + _amt,
      payment_status = public.payroll_derive_payslip_payment_status(re.net_minor, amount_paid_minor + _amt)
    FROM public.payroll_run_employees re
    WHERE payroll_payslips.id = _payslip_id AND re.id = payroll_payslips.run_employee_id;

    PERFORM public.payroll_refresh_run_payment_status(_slip.run_id);
  END LOOP;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.payment.recorded', 'payroll_payment', _pay_id,
    jsonb_build_object('amount_minor', _amount, 'journal_id', _jid, 'allocated_minor', _alloc_sum)
  );

  RETURN jsonb_build_object(
    'payment_id', _pay_id,
    'journal_id', _jid,
    'unallocated_minor', _unalloc,
    'replayed', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_payroll_payment(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payroll_payment(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- reverse_payroll_payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_payroll_payment(
  _company_id UUID,
  _payment_id UUID,
  _reversal_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pay public.payroll_payments;
  _rev UUID;
  _a RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.pay') THEN
    RAISE EXCEPTION 'You do not have permission to reverse payroll payments';
  END IF;
  IF _reversal_date IS NULL THEN RAISE EXCEPTION 'Reversal date is required'; END IF;

  SELECT * INTO _pay FROM public.payroll_payments
  WHERE id = _payment_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _pay.status <> 'posted' OR _pay.journal_id IS NULL THEN
    RAISE EXCEPTION 'Only posted payments can be reversed';
  END IF;

  _rev := public.reverse_journal_on(
    _pay.journal_id,
    _reversal_date,
    'payroll-payment:' || _payment_id::TEXT || ':reverse'
  );

  FOR _a IN
    SELECT * FROM public.payroll_payment_allocations
    WHERE payment_id = _payment_id AND company_id = _company_id
  LOOP
    UPDATE public.payroll_payslips SET
      amount_paid_minor = GREATEST(0, amount_paid_minor - _a.amount_minor),
      payment_status = public.payroll_derive_payslip_payment_status(
        (SELECT re.net_minor FROM public.payroll_run_employees re WHERE re.id = payroll_payslips.run_employee_id),
        GREATEST(0, amount_paid_minor - _a.amount_minor)
      )
    WHERE id = _a.payslip_id;
    PERFORM public.payroll_refresh_run_payment_status(_a.run_id);
  END LOOP;

  UPDATE public.payroll_payments SET
    status = 'reversed',
    reversed_at = now(),
    reversed_by = auth.uid(),
    reversal_journal_id = _rev,
    updated_at = now()
  WHERE id = _payment_id;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.payment.reversed', 'payroll_payment', _payment_id,
    jsonb_build_object('reversal_journal_id', _rev)
  );

  RETURN jsonb_build_object('payment_id', _payment_id, 'reversal_journal_id', _rev);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payroll_payment(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payroll_payment(UUID, UUID, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- list / get payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_payroll_payments(_company_id UUID, _run_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _items JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.payment_date DESC, p.created_at DESC), '[]'::jsonb)
  INTO _items
  FROM public.payroll_payments p
  WHERE p.company_id = _company_id
    AND (
      _run_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.payroll_payment_allocations a
        WHERE a.payment_id = p.id AND a.run_id = _run_id
      )
    );

  RETURN jsonb_build_object('payments', _items);
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_payments(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payroll_payments(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_payment(_company_id UUID, _payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pay JSONB;
  _allocs JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT to_jsonb(p) INTO _pay
  FROM public.payroll_payments p
  WHERE p.id = _payment_id AND p.company_id = _company_id;
  IF _pay IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'allocation', to_jsonb(a),
      'payslip', to_jsonb(ps),
      'employee', to_jsonb(e)
    ) ORDER BY ps.payslip_number
  ), '[]'::jsonb)
  INTO _allocs
  FROM public.payroll_payment_allocations a
  JOIN public.payroll_payslips ps ON ps.id = a.payslip_id
  JOIN public.payroll_employees e ON e.id = ps.employee_id
  WHERE a.payment_id = _payment_id AND a.company_id = _company_id;

  RETURN jsonb_build_object('payment', _pay, 'allocations', _allocs);
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_payment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_payment(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_payroll_run_journals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_payroll_run_journals(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _journals JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'accounting.view') THEN
    RAISE EXCEPTION 'You do not have permission to view journals';
  END IF;

  SELECT * INTO _run FROM public.payroll_runs WHERE id = _run_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'journal', to_jsonb(j),
      'lines', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'line', to_jsonb(jl),
            'account_code', a.code,
            'account_name', a.name
          ) ORDER BY jl.line_no
        ), '[]'::jsonb)
        FROM public.journal_lines jl
        JOIN public.accounts a ON a.id = jl.account_id
        WHERE jl.journal_id = j.id
      )
    ) ORDER BY j.journal_date, j.journal_number
  ), '[]'::jsonb)
  INTO _journals
  FROM public.journals j
  WHERE j.company_id = _company_id
    AND (
      (j.source_type = 'payroll' AND j.source_id = _run_id)
      OR j.id = _run.accrual_journal_id
      OR j.id IN (
        SELECT pp.journal_id FROM public.payroll_payments pp
        JOIN public.payroll_payment_allocations pa ON pa.payment_id = pp.id
        WHERE pa.run_id = _run_id AND pp.journal_id IS NOT NULL
      )
      OR j.reverses_journal_id IN (
        SELECT j2.id FROM public.journals j2
        WHERE j2.company_id = _company_id
          AND (
            (j2.source_type = 'payroll' AND j2.source_id = _run_id)
            OR j2.id = _run.accrual_journal_id
          )
      )
    );

  RETURN jsonb_build_object('journals', _journals);
END;
$$;

REVOKE ALL ON FUNCTION public.list_payroll_run_journals(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_payroll_run_journals(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Generic bank CSV export (does not mark paid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_payroll_bank_csv_rows(
  _company_id UUID,
  _run_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.pay') THEN
    RAISE EXCEPTION 'You do not have permission to export payroll payments';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'run_number', r.run_number,
      'payslip_number', p.payslip_number,
      'employee_number', e.employee_number,
      'employee_name', trim(e.first_name || ' ' || e.last_name),
      'payment_date', r.payment_date,
      'currency', r.currency,
      'amount_minor', re.net_minor - p.amount_paid_minor,
      'account_name', pd.account_name,
      'bank_name', pd.bank_name,
      'account_number', pd.account_number,
      'sort_code', pd.sort_code,
      'iban', pd.iban,
      'bic', pd.bic,
      'reference', p.payslip_number
    ) ORDER BY r.run_number, e.employee_number
  ), '[]'::jsonb)
  INTO _rows
  FROM public.payroll_payslips p
  JOIN public.payroll_runs r ON r.id = p.run_id
  JOIN public.payroll_run_employees re ON re.id = p.run_employee_id
  JOIN public.payroll_employees e ON e.id = p.employee_id
  LEFT JOIN public.payroll_employee_payment_details pd ON pd.employee_id = e.id
  WHERE p.company_id = _company_id
    AND r.status IN ('posted', 'paid', 'complete')
    AND re.net_minor > p.amount_paid_minor
    AND (_run_id IS NULL OR p.run_id = _run_id);

  RETURN jsonb_build_object(
    'format', 'generic_csv',
    'disclaimer',
      'Generic payroll bank export for manual review. This does not record payments or mark payslips as paid.',
    'rows', _rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.export_payroll_bank_csv_rows(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_payroll_bank_csv_rows(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend get_payroll_run_page with payment summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payroll_run_page(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run JSONB;
  _employees JSONB;
  _lines JSONB;
  _schedule JSONB;
  _payments JSONB;
  _outstanding BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT to_jsonb(r) INTO _run
  FROM public.payroll_runs r
  WHERE r.id = _run_id AND r.company_id = _company_id;
  IF _run IS NULL THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  SELECT to_jsonb(s) INTO _schedule
  FROM public.payroll_pay_schedules s
  JOIN public.payroll_runs r ON r.pay_schedule_id = s.id
  WHERE r.id = _run_id AND s.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'run_employee', to_jsonb(re),
      'employee', to_jsonb(e),
      'payslip', to_jsonb(p)
    ) ORDER BY e.employee_number
  ), '[]'::jsonb)
  INTO _employees
  FROM public.payroll_run_employees re
  JOIN public.payroll_employees e ON e.id = re.employee_id
  LEFT JOIN public.payroll_payslips p ON p.run_employee_id = re.id
  WHERE re.run_id = _run_id AND re.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.code), '[]'::jsonb)
  INTO _lines
  FROM public.payroll_run_lines l
  JOIN public.payroll_run_employees re ON re.id = l.run_employee_id
  WHERE re.run_id = _run_id AND l.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(pay) ORDER BY pay.payment_date DESC), '[]'::jsonb)
  INTO _payments
  FROM public.payroll_payments pay
  WHERE pay.company_id = _company_id
    AND EXISTS (
      SELECT 1 FROM public.payroll_payment_allocations a
      WHERE a.payment_id = pay.id AND a.run_id = _run_id
    );

  SELECT COALESCE(SUM(GREATEST(re.net_minor - COALESCE(p.amount_paid_minor, 0), 0)), 0)
  INTO _outstanding
  FROM public.payroll_run_employees re
  LEFT JOIN public.payroll_payslips p ON p.run_employee_id = re.id
  WHERE re.run_id = _run_id AND re.status = 'included';

  RETURN jsonb_build_object(
    'run', _run,
    'schedule', _schedule,
    'employees', _employees,
    'lines', _lines,
    'payments', _payments,
    'net_outstanding_minor', _outstanding
  );
END;
$$;
