-- Disposable Postgres fixture for nonprofit fund-accounting tests.
-- Production migrations are applied unmodified after these contracts.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;

CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'accountant', 'bookkeeper', 'staff', 'read_only');
CREATE TABLE public.role_permissions (
  role public.company_role,
  permission text,
  PRIMARY KEY (role, permission)
);
CREATE TABLE public.companies (
  id uuid PRIMARY KEY,
  base_currency text NOT NULL
);
CREATE TABLE public.company_members (
  company_id uuid,
  user_id uuid,
  status text,
  PRIMARY KEY (company_id, user_id)
);
CREATE TABLE public.test_permissions (
  company_id uuid,
  user_id uuid,
  permission text,
  PRIMARY KEY (company_id, user_id, permission)
);
CREATE FUNCTION public.is_company_member(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = auth.uid() AND status = 'active'
  )
$$;
CREATE FUNCTION public.has_company_permission(_company_id uuid, _permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.test_permissions
    WHERE company_id = _company_id AND user_id = auth.uid() AND permission = _permission
  )
$$;
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL
);
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  code text,
  name text,
  account_type text,
  is_active boolean NOT NULL DEFAULT true,
  is_postable boolean NOT NULL DEFAULT true,
  archived_at timestamptz
);
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  actor_user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.currency_decimals (code char(3) PRIMARY KEY, decimals integer NOT NULL);
INSERT INTO public.currency_decimals VALUES ('USD', 2), ('EUR', 2), ('GBP', 2), ('INR', 2);
CREATE TYPE public.period_status AS ENUM ('open', 'locked', 'closed');
CREATE TYPE public.journal_source_type AS ENUM (
  'manual', 'other', 'reversal', 'expense', 'payroll', 'pos_sale', 'pos_refund',
  'nonprofit_donation', 'nonprofit_pledge', 'nonprofit_grant', 'nonprofit_expense',
  'nonprofit_transfer', 'nonprofit_release', 'nonprofit_opening', 'nonprofit_refund',
  'nonprofit_payroll', 'nonprofit_asset', 'nonprofit_fx'
);
CREATE TABLE public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  start_date date,
  end_date date,
  status public.period_status NOT NULL DEFAULT 'open'
);
CREATE SEQUENCE public.test_journal_number;
CREATE FUNCTION public.next_journal_number(_company uuid) RETURNS bigint
LANGUAGE sql AS $$ SELECT nextval('public.test_journal_number') $$;
CREATE FUNCTION public.assert_journal_date_unlocked(_company uuid, _d date) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE TABLE public.journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  journal_number bigint,
  journal_date date,
  period_id uuid,
  status text,
  source_type public.journal_source_type,
  source_id uuid,
  idempotency_key text,
  memo text,
  currency_code char(3),
  fx_rate_to_base numeric,
  reverses_journal_id uuid,
  created_by uuid,
  posted_at timestamptz,
  posted_by uuid,
  reversed_by_journal_id uuid,
  updated_at timestamptz,
  UNIQUE (company_id, idempotency_key)
);
CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.journals(id),
  company_id uuid NOT NULL,
  line_no integer,
  account_id uuid,
  description text,
  debit_minor bigint,
  credit_minor bigint
);

CREATE OR REPLACE FUNCTION public.post_journal(payload JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID;
  _existing UUID;
  _period UUID;
  _status public.period_status;
  _journal UUID;
  _line JSONB;
  _n INT := 0;
  _debit BIGINT;
  _credit BIGINT;
  _sum_d BIGINT := 0;
  _sum_c BIGINT := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  _company := (payload->>'company_id')::UUID;
  IF NOT public.is_company_member(_company) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT (
    public.has_company_permission(_company, 'accounting.post')
    OR public.has_company_permission(_company, 'journals.manual')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to post journals';
  END IF;
  IF NULLIF(payload->>'idempotency_key', '') IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journals
    WHERE company_id = _company AND idempotency_key = payload->>'idempotency_key';
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;
  SELECT id, status INTO _period, _status FROM public.accounting_periods
  WHERE company_id = _company AND start_date <= (payload->>'journal_date')::DATE
    AND end_date >= (payload->>'journal_date')::DATE
  LIMIT 1;
  IF _period IS NULL THEN RAISE EXCEPTION 'No accounting period covers posting date %', payload->>'journal_date'; END IF;
  IF _status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Accounting period is %; posting is not allowed', _status;
  END IF;
  PERFORM public.assert_journal_date_unlocked(_company, (payload->>'journal_date')::DATE);
  IF NOT EXISTS (SELECT 1 FROM public.currency_decimals WHERE code = upper(payload->>'currency_code')) THEN
    RAISE EXCEPTION 'Unsupported currency %', payload->>'currency_code';
  END IF;
  INSERT INTO public.journals (
    company_id, journal_number, journal_date, period_id, status, source_type, source_id,
    idempotency_key, memo, currency_code, fx_rate_to_base, created_by, posted_at, posted_by
  ) VALUES (
    _company, public.next_journal_number(_company), (payload->>'journal_date')::DATE, _period, 'posted',
    (payload->>'source_type')::public.journal_source_type, NULLIF(payload->>'source_id', '')::UUID,
    NULLIF(payload->>'idempotency_key', ''), payload->>'memo', upper(payload->>'currency_code'),
    COALESCE((payload->>'fx_rate_to_base')::NUMERIC, 1), _uid, now(), _uid
  ) RETURNING id INTO _journal;
  FOR _line IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
    _n := _n + 1;
    _debit := COALESCE((_line->>'debit_minor')::BIGINT, 0);
    _credit := COALESCE((_line->>'credit_minor')::BIGINT, 0);
    _sum_d := _sum_d + _debit;
    _sum_c := _sum_c + _credit;
    INSERT INTO public.journal_lines (journal_id, company_id, line_no, account_id, description, debit_minor, credit_minor)
    VALUES (_journal, _company, _n, (_line->>'account_id')::UUID, _line->>'description', _debit, _credit);
  END LOOP;
  IF _sum_d <> _sum_c OR _sum_d = 0 THEN
    RAISE EXCEPTION 'Journal does not balance: debits % <> credits %', _sum_d, _sum_c;
  END IF;
  RETURN _journal;
END;
$$;

INSERT INTO public.companies (id, base_currency) VALUES
  ('20000000-0000-4000-8000-000000000001', 'USD'),
  ('20000000-0000-4000-8000-000000000002', 'GBP');
INSERT INTO public.company_members VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'active'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'active');
INSERT INTO public.accounting_periods (company_id, start_date, end_date, status) VALUES
  ('20000000-0000-4000-8000-000000000001', '2020-01-01', '2099-12-31', 'open'),
  ('20000000-0000-4000-8000-000000000002', '2020-01-01', '2099-12-31', 'open');

INSERT INTO public.accounts (id, company_id, code, name, account_type) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '1000', 'Bank', 'asset'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '4100', 'Contributions', 'income'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '4110', 'Restricted contributions', 'income'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '1200', 'Contributions receivable', 'asset'),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '2300', 'Refundable advances', 'liability'),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '4200', 'Grant revenue', 'income'),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '5100', 'Programme', 'expense'),
  ('40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', '5200', 'Administration', 'expense'),
  ('40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', '5300', 'Fundraising', 'expense'),
  ('40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', '1400', 'Inventory', 'asset'),
  ('40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', '1500', 'Fixed assets', 'asset'),
  ('40000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000001', '1510', 'Accumulated depreciation', 'asset'),
  ('40000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000001', '5400', 'Depreciation', 'expense'),
  ('40000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000001', '5500', 'Payroll', 'expense'),
  ('40000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000001', '2400', 'Payroll payable', 'liability'),
  ('40000000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-000000000001', '2500', 'Due to funds', 'liability'),
  ('40000000-0000-4000-8000-000000000017', '20000000-0000-4000-8000-000000000001', '1600', 'Due from funds', 'asset'),
  ('40000000-0000-4000-8000-000000000018', '20000000-0000-4000-8000-000000000001', '3100', 'Transfer out', 'equity'),
  ('40000000-0000-4000-8000-000000000019', '20000000-0000-4000-8000-000000000001', '3110', 'Transfer in', 'equity'),
  ('40000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000001', '3200', 'Release debit', 'equity'),
  ('40000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000001', '3210', 'Release credit', 'equity'),
  ('40000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000001', '4300', 'Investment income', 'income'),
  ('40000000-0000-4000-8000-000000000023', '20000000-0000-4000-8000-000000000001', '5600', 'Pledge impairment', 'expense'),
  ('40000000-0000-4000-8000-000000000024', '20000000-0000-4000-8000-000000000001', '5700', 'Processing fees', 'expense'),
  ('40000000-0000-4000-8000-000000000025', '20000000-0000-4000-8000-000000000001', '4400', 'FX gain', 'income'),
  ('40000000-0000-4000-8000-000000000026', '20000000-0000-4000-8000-000000000001', '5800', 'FX loss', 'expense'),
  ('40000000-0000-4000-8000-000000000027', '20000000-0000-4000-8000-000000000001', '3300', 'Net assets with restrictions', 'equity'),
  ('40000000-0000-4000-8000-000000000028', '20000000-0000-4000-8000-000000000001', '3400', 'Net assets without restrictions', 'equity'),
  ('40000000-0000-4000-8000-000000000029', '20000000-0000-4000-8000-000000000001', '2000', 'Accounts payable', 'liability');

INSERT INTO public.test_permissions
SELECT '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', permission
FROM unnest(ARRAY[
  'accounting.post', 'nonprofit.view', 'nonprofit.manage', 'nonprofit.post', 'nonprofit.approve',
  'nonprofit.reverse', 'nonprofit.export', 'nonprofit.funds.manage', 'nonprofit.grants.approve',
  'nonprofit.restrictions.release', 'nonprofit.allocations.manage', 'nonprofit.disbursements.approve',
  'nonprofit.compliance.manage', 'nonprofit.admin', 'nonprofit.donors.manage', 'nonprofit.donations.manage',
  'nonprofit.beneficiaries.view', 'nonprofit.portal.manage'
]) AS permission;
INSERT INTO public.test_permissions
SELECT '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', permission
FROM unnest(ARRAY['nonprofit.view', 'nonprofit.manage']) AS permission;

CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION public.test_raises(statement text, pattern text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message = MESSAGE_TEXT; END;
  IF message IS NULL OR message !~* pattern THEN RAISE EXCEPTION 'FAIL: %; got %', label, message; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
GRANT SELECT ON public.journals, public.journal_lines, public.accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_assert(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_raises(text, text, text) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
