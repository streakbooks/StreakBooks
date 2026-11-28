-- Nonprofit fund accounting foundation.
-- Posts only through public.post_journal. Fund identity is stored beside the
-- ledger lines so the chart of accounts is not duplicated.
-- Conditional contributions are liabilities. Unconditional restricted
-- contributions are revenue. This migration does not replace post_journal.

ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_donation';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_pledge';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_grant';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_expense';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_transfer';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_release';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_opening';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_refund';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_payroll';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_asset';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_fx';

INSERT INTO public.role_permissions (role, permission)
SELECT role::public.company_role, permission
FROM (VALUES ('owner'), ('admin')) AS roles(role)
CROSS JOIN (VALUES
  ('nonprofit.view'),
  ('nonprofit.manage'),
  ('nonprofit.post'),
  ('nonprofit.approve'),
  ('nonprofit.reverse'),
  ('nonprofit.export'),
  ('nonprofit.funds.manage'),
  ('nonprofit.grants.approve'),
  ('nonprofit.restrictions.release'),
  ('nonprofit.allocations.manage'),
  ('nonprofit.disbursements.approve'),
  ('nonprofit.compliance.manage'),
  ('nonprofit.admin'),
  ('nonprofit.donors.manage'),
  ('nonprofit.donations.manage'),
  ('nonprofit.beneficiaries.view'),
  ('nonprofit.portal.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'accountant'::public.company_role, permission
FROM (VALUES
  ('nonprofit.view'),
  ('nonprofit.manage'),
  ('nonprofit.post'),
  ('nonprofit.approve'),
  ('nonprofit.reverse'),
  ('nonprofit.export'),
  ('nonprofit.funds.manage'),
  ('nonprofit.grants.approve'),
  ('nonprofit.restrictions.release'),
  ('nonprofit.allocations.manage'),
  ('nonprofit.disbursements.approve'),
  ('nonprofit.compliance.manage'),
  ('nonprofit.donors.manage'),
  ('nonprofit.donations.manage'),
  ('nonprofit.beneficiaries.view')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'bookkeeper'::public.company_role, permission
FROM (VALUES
  ('nonprofit.view'),
  ('nonprofit.post'),
  ('nonprofit.export'),
  ('nonprofit.funds.manage'),
  ('nonprofit.donors.manage'),
  ('nonprofit.donations.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'staff'::public.company_role, permission
FROM (VALUES
  ('nonprofit.view'),
  ('nonprofit.donors.manage'),
  ('nonprofit.donations.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'read_only'::public.company_role, permission
FROM (VALUES ('nonprofit.view'), ('nonprofit.export')) AS perms(permission)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.nonprofit_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  accounting_framework TEXT NOT NULL DEFAULT 'configurable'
    CHECK (accounting_framework IN ('us_fasb', 'uk_sorp', 'india_ngo', 'au_acnc', 'ca_asnpo', 'nz_pbe', 'configurable')),
  country_code CHAR(2) NOT NULL DEFAULT 'US',
  allow_unrestricted_deficit BOOLEAN NOT NULL DEFAULT false,
  enforce_segregation BOOLEAN NOT NULL DEFAULT false,
  gateway_configured BOOLEAN NOT NULL DEFAULT false,
  account_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_counters (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, kind)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  classification TEXT NOT NULL CHECK (classification IN (
    'unrestricted', 'donor_restricted', 'board_designated', 'temporarily_restricted',
    'perpetually_restricted', 'endowment', 'general', 'programme', 'project',
    'emergency', 'capital', 'scholarship', 'government_grant', 'international_grant', 'custom'
  )),
  restriction TEXT NOT NULL CHECK (restriction IN (
    'unrestricted', 'donor_restricted', 'board_designated', 'temporarily_restricted', 'perpetually_restricted'
  )),
  category TEXT NOT NULL CHECK (category IN (
    'general', 'programme', 'project', 'emergency', 'capital', 'scholarship',
    'government_grant', 'international_grant', 'endowment', 'custom'
  )),
  effective_on DATE,
  expires_on DATE,
  permitted_expenditure TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_at TIMESTAMPTZ,
  opening_posted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  CONSTRAINT nonprofit_funds_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT nonprofit_funds_code_nonempty CHECK (length(trim(code)) > 0)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_endowments (
  fund_id UUID PRIMARY KEY REFERENCES public.nonprofit_funds(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  principal_minor BIGINT NOT NULL DEFAULT 0 CHECK (principal_minor >= 0),
  distributable_income_minor BIGINT NOT NULL DEFAULT 0 CHECK (distributable_income_minor >= 0),
  spending_policy_bps INTEGER NOT NULL DEFAULT 0 CHECK (spending_policy_bps BETWEEN 0 AND 10000)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  donor_kind TEXT NOT NULL CHECK (donor_kind IN (
    'individual', 'corporate', 'foundation', 'government', 'institutional',
    'major', 'recurring', 'anonymous', 'international', 'prospective', 'lapsed'
  )),
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'granted', 'withdrawn')),
  communication_preference TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nonprofit_donors_name_nonempty CHECK (length(trim(display_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS nonprofit_donors_email_idx
  ON public.nonprofit_donors (company_id, lower(email))
  WHERE email IS NOT NULL AND status <> 'merged';

CREATE TABLE IF NOT EXISTS public.nonprofit_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES public.nonprofit_donors(id) ON DELETE RESTRICT,
  donation_number TEXT NOT NULL,
  donated_on DATE NOT NULL,
  currency_code CHAR(3) NOT NULL,
  fx_rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (fx_rate_to_base > 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  method TEXT NOT NULL CHECK (method IN (
    'cash', 'bank_transfer', 'cheque', 'card', 'online', 'payroll_giving', 'in_kind', 'other'
  )),
  conditional BOOLEAN NOT NULL DEFAULT false,
  in_kind TEXT NOT NULL DEFAULT 'none' CHECK (in_kind IN ('none', 'inventory', 'fixed_asset', 'services')),
  campaign_id UUID,
  programme_id UUID,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'refunded', 'not_recognised')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  memo TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, donation_number),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_donation_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donation_id UUID NOT NULL REFERENCES public.nonprofit_donations(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  UNIQUE (donation_id, fund_id)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donation_id UUID NOT NULL REFERENCES public.nonprofit_donations(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES public.nonprofit_donors(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  issued_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL,
  wording TEXT NOT NULL,
  UNIQUE (company_id, receipt_number),
  UNIQUE (donation_id)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_pledges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.nonprofit_donors(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  pledge_number TEXT NOT NULL,
  pledged_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL,
  fx_rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (fx_rate_to_base > 0),
  unconditional BOOLEAN NOT NULL,
  restricted BOOLEAN NOT NULL DEFAULT false,
  recognised_minor BIGINT NOT NULL DEFAULT 0 CHECK (recognised_minor >= 0),
  collected_minor BIGINT NOT NULL DEFAULT 0 CHECK (collected_minor >= 0),
  impaired_minor BIGINT NOT NULL DEFAULT 0 CHECK (impaired_minor >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recognised', 'collected', 'impaired', 'conditional')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, pledge_number)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_fund_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  journal_line_id UUID NOT NULL REFERENCES public.journal_lines(id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journal_line_id)
);

CREATE INDEX IF NOT EXISTS nonprofit_fund_tags_fund_idx
  ON public.nonprofit_fund_tags (company_id, fund_id);
CREATE INDEX IF NOT EXISTS nonprofit_donations_company_idx
  ON public.nonprofit_donations (company_id, donated_on);
CREATE INDEX IF NOT EXISTS nonprofit_funds_company_idx
  ON public.nonprofit_funds (company_id, status);

CREATE OR REPLACE FUNCTION public.nonprofit_require(_company_id UUID, _permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT public.has_company_permission(_company_id, _permission) THEN
    RAISE EXCEPTION 'Missing permission %', _permission;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_enabled(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nonprofit_settings
    WHERE company_id = _company_id AND enabled
  ) THEN
    RAISE EXCEPTION 'Nonprofit Management is not activated for this organisation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_mapped_account(_company_id UUID, _role TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  SELECT NULLIF(account_map->>_role, '')::UUID INTO _id
  FROM public.nonprofit_settings
  WHERE company_id = _company_id;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Account mapping % is required before this posting', _role;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = _id AND company_id = _company_id AND is_active AND is_postable AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Mapped account % is not postable in this organisation', _role;
  END IF;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_next_number(_company_id UUID, _kind TEXT, _prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _value BIGINT;
BEGIN
  INSERT INTO public.nonprofit_counters (company_id, kind, last_value)
  VALUES (_company_id, _kind, 1)
  ON CONFLICT (company_id, kind)
  DO UPDATE SET last_value = public.nonprofit_counters.last_value + 1
  RETURNING last_value INTO _value;
  RETURN _prefix || lpad(_value::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_post_balanced(
  _company_id UUID,
  _source_type TEXT,
  _source_id UUID,
  _journal_date DATE,
  _memo TEXT,
  _currency TEXT,
  _fx NUMERIC,
  _idempotency_key TEXT,
  _lines JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _journal UUID;
  _preexisting UUID;
  _clean JSONB := '[]'::JSONB;
  _elem JSONB;
  _ord BIGINT;
  _debit BIGINT;
  _credit BIGINT;
  _fund UUID;
  _account UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  PERFORM public.nonprofit_enabled(_company_id);
  IF NOT (
    public.has_company_permission(_company_id, 'accounting.post')
    OR public.has_company_permission(_company_id, 'journals.manual')
  ) THEN
    RAISE EXCEPTION 'Posting also requires accounting.post or journals.manual so the central ledger can accept the journal';
  END IF;
  IF _fx IS NULL OR _fx <= 0 THEN
    RAISE EXCEPTION 'fx_rate_to_base must be positive';
  END IF;
  IF _currency IS NULL OR length(_currency) <> 3 THEN
    RAISE EXCEPTION 'Invalid currency_code';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'Journal requires at least two lines';
  END IF;

  FOR _elem, _ord IN
    SELECT value, ordinality FROM jsonb_array_elements(_lines) WITH ORDINALITY
  LOOP
    _fund := NULLIF(_elem->>'fund_id', '')::UUID;
    _account := NULLIF(_elem->>'account_id', '')::UUID;
    _debit := COALESCE((_elem->>'debit_minor')::BIGINT, 0);
    _credit := COALESCE((_elem->>'credit_minor')::BIGINT, 0);
    IF _fund IS NULL OR _account IS NULL THEN
      RAISE EXCEPTION 'Line % needs a fund and an account', _ord;
    END IF;
    IF (_debit > 0 AND _credit > 0) OR (_debit = 0 AND _credit = 0) OR _debit < 0 OR _credit < 0 THEN
      RAISE EXCEPTION 'Line % must have a single positive side', _ord;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.nonprofit_funds f
      WHERE f.id = _fund AND f.company_id = _company_id AND f.status = 'active'
        AND (f.effective_on IS NULL OR f.effective_on <= _journal_date)
        AND (f.expires_on IS NULL OR f.expires_on >= _journal_date)
    ) THEN
      RAISE EXCEPTION 'Fund is not available for posting on %', _journal_date;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = _account AND a.company_id = _company_id
        AND a.is_active AND a.is_postable AND a.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Account is not postable in this organisation';
    END IF;
    _clean := _clean || jsonb_build_array(jsonb_build_object(
      'account_id', _account,
      'debit_minor', _debit,
      'credit_minor', _credit,
      'description', COALESCE(_elem->>'description', '')
    ));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT
        SUM(COALESCE((elem->>'debit_minor')::BIGINT, 0)) AS debits,
        SUM(COALESCE((elem->>'credit_minor')::BIGINT, 0)) AS credits
      FROM jsonb_array_elements(_lines) AS elem
    ) totals
    WHERE totals.debits <> totals.credits OR totals.debits = 0
  ) THEN
    RAISE EXCEPTION 'Journal does not balance';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT
        (elem->>'fund_id')::UUID AS fund_id,
        SUM(COALESCE((elem->>'debit_minor')::BIGINT, 0)) AS debits,
        SUM(COALESCE((elem->>'credit_minor')::BIGINT, 0)) AS credits
      FROM jsonb_array_elements(_lines) AS elem
      GROUP BY 1
    ) funds
    WHERE funds.debits <> funds.credits
  ) THEN
    RAISE EXCEPTION 'Fund lines do not balance';
  END IF;

  SELECT id INTO _preexisting FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idempotency_key;

  _journal := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _journal_date,
    'memo', _memo,
    'currency_code', upper(_currency),
    'fx_rate_to_base', _fx,
    'source_type', _source_type,
    'source_id', _source_id,
    'idempotency_key', _idempotency_key,
    'lines', _clean
  ));

  IF (SELECT count(*) FROM public.journal_lines WHERE journal_id = _journal) <> jsonb_array_length(_lines) THEN
    RAISE EXCEPTION 'Idempotency key was already used for a different journal';
  END IF;

  INSERT INTO public.nonprofit_fund_tags (company_id, journal_id, journal_line_id, line_no, fund_id)
  SELECT _company_id, jl.journal_id, jl.id, jl.line_no, (elems.elem->>'fund_id')::UUID
  FROM public.journal_lines jl
  JOIN (
    SELECT ordinality::INTEGER AS line_no, value AS elem
    FROM jsonb_array_elements(_lines) WITH ORDINALITY
  ) elems ON elems.line_no = jl.line_no
  WHERE jl.journal_id = _journal
  ON CONFLICT (journal_line_id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.nonprofit_fund_tags t
    JOIN public.journal_lines jl ON jl.id = t.journal_line_id
    JOIN (
      SELECT ordinality::INTEGER AS line_no, value AS elem
      FROM jsonb_array_elements(_lines) WITH ORDINALITY
    ) elems ON elems.line_no = jl.line_no
    WHERE t.journal_id = _journal
      AND t.fund_id IS DISTINCT FROM (elems.elem->>'fund_id')::UUID
  ) THEN
    RAISE EXCEPTION 'Idempotency key was already used for different fund tagging';
  END IF;

  IF _preexisting IS NULL THEN
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (
      _company_id, auth.uid(), 'nonprofit.posted', _source_type, _source_id,
      jsonb_build_object('journal_id', _journal, 'idempotency_key', _idempotency_key)
    );
  END IF;
  RETURN _journal;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_fund_spendable(
  _company_id UUID,
  _fund_id UUID,
  _as_of DATE
) RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assets BIGINT := 0;
  _liabilities BIGINT := 0;
  _principal BIGINT := 0;
  _category TEXT;
  _commitments BIGINT := 0;
BEGIN
  SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) INTO _assets
  FROM public.nonprofit_fund_tags t
  JOIN public.journal_lines jl ON jl.id = t.journal_line_id
  JOIN public.journals j ON j.id = jl.journal_id
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE t.company_id = _company_id AND t.fund_id = _fund_id
    AND j.company_id = _company_id AND j.status = 'posted' AND j.journal_date <= _as_of
    AND a.account_type = 'asset';

  SELECT COALESCE(SUM(jl.credit_minor - jl.debit_minor), 0) INTO _liabilities
  FROM public.nonprofit_fund_tags t
  JOIN public.journal_lines jl ON jl.id = t.journal_line_id
  JOIN public.journals j ON j.id = jl.journal_id
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE t.company_id = _company_id AND t.fund_id = _fund_id
    AND j.company_id = _company_id AND j.status = 'posted' AND j.journal_date <= _as_of
    AND a.account_type = 'liability';

  SELECT category INTO _category
  FROM public.nonprofit_funds
  WHERE id = _fund_id AND company_id = _company_id;
  SELECT COALESCE(principal_minor, 0) INTO _principal
  FROM public.nonprofit_endowments
  WHERE fund_id = _fund_id AND company_id = _company_id;

  IF to_regclass('public.nonprofit_commitments') IS NOT NULL THEN
    EXECUTE
      'SELECT COALESCE(SUM(amount_minor), 0) FROM public.nonprofit_commitments WHERE company_id = $1 AND fund_id = $2 AND status = ''open'''
      INTO _commitments
      USING _company_id, _fund_id;
  END IF;

  IF _category = 'endowment' THEN
    RETURN _assets - _liabilities - COALESCE(_principal, 0) - COALESCE(_commitments, 0);
  END IF;
  RETURN _assets - _liabilities - COALESCE(_commitments, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_upsert_settings(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.nonprofit_settings;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.admin');
  INSERT INTO public.nonprofit_settings (
    company_id, enabled, accounting_framework, country_code,
    allow_unrestricted_deficit, enforce_segregation, gateway_configured, account_map, updated_at
  ) VALUES (
    _company_id,
    COALESCE((_payload->>'enabled')::BOOLEAN, false),
    COALESCE(_payload->>'accounting_framework', 'configurable'),
    COALESCE(_payload->>'country_code', 'US'),
    COALESCE((_payload->>'allow_unrestricted_deficit')::BOOLEAN, false),
    COALESCE((_payload->>'enforce_segregation')::BOOLEAN, false),
    COALESCE((_payload->>'gateway_configured')::BOOLEAN, false),
    COALESCE(_payload->'account_map', '{}'::JSONB),
    now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    accounting_framework = EXCLUDED.accounting_framework,
    country_code = EXCLUDED.country_code,
    allow_unrestricted_deficit = EXCLUDED.allow_unrestricted_deficit,
    enforce_segregation = EXCLUDED.enforce_segregation,
    gateway_configured = EXCLUDED.gateway_configured,
    account_map = EXCLUDED.account_map,
    version = public.nonprofit_settings.version + 1,
    updated_at = now()
  RETURNING * INTO _row;
  RETURN jsonb_build_object(
    'company_id', _row.company_id,
    'enabled', _row.enabled,
    'accounting_framework', _row.accounting_framework,
    'country_code', _row.country_code,
    'allow_unrestricted_deficit', _row.allow_unrestricted_deficit,
    'enforce_segregation', _row.enforce_segregation,
    'gateway_configured', _row.gateway_configured,
    'account_map', _row.account_map,
    'version', _row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_fund(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.funds.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  INSERT INTO public.nonprofit_funds (
    company_id, code, name, description, classification, restriction, category,
    effective_on, expires_on, permitted_expenditure, created_by
  ) VALUES (
    _company_id,
    upper(trim(_payload->>'code')),
    trim(_payload->>'name'),
    NULLIF(_payload->>'description', ''),
    _payload->>'classification',
    _payload->>'restriction',
    _payload->>'category',
    NULLIF(_payload->>'effective_on', '')::DATE,
    NULLIF(_payload->>'expires_on', '')::DATE,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'permitted_expenditure', '[]'::JSONB))), '{}'),
    auth.uid()
  ) RETURNING id INTO _id;
  IF _payload->>'category' = 'endowment' THEN
    INSERT INTO public.nonprofit_endowments (fund_id, company_id, principal_minor)
    VALUES (_id, _company_id, COALESCE((_payload->>'principal_minor')::BIGINT, 0));
  END IF;
  RETURN jsonb_build_object('id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_close_fund(_company_id UUID, _fund_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _spendable BIGINT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.funds.manage');
  _spendable := public.nonprofit_fund_spendable(_company_id, _fund_id, CURRENT_DATE);
  IF _spendable <> 0 THEN
    RAISE EXCEPTION 'Fund cannot close while its available balance is %', _spendable;
  END IF;
  UPDATE public.nonprofit_funds
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE id = _fund_id AND company_id = _company_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active fund was not found';
  END IF;
  RETURN jsonb_build_object('id', _fund_id, 'status', 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_post_opening(_company_id UUID, _fund_id UUID, _amount_minor BIGINT, _on DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _restriction TEXT;
  _credit_role TEXT;
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.funds.manage');
  IF _amount_minor IS NULL OR _amount_minor <= 0 THEN
    RAISE EXCEPTION 'Opening balance must be positive';
  END IF;
  SELECT restriction INTO _restriction
  FROM public.nonprofit_funds
  WHERE id = _fund_id AND company_id = _company_id AND opening_posted = false AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fund opening was already posted or the fund is unavailable';
  END IF;
  _credit_role := CASE
    WHEN _restriction = 'unrestricted' THEN 'net_assets_without_restriction'
    ELSE 'net_assets_with_restriction'
  END;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_opening', _fund_id, _on, 'Fund opening balance',
    (SELECT base_currency FROM public.companies WHERE id = _company_id),
    1, 'np-opening-' || _fund_id::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', _amount_minor, 'credit_minor', 0, 'description', 'Opening cash'),
      jsonb_build_object('fund_id', _fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, _credit_role), 'debit_minor', 0, 'credit_minor', _amount_minor, 'description', 'Opening net assets')
    )
  );
  UPDATE public.nonprofit_funds SET opening_posted = true, updated_at = now()
  WHERE id = _fund_id AND company_id = _company_id;
  RETURN jsonb_build_object('journal_id', _journal);
END;
$$;
