-- PM-05/09/10 posting, payouts, reserves, portal access.
-- Additive and idempotent. Uses public.post_journal with source_type other (enum unchanged).
-- Clients SELECT under RLS; mutations use SECURITY DEFINER RPCs with permission checks.

-- ---------------------------------------------------------------------------
-- Document sequences
-- ---------------------------------------------------------------------------
INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'pm_owner_distribution', 'DIST-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- pm_settings: chart-of-accounts mappings
-- ---------------------------------------------------------------------------
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS rent_income_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS rent_receivable_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS owner_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS commission_income_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS trust_bank_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS deposit_liability_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.pm_settings
  ADD COLUMN IF NOT EXISTS operating_bank_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- pm_commission_calculations: ledger link
-- ---------------------------------------------------------------------------
ALTER TABLE public.pm_commission_calculations
  ADD COLUMN IF NOT EXISTS journal_id UUID;

-- ---------------------------------------------------------------------------
-- pm_owner_distributions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_owner_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.pm_owners(id) ON DELETE RESTRICT,
  property_id UUID REFERENCES public.pm_properties(id) ON DELETE SET NULL,
  statement_id UUID REFERENCES public.pm_owner_statements(id) ON DELETE SET NULL,
  distribution_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'posted', 'void', 'failed')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  payout_date DATE,
  memo TEXT,
  journal_id UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_owner_distributions_number_len CHECK (char_length(trim(distribution_number)) BETWEEN 1 AND 40),
  UNIQUE (company_id, distribution_number)
);

CREATE INDEX IF NOT EXISTS pm_owner_distributions_company_status_idx
  ON public.pm_owner_distributions (company_id, status, payout_date DESC);
CREATE INDEX IF NOT EXISTS pm_owner_distributions_owner_idx
  ON public.pm_owner_distributions (company_id, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pm_owner_distributions_statement_idx
  ON public.pm_owner_distributions (company_id, statement_id)
  WHERE statement_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- pm_owner_reserves
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_owner_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.pm_owners(id) ON DELETE SET NULL,
  reserve_type TEXT NOT NULL DEFAULT 'minimum'
    CHECK (reserve_type IN ('minimum', 'maintenance', 'custom')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_owner_reserves_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS pm_owner_reserves_property_idx
  ON public.pm_owner_reserves (company_id, property_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS pm_owner_reserves_owner_idx
  ON public.pm_owner_reserves (company_id, owner_id, effective_from DESC)
  WHERE owner_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- pm_portal_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  portal_role TEXT NOT NULL CHECK (portal_role IN ('owner', 'tenant')),
  owner_id UUID REFERENCES public.pm_owners(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.pm_tenants(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'revoked')),
  invited_email TEXT,
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, contact_id, portal_role)
);

CREATE INDEX IF NOT EXISTS pm_portal_access_company_status_idx
  ON public.pm_portal_access (company_id, status, portal_role);
CREATE INDEX IF NOT EXISTS pm_portal_access_owner_idx
  ON public.pm_portal_access (company_id, owner_id)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_portal_access_tenant_idx
  ON public.pm_portal_access (company_id, tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.pm_owner_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_owner_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_portal_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PM owner distributions select" ON public.pm_owner_distributions;
CREATE POLICY "PM owner distributions select"
  ON public.pm_owner_distributions FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'property.view')
      OR public.has_company_permission(company_id, 'property.statements.view')
      OR public.has_company_permission(company_id, 'property.payouts.prepare')
      OR public.has_company_permission(company_id, 'property.payouts.approve')
      OR public.has_company_permission(company_id, 'property.payouts.record')
    )
  );

DROP POLICY IF EXISTS "PM owner reserves select" ON public.pm_owner_reserves;
CREATE POLICY "PM owner reserves select"
  ON public.pm_owner_reserves FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'property.view')
      OR public.has_company_permission(company_id, 'property.manage')
    )
  );

DROP POLICY IF EXISTS "PM portal access select" ON public.pm_portal_access;
CREATE POLICY "PM portal access select"
  ON public.pm_portal_access FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'property.view')
      OR public.has_company_permission(company_id, 'property.settings.manage')
      OR public.has_company_permission(company_id, 'property.owner.view')
      OR public.has_company_permission(company_id, 'property.tenant.manage')
    )
  );

REVOKE ALL ON TABLE public.pm_owner_distributions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_owner_reserves FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_portal_access FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.pm_owner_distributions TO authenticated;
GRANT SELECT ON TABLE public.pm_owner_reserves TO authenticated;
GRANT SELECT ON TABLE public.pm_portal_access TO authenticated;

GRANT ALL ON TABLE public.pm_owner_distributions TO service_role;
GRANT ALL ON TABLE public.pm_owner_reserves TO service_role;
GRANT ALL ON TABLE public.pm_portal_access TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.pm_assert_company_account(
  _company_id UUID,
  _account_id UUID,
  _label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _account_id IS NULL THEN
    RAISE EXCEPTION '% account is required', _label;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _account_id
      AND a.company_id = _company_id
      AND a.is_active
      AND a.is_postable
      AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION '% is not an active postable account for this organisation', _label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_require_coa(_company_id UUID)
RETURNS public.pm_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _settings public.pm_settings%ROWTYPE;
BEGIN
  PERFORM private.pm_require_enabled(_company_id);
  SELECT * INTO _settings FROM public.pm_settings WHERE company_id = _company_id;
  IF _settings.rent_income_account_id IS NULL THEN
    RAISE EXCEPTION 'Property Management rent income account is not configured. Map accounts in Property Management Settings.';
  END IF;
  IF _settings.rent_receivable_account_id IS NULL THEN
    RAISE EXCEPTION 'Property Management rent receivable account is not configured. Map accounts in Property Management Settings.';
  END IF;
  IF _settings.owner_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'Property Management owner payable account is not configured. Map accounts in Property Management Settings.';
  END IF;
  IF _settings.commission_income_account_id IS NULL THEN
    RAISE EXCEPTION 'Property Management commission income account is not configured. Map accounts in Property Management Settings.';
  END IF;
  IF _settings.operating_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Property Management operating bank account is not configured. Map accounts in Property Management Settings.';
  END IF;
  RETURN _settings;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_settings_accounts_to_jsonb(_row public.pm_settings)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'rentIncomeAccountId', _row.rent_income_account_id,
    'rentReceivableAccountId', _row.rent_receivable_account_id,
    'ownerPayableAccountId', _row.owner_payable_account_id,
    'commissionIncomeAccountId', _row.commission_income_account_id,
    'trustBankAccountId', _row.trust_bank_account_id,
    'depositLiabilityAccountId', _row.deposit_liability_account_id,
    'operatingBankAccountId', _row.operating_bank_account_id
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_commission_calc_to_jsonb(_r public.pm_commission_calculations)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'feeRuleId', _r.fee_rule_id,
    'agreementId', _r.agreement_id,
    'propertyId', _r.property_id,
    'ownerId', _r.owner_id,
    'sourceType', _r.source_type,
    'sourceId', _r.source_id,
    'periodStart', _r.period_start,
    'periodEnd', _r.period_end,
    'baseAmountMinor', _r.base_amount_minor,
    'commissionMinor', _r.commission_minor,
    'currencyCode', _r.currency_code,
    'ruleSnapshot', _r.rule_snapshot,
    'status', _r.status,
    'journalId', _r.journal_id,
    'createdAt', _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_distribution_to_jsonb(_r public.pm_owner_distributions)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'ownerId', _r.owner_id,
    'propertyId', _r.property_id,
    'statementId', _r.statement_id,
    'distributionNumber', _r.distribution_number,
    'status', _r.status,
    'amountMinor', _r.amount_minor,
    'currencyCode', _r.currency_code,
    'payoutDate', _r.payout_date,
    'memo', _r.memo,
    'journalId', _r.journal_id,
    'approvedAt', _r.approved_at,
    'approvedBy', _r.approved_by,
    'postedAt', _r.posted_at,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_reserve_to_jsonb(_r public.pm_owner_reserves)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'propertyId', _r.property_id,
    'ownerId', _r.owner_id,
    'reserveType', _r.reserve_type,
    'amountMinor', _r.amount_minor,
    'currencyCode', _r.currency_code,
    'effectiveFrom', _r.effective_from,
    'effectiveTo', _r.effective_to,
    'notes', _r.notes,
    'createdAt', _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_portal_access_to_jsonb(_r public.pm_portal_access)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'contactId', _r.contact_id,
    'portalRole', _r.portal_role,
    'ownerId', _r.owner_id,
    'tenantId', _r.tenant_id,
    'status', _r.status,
    'invitedEmail', _r.invited_email,
    'invitedAt', _r.invited_at,
    'activatedAt', _r.activated_at,
    'revokedAt', _r.revoked_at,
    'createdAt', _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_require_portal_permission(_company_id UUID, _portal_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.has_company_permission(_company_id, 'property.settings.manage') THEN
    RETURN;
  END IF;
  IF _portal_role = 'owner' AND public.has_company_permission(_company_id, 'property.owner.manage') THEN
    RETURN;
  END IF;
  IF _portal_role = 'tenant' AND public.has_company_permission(_company_id, 'property.tenant.manage') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Missing permission to manage portal access' USING ERRCODE = '42501';
END;
$$;

-- ---------------------------------------------------------------------------
-- Settings RPCs (extended for COA mappings)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pm_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_settings%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');
  PERFORM private.pm_ensure_settings(_company_id);
  SELECT * INTO _row FROM public.pm_settings WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'companyId', _row.company_id,
    'enabled', _row.enabled,
    'defaultRentalMode', _row.default_rental_mode,
    'defaultBusinessModel', _row.default_business_model,
    'propertyNumberPrefix', _row.property_number_prefix,
    'requireOwnershipHundredPct', _row.require_ownership_hundred_pct,
    'version', _row.version,
    'updatedAt', _row.updated_at
  ) || private.pm_settings_accounts_to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_settings(
  _company_id UUID,
  _enabled BOOLEAN,
  _default_rental_mode TEXT DEFAULT NULL,
  _default_business_model TEXT DEFAULT NULL,
  _property_number_prefix TEXT DEFAULT NULL,
  _require_ownership_hundred_pct BOOLEAN DEFAULT NULL,
  _expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_settings%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.settings.manage');
  PERFORM private.pm_ensure_settings(_company_id);

  IF _default_rental_mode IS NOT NULL
     AND _default_rental_mode NOT IN ('short_term', 'long_term', 'hybrid') THEN
    RAISE EXCEPTION 'Invalid default rental mode';
  END IF;
  IF _default_business_model IS NOT NULL
     AND _default_business_model NOT IN ('agency', 'principal', 'owner_direct') THEN
    RAISE EXCEPTION 'Invalid default business model';
  END IF;

  UPDATE public.pm_settings
  SET
    enabled = COALESCE(_enabled, enabled),
    default_rental_mode = COALESCE(_default_rental_mode, default_rental_mode),
    default_business_model = COALESCE(_default_business_model, default_business_model),
    property_number_prefix = COALESCE(
      NULLIF(trim(_property_number_prefix), ''),
      property_number_prefix
    ),
    require_ownership_hundred_pct = COALESCE(
      _require_ownership_hundred_pct,
      require_ownership_hundred_pct
    ),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE company_id = _company_id
    AND (_expected_version IS NULL OR version = _expected_version)
  RETURNING * INTO _row;

  IF _row.company_id IS NULL THEN
    RAISE EXCEPTION 'Property Management settings were updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;

  RETURN public.get_pm_settings(_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_account_mappings(
  _company_id UUID,
  _rent_income_account_id UUID DEFAULT NULL,
  _rent_receivable_account_id UUID DEFAULT NULL,
  _owner_payable_account_id UUID DEFAULT NULL,
  _commission_income_account_id UUID DEFAULT NULL,
  _trust_bank_account_id UUID DEFAULT NULL,
  _deposit_liability_account_id UUID DEFAULT NULL,
  _operating_bank_account_id UUID DEFAULT NULL,
  _expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_settings%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.settings.manage');
  PERFORM private.pm_ensure_settings(_company_id);

  IF _rent_income_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _rent_income_account_id, 'Rent income');
  END IF;
  IF _rent_receivable_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _rent_receivable_account_id, 'Rent receivable');
  END IF;
  IF _owner_payable_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _owner_payable_account_id, 'Owner payable');
  END IF;
  IF _commission_income_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _commission_income_account_id, 'Commission income');
  END IF;
  IF _trust_bank_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _trust_bank_account_id, 'Trust bank');
  END IF;
  IF _deposit_liability_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _deposit_liability_account_id, 'Deposit liability');
  END IF;
  IF _operating_bank_account_id IS NOT NULL THEN
    PERFORM private.pm_assert_company_account(_company_id, _operating_bank_account_id, 'Operating bank');
  END IF;

  UPDATE public.pm_settings
  SET
    rent_income_account_id = COALESCE(_rent_income_account_id, rent_income_account_id),
    rent_receivable_account_id = COALESCE(_rent_receivable_account_id, rent_receivable_account_id),
    owner_payable_account_id = COALESCE(_owner_payable_account_id, owner_payable_account_id),
    commission_income_account_id = COALESCE(_commission_income_account_id, commission_income_account_id),
    trust_bank_account_id = COALESCE(_trust_bank_account_id, trust_bank_account_id),
    deposit_liability_account_id = COALESCE(_deposit_liability_account_id, deposit_liability_account_id),
    operating_bank_account_id = COALESCE(_operating_bank_account_id, operating_bank_account_id),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE company_id = _company_id
    AND (_expected_version IS NULL OR version = _expected_version)
  RETURNING * INTO _row;

  IF _row.company_id IS NULL THEN
    RAISE EXCEPTION 'Property Management settings were updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;

  RETURN public.get_pm_settings(_company_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Rent charge posting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_pm_rent_charge(
  _company_id UUID,
  _charge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _charge public.pm_rent_charges%ROWTYPE;
  _settings public.pm_settings%ROWTYPE;
  _journal_id UUID;
  _memo TEXT;
  _lines JSONB;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.rent.manage');
  _settings := private.pm_require_coa(_company_id);

  SELECT * INTO _charge
  FROM public.pm_rent_charges c
  WHERE c.id = _charge_id AND c.company_id = _company_id
  FOR UPDATE;

  IF _charge.id IS NULL THEN
    RAISE EXCEPTION 'Rent charge not found';
  END IF;

  IF _charge.status = 'posted' AND _charge.journal_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'charge', private.pm_rent_charge_to_jsonb(_charge),
      'journalId', _charge.journal_id
    );
  END IF;

  IF _charge.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft rent charges can be posted';
  END IF;
  IF _charge.amount_minor IS NULL OR _charge.amount_minor <= 0 THEN
    RAISE EXCEPTION 'Rent charge amount must be greater than zero';
  END IF;

  _memo := COALESCE(
    NULLIF(trim(_charge.description), ''),
    'PM rent charge ' || _charge.charge_number
  );

  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _settings.rent_receivable_account_id,
      'description', 'Rent receivable',
      'debit_minor', _charge.amount_minor,
      'credit_minor', 0
    ),
    jsonb_build_object(
      'account_id', _settings.rent_income_account_id,
      'description', 'Rent income',
      'debit_minor', 0,
      'credit_minor', _charge.amount_minor
    )
  );

  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _charge.due_date,
    'currency_code', _charge.currency_code,
    'fx_rate_to_base', 1,
    'source_type', 'other',
    'source_id', _charge.id,
    'idempotency_key', 'pm_rent_charge:' || _charge.id::text || ':post',
    'memo', _memo,
    'lines', _lines
  ));

  UPDATE public.pm_rent_charges SET
    status = 'posted',
    journal_id = _journal_id,
    updated_at = now()
  WHERE id = _charge_id AND company_id = _company_id
  RETURNING * INTO _charge;

  RETURN jsonb_build_object(
    'charge', private.pm_rent_charge_to_jsonb(_charge),
    'journalId', _journal_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Commission posting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_pm_commission(
  _company_id UUID,
  _calc_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _calc public.pm_commission_calculations%ROWTYPE;
  _settings public.pm_settings%ROWTYPE;
  _journal_id UUID;
  _memo TEXT;
  _lines JSONB;
  _journal_date DATE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.commission.manage');
  _settings := private.pm_require_coa(_company_id);

  SELECT * INTO _calc
  FROM public.pm_commission_calculations cc
  WHERE cc.id = _calc_id AND cc.company_id = _company_id
  FOR UPDATE;

  IF _calc.id IS NULL THEN
    RAISE EXCEPTION 'Commission calculation not found';
  END IF;

  IF _calc.status = 'posted' AND _calc.journal_id IS NOT NULL THEN
    RETURN private.pm_commission_calc_to_jsonb(_calc);
  END IF;

  IF _calc.status <> 'calculated' THEN
    RAISE EXCEPTION 'Only calculated commission rows can be posted';
  END IF;
  IF _calc.commission_minor IS NULL OR _calc.commission_minor <= 0 THEN
    RAISE EXCEPTION 'Commission amount must be greater than zero';
  END IF;

  _journal_date := COALESCE(_calc.period_end, _calc.period_start, CURRENT_DATE);
  _memo := 'PM commission ' || _calc.id::text;

  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _settings.owner_payable_account_id,
      'description', 'Owner payable (commission)',
      'debit_minor', _calc.commission_minor,
      'credit_minor', 0
    ),
    jsonb_build_object(
      'account_id', _settings.commission_income_account_id,
      'description', 'Commission income',
      'debit_minor', 0,
      'credit_minor', _calc.commission_minor
    )
  );

  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _journal_date,
    'currency_code', _calc.currency_code,
    'fx_rate_to_base', 1,
    'source_type', 'other',
    'source_id', _calc.id,
    'idempotency_key', 'pm_commission:' || _calc.id::text || ':post',
    'memo', _memo,
    'lines', _lines
  ));

  UPDATE public.pm_commission_calculations SET
    status = 'posted',
    journal_id = _journal_id
  WHERE id = _calc_id AND company_id = _company_id
  RETURNING * INTO _calc;

  RETURN private.pm_commission_calc_to_jsonb(_calc);
END;
$$;

-- ---------------------------------------------------------------------------
-- Owner distribution RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_owner_distributions(
  _company_id UUID,
  _owner_id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');

  RETURN COALESCE((
    SELECT jsonb_agg(
      private.pm_distribution_to_jsonb(d) ORDER BY d.created_at DESC, d.distribution_number DESC
    )
    FROM public.pm_owner_distributions d
    WHERE d.company_id = _company_id
      AND (_owner_id IS NULL OR d.owner_id = _owner_id)
      AND (_property_id IS NULL OR d.property_id = _property_id)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR d.status = _status)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_owner_distribution(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _statement_id UUID DEFAULT NULL,
  _amount_minor BIGINT DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _payout_date DATE DEFAULT NULL,
  _memo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_owner_distributions%ROWTYPE;
  _num TEXT;
  _owner public.pm_owners%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.payouts.prepare');
  PERFORM private.pm_require_enabled(_company_id);

  IF _id IS NULL THEN
    IF _owner_id IS NULL OR _amount_minor IS NULL OR _amount_minor <= 0 THEN
      RAISE EXCEPTION 'Owner and positive amount are required for a new distribution';
    END IF;

    SELECT * INTO _owner FROM public.pm_owners o
    WHERE o.id = _owner_id AND o.company_id = _company_id;
    IF _owner.id IS NULL THEN
      RAISE EXCEPTION 'Owner not found';
    END IF;

    IF _property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_properties p
      WHERE p.id = _property_id AND p.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Property not found';
    END IF;

    IF _statement_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_owner_statements s
      WHERE s.id = _statement_id AND s.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Statement not found';
    END IF;

    _num := private.pm_allocate_number(_company_id, 'pm_owner_distribution', 'DIST-');

    INSERT INTO public.pm_owner_distributions (
      company_id, owner_id, property_id, statement_id, distribution_number,
      status, amount_minor, currency_code, payout_date, memo
    ) VALUES (
      _company_id, _owner_id, _property_id, _statement_id, _num,
      'draft',
      _amount_minor,
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
      _payout_date,
      NULLIF(trim(_memo), '')
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row
    FROM public.pm_owner_distributions d
    WHERE d.id = _id AND d.company_id = _company_id
    FOR UPDATE;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Distribution not found';
    END IF;
    IF _row.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft distributions can be edited';
    END IF;

    IF _owner_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.pm_owners o WHERE o.id = _owner_id AND o.company_id = _company_id) THEN
        RAISE EXCEPTION 'Owner not found';
      END IF;
    END IF;
    IF _property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_properties p WHERE p.id = _property_id AND p.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Property not found';
    END IF;
    IF _statement_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_owner_statements s WHERE s.id = _statement_id AND s.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Statement not found';
    END IF;
    IF _amount_minor IS NOT NULL AND _amount_minor <= 0 THEN
      RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    UPDATE public.pm_owner_distributions SET
      owner_id = COALESCE(_owner_id, owner_id),
      property_id = CASE WHEN _property_id IS NOT NULL THEN _property_id ELSE property_id END,
      statement_id = CASE WHEN _statement_id IS NOT NULL THEN _statement_id ELSE statement_id END,
      amount_minor = COALESCE(_amount_minor, amount_minor),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      payout_date = COALESCE(_payout_date, payout_date),
      memo = COALESCE(NULLIF(trim(_memo), ''), memo),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  RETURN private.pm_distribution_to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_pm_owner_distribution(
  _company_id UUID,
  _distribution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_owner_distributions%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.payouts.approve');
  PERFORM private.pm_require_enabled(_company_id);

  SELECT * INTO _row
  FROM public.pm_owner_distributions d
  WHERE d.id = _distribution_id AND d.company_id = _company_id
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Distribution not found';
  END IF;
  IF _row.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft distributions can be approved';
  END IF;

  UPDATE public.pm_owner_distributions SET
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  WHERE id = _distribution_id AND company_id = _company_id
  RETURNING * INTO _row;

  RETURN private.pm_distribution_to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_pm_owner_distribution(
  _company_id UUID,
  _distribution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_owner_distributions%ROWTYPE;
  _settings public.pm_settings%ROWTYPE;
  _bank_account_id UUID;
  _journal_id UUID;
  _journal_date DATE;
  _memo TEXT;
  _lines JSONB;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.payouts.record');
  _settings := private.pm_require_coa(_company_id);

  SELECT * INTO _row
  FROM public.pm_owner_distributions d
  WHERE d.id = _distribution_id AND d.company_id = _company_id
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Distribution not found';
  END IF;

  IF _row.status = 'posted' AND _row.journal_id IS NOT NULL THEN
    RETURN private.pm_distribution_to_jsonb(_row);
  END IF;

  IF _row.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved distributions can be posted';
  END IF;

  _bank_account_id := COALESCE(_settings.trust_bank_account_id, _settings.operating_bank_account_id);
  IF _bank_account_id IS NULL THEN
    RAISE EXCEPTION 'No trust or operating bank account is configured for payouts';
  END IF;

  _journal_date := COALESCE(_row.payout_date, CURRENT_DATE);
  _memo := COALESCE(
    NULLIF(trim(_row.memo), ''),
    'Owner distribution ' || _row.distribution_number
  );

  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _settings.owner_payable_account_id,
      'description', 'Owner payable (distribution)',
      'debit_minor', _row.amount_minor,
      'credit_minor', 0
    ),
    jsonb_build_object(
      'account_id', _bank_account_id,
      'description', 'Owner payout',
      'debit_minor', 0,
      'credit_minor', _row.amount_minor
    )
  );

  BEGIN
    _journal_id := public.post_journal(jsonb_build_object(
      'company_id', _company_id,
      'journal_date', _journal_date,
      'currency_code', _row.currency_code,
      'fx_rate_to_base', 1,
      'source_type', 'other',
      'source_id', _row.id,
      'idempotency_key', 'pm_owner_distribution:' || _row.id::text || ':post',
      'memo', _memo,
      'lines', _lines
    ));
  EXCEPTION
    WHEN OTHERS THEN
      UPDATE public.pm_owner_distributions SET
        status = 'failed',
        updated_at = now()
      WHERE id = _distribution_id AND company_id = _company_id
      RETURNING * INTO _row;
      RAISE;
  END;

  UPDATE public.pm_owner_distributions SET
    status = 'posted',
    journal_id = _journal_id,
    posted_at = now(),
    payout_date = _journal_date,
    updated_at = now()
  WHERE id = _distribution_id AND company_id = _company_id
  RETURNING * INTO _row;

  RETURN private.pm_distribution_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Owner reserve RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_owner_reserves(
  _company_id UUID,
  _property_id UUID DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _as_of DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _on DATE := COALESCE(_as_of, CURRENT_DATE);
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');

  RETURN COALESCE((
    SELECT jsonb_agg(
      private.pm_reserve_to_jsonb(r) ORDER BY r.effective_from DESC, r.created_at DESC
    )
    FROM public.pm_owner_reserves r
    WHERE r.company_id = _company_id
      AND (_property_id IS NULL OR r.property_id = _property_id)
      AND (_owner_id IS NULL OR r.owner_id = _owner_id)
      AND r.effective_from <= _on
      AND (r.effective_to IS NULL OR r.effective_to >= _on)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_owner_reserve(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _reserve_type TEXT DEFAULT NULL,
  _amount_minor BIGINT DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _effective_from DATE DEFAULT NULL,
  _effective_to DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_owner_reserves%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _reserve_type IS NOT NULL AND _reserve_type NOT IN ('minimum', 'maintenance', 'custom') THEN
    RAISE EXCEPTION 'Invalid reserve type';
  END IF;

  IF _id IS NULL THEN
    IF _property_id IS NULL OR _effective_from IS NULL OR _amount_minor IS NULL THEN
      RAISE EXCEPTION 'Property, effective from and amount are required';
    END IF;
    IF _amount_minor < 0 THEN
      RAISE EXCEPTION 'Reserve amount cannot be negative';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.pm_properties p WHERE p.id = _property_id AND p.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Property not found';
    END IF;
    IF _owner_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_owners o WHERE o.id = _owner_id AND o.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Owner not found';
    END IF;
    IF _effective_to IS NOT NULL AND _effective_to < _effective_from THEN
      RAISE EXCEPTION 'Invalid effective date range';
    END IF;

    INSERT INTO public.pm_owner_reserves (
      company_id, property_id, owner_id, reserve_type, amount_minor,
      currency_code, effective_from, effective_to, notes
    ) VALUES (
      _company_id, _property_id, _owner_id,
      COALESCE(_reserve_type, 'minimum'),
      _amount_minor,
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
      _effective_from, _effective_to,
      NULLIF(trim(_notes), '')
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row FROM public.pm_owner_reserves r
    WHERE r.id = _id AND r.company_id = _company_id;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Reserve not found';
    END IF;

    IF _property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_properties p WHERE p.id = _property_id AND p.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Property not found';
    END IF;
    IF _owner_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_owners o WHERE o.id = _owner_id AND o.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Owner not found';
    END IF;
    IF _amount_minor IS NOT NULL AND _amount_minor < 0 THEN
      RAISE EXCEPTION 'Reserve amount cannot be negative';
    END IF;
    IF _effective_from IS NOT NULL AND _effective_to IS NOT NULL AND _effective_to < _effective_from THEN
      RAISE EXCEPTION 'Invalid effective date range';
    END IF;

    UPDATE public.pm_owner_reserves SET
      property_id = COALESCE(_property_id, property_id),
      owner_id = CASE WHEN _owner_id IS NOT NULL THEN _owner_id ELSE owner_id END,
      reserve_type = COALESCE(_reserve_type, reserve_type),
      amount_minor = COALESCE(_amount_minor, amount_minor),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      effective_from = COALESCE(_effective_from, effective_from),
      effective_to = CASE WHEN _effective_to IS NOT NULL THEN _effective_to ELSE effective_to END,
      notes = COALESCE(NULLIF(trim(_notes), ''), notes)
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  RETURN private.pm_reserve_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Portal access RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_portal_access(
  _company_id UUID,
  _portal_role TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');

  RETURN COALESCE((
    SELECT jsonb_agg(
      private.pm_portal_access_to_jsonb(p) ORDER BY p.created_at DESC
    )
    FROM public.pm_portal_access p
    WHERE p.company_id = _company_id
      AND (_portal_role IS NULL OR _portal_role = '' OR _portal_role = 'all' OR p.portal_role = _portal_role)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR p.status = _status)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_portal_access(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _contact_id UUID DEFAULT NULL,
  _portal_role TEXT DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _tenant_id UUID DEFAULT NULL,
  _invited_email TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_portal_access%ROWTYPE;
  _role TEXT;
BEGIN
  PERFORM private.pm_require_enabled(_company_id);

  IF _id IS NULL THEN
    IF _contact_id IS NULL OR _portal_role IS NULL THEN
      RAISE EXCEPTION 'Contact and portal role are required';
    END IF;
    IF _portal_role NOT IN ('owner', 'tenant') THEN
      RAISE EXCEPTION 'Invalid portal role';
    END IF;
    PERFORM private.pm_require_portal_permission(_company_id, _portal_role);

    IF NOT EXISTS (
      SELECT 1 FROM public.contacts c WHERE c.id = _contact_id AND c.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Contact not found';
    END IF;

    IF _portal_role = 'owner' THEN
      IF _owner_id IS NULL THEN
        RAISE EXCEPTION 'Owner is required for owner portal access';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.pm_owners o WHERE o.id = _owner_id AND o.company_id = _company_id) THEN
        RAISE EXCEPTION 'Owner not found';
      END IF;
    END IF;

    IF _portal_role = 'tenant' THEN
      IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant is required for tenant portal access';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.pm_tenants t WHERE t.id = _tenant_id AND t.company_id = _company_id) THEN
        RAISE EXCEPTION 'Tenant not found';
      END IF;
    END IF;

    _role := COALESCE(_status, 'invited');
    IF _role NOT IN ('invited', 'active') THEN
      _role := 'invited';
    END IF;

    INSERT INTO public.pm_portal_access (
      company_id, contact_id, portal_role, owner_id, tenant_id, status,
      invited_email, invited_at, activated_at
    ) VALUES (
      _company_id, _contact_id, _portal_role, _owner_id, _tenant_id,
      _role,
      NULLIF(trim(_invited_email), ''),
      CASE WHEN _role IN ('invited', 'active') THEN now() ELSE NULL END,
      CASE WHEN _role = 'active' THEN now() ELSE NULL END
    )
    ON CONFLICT (company_id, contact_id, portal_role) DO UPDATE SET
      owner_id = COALESCE(EXCLUDED.owner_id, public.pm_portal_access.owner_id),
      tenant_id = COALESCE(EXCLUDED.tenant_id, public.pm_portal_access.tenant_id),
      invited_email = COALESCE(EXCLUDED.invited_email, public.pm_portal_access.invited_email),
      status = CASE
        WHEN public.pm_portal_access.status = 'revoked' THEN EXCLUDED.status
        ELSE public.pm_portal_access.status
      END
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row FROM public.pm_portal_access p
    WHERE p.id = _id AND p.company_id = _company_id;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Portal access record not found';
    END IF;

    PERFORM private.pm_require_portal_permission(_company_id, _row.portal_role);

    IF _portal_role IS NOT NULL AND _portal_role NOT IN ('owner', 'tenant') THEN
      RAISE EXCEPTION 'Invalid portal role';
    END IF;
    IF _status IS NOT NULL AND _status NOT IN ('invited', 'active', 'revoked') THEN
      RAISE EXCEPTION 'Invalid portal status';
    END IF;

    IF _owner_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_owners o WHERE o.id = _owner_id AND o.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Owner not found';
    END IF;
    IF _tenant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_tenants t WHERE t.id = _tenant_id AND t.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Tenant not found';
    END IF;

    UPDATE public.pm_portal_access SET
      owner_id = COALESCE(_owner_id, owner_id),
      tenant_id = COALESCE(_tenant_id, tenant_id),
      invited_email = COALESCE(NULLIF(trim(_invited_email), ''), invited_email),
      status = COALESCE(_status, status),
      invited_at = CASE
        WHEN COALESCE(_status, status) = 'invited' AND invited_at IS NULL THEN now()
        ELSE invited_at
      END,
      activated_at = CASE
        WHEN COALESCE(_status, status) = 'active' THEN COALESCE(activated_at, now())
        ELSE activated_at
      END,
      revoked_at = CASE
        WHEN COALESCE(_status, status) = 'revoked' THEN COALESCE(revoked_at, now())
        ELSE revoked_at
      END
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  RETURN private.pm_portal_access_to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_pm_portal_access(
  _company_id UUID,
  _id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_portal_access%ROWTYPE;
BEGIN
  PERFORM private.pm_require_enabled(_company_id);

  SELECT * INTO _row FROM public.pm_portal_access p
  WHERE p.id = _id AND p.company_id = _company_id
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Portal access record not found';
  END IF;

  PERFORM private.pm_require_portal_permission(_company_id, _row.portal_role);

  UPDATE public.pm_portal_access SET
    status = 'revoked',
    revoked_at = now()
  WHERE id = _id AND company_id = _company_id
  RETURNING * INTO _row;

  RETURN private.pm_portal_access_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Trust / payout summary (no bank balance claims)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pm_trust_summary(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _settings public.pm_settings%ROWTYPE;
  _can BOOLEAN := false;
BEGIN
  PERFORM private.pm_ensure_settings(_company_id);
  SELECT * INTO _settings FROM public.pm_settings WHERE company_id = _company_id;

  _can := public.is_company_member(_company_id)
    AND (
      public.has_company_permission(_company_id, 'property.trust.reconcile')
      OR public.has_company_permission(_company_id, 'property.view')
    );
  IF NOT _can THEN
    RAISE EXCEPTION 'Missing permission' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'trustBankAccountId', _settings.trust_bank_account_id,
    'trustBankMapped', _settings.trust_bank_account_id IS NOT NULL,
    'operatingBankMapped', _settings.operating_bank_account_id IS NOT NULL,
    'coaReady', (
      _settings.rent_income_account_id IS NOT NULL
      AND _settings.rent_receivable_account_id IS NOT NULL
      AND _settings.owner_payable_account_id IS NOT NULL
      AND _settings.commission_income_account_id IS NOT NULL
      AND _settings.operating_bank_account_id IS NOT NULL
    ),
    'openDistributionDraftCount', (
      SELECT count(*)::int FROM public.pm_owner_distributions d
      WHERE d.company_id = _company_id AND d.status = 'draft'
    ),
    'postedDistributionTotalMinor', COALESCE((
      SELECT sum(d.amount_minor) FROM public.pm_owner_distributions d
      WHERE d.company_id = _company_id AND d.status = 'posted'
    ), 0),
    'activePortalCount', (
      SELECT count(*)::int FROM public.pm_portal_access p
      WHERE p.company_id = _company_id AND p.status = 'active'
    ),
    'reserveTotalMinor', COALESCE((
      SELECT sum(r.amount_minor) FROM public.pm_owner_reserves r
      WHERE r.company_id = _company_id
        AND r.effective_from <= CURRENT_DATE
        AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
    ), 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_pm_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pm_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, INTEGER
) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_pm_account_mappings(
  UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_pm_account_mappings(
  UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, INTEGER
) TO authenticated;

REVOKE ALL ON FUNCTION public.post_pm_rent_charge(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_pm_rent_charge(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.post_pm_commission(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_pm_commission(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_owner_distributions(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_owner_distribution(
  UUID, UUID, UUID, UUID, UUID, BIGINT, TEXT, DATE, TEXT
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_pm_owner_distribution(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_pm_owner_distribution(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_owner_distributions(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_owner_distribution(
  UUID, UUID, UUID, UUID, UUID, BIGINT, TEXT, DATE, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pm_owner_distribution(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_pm_owner_distribution(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_owner_reserves(UUID, UUID, UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_owner_reserve(
  UUID, UUID, UUID, UUID, TEXT, BIGINT, TEXT, DATE, DATE, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_owner_reserves(UUID, UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_owner_reserve(
  UUID, UUID, UUID, UUID, TEXT, BIGINT, TEXT, DATE, DATE, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_portal_access(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_portal_access(
  UUID, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_pm_portal_access(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_portal_access(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_portal_access(
  UUID, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pm_portal_access(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_pm_trust_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pm_trust_summary(UUID) TO authenticated;