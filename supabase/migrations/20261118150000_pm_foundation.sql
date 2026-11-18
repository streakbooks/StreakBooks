-- PM-01 foundation: settings, properties, units, owners, ownership, management agreements.
-- Additive and idempotent. Does not post journals or create a second ledger.
-- Clients SELECT under RLS; mutations use SECURITY DEFINER RPCs with permission checks.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'property.view'),
  ('admin', 'property.view'),
  ('accountant', 'property.view'),
  ('bookkeeper', 'property.view'),
  ('staff', 'property.view'),
  ('read_only', 'property.view'),

  ('owner', 'property.manage'),
  ('admin', 'property.manage'),
  ('accountant', 'property.manage'),
  ('bookkeeper', 'property.manage'),
  ('staff', 'property.manage'),

  ('owner', 'property.owner.view'),
  ('admin', 'property.owner.view'),
  ('accountant', 'property.owner.view'),
  ('bookkeeper', 'property.owner.view'),
  ('staff', 'property.owner.view'),
  ('read_only', 'property.owner.view'),

  ('owner', 'property.owner.manage'),
  ('admin', 'property.owner.manage'),
  ('accountant', 'property.owner.manage'),

  ('owner', 'property.tenant.manage'),
  ('admin', 'property.tenant.manage'),
  ('accountant', 'property.tenant.manage'),
  ('staff', 'property.tenant.manage'),

  ('owner', 'property.lease.manage'),
  ('admin', 'property.lease.manage'),
  ('accountant', 'property.lease.manage'),
  ('staff', 'property.lease.manage'),

  ('owner', 'property.reservation.manage'),
  ('admin', 'property.reservation.manage'),
  ('accountant', 'property.reservation.manage'),
  ('staff', 'property.reservation.manage'),

  ('owner', 'property.rent.manage'),
  ('admin', 'property.rent.manage'),
  ('accountant', 'property.rent.manage'),
  ('bookkeeper', 'property.rent.manage'),
  ('staff', 'property.rent.manage'),

  ('owner', 'property.expenses.manage'),
  ('admin', 'property.expenses.manage'),
  ('accountant', 'property.expenses.manage'),
  ('bookkeeper', 'property.expenses.manage'),
  ('staff', 'property.expenses.manage'),

  ('owner', 'property.commission.manage'),
  ('admin', 'property.commission.manage'),
  ('accountant', 'property.commission.manage'),

  ('owner', 'property.statements.view'),
  ('admin', 'property.statements.view'),
  ('accountant', 'property.statements.view'),
  ('bookkeeper', 'property.statements.view'),
  ('staff', 'property.statements.view'),
  ('read_only', 'property.statements.view'),

  ('owner', 'property.statements.generate'),
  ('admin', 'property.statements.generate'),
  ('accountant', 'property.statements.generate'),
  ('bookkeeper', 'property.statements.generate'),

  ('owner', 'property.statements.approve'),
  ('admin', 'property.statements.approve'),
  ('accountant', 'property.statements.approve'),

  ('owner', 'property.statements.publish'),
  ('admin', 'property.statements.publish'),
  ('accountant', 'property.statements.publish'),

  ('owner', 'property.payouts.prepare'),
  ('admin', 'property.payouts.prepare'),
  ('accountant', 'property.payouts.prepare'),
  ('bookkeeper', 'property.payouts.prepare'),

  ('owner', 'property.payouts.approve'),
  ('admin', 'property.payouts.approve'),
  ('accountant', 'property.payouts.approve'),

  ('owner', 'property.payouts.record'),
  ('admin', 'property.payouts.record'),
  ('accountant', 'property.payouts.record'),
  ('bookkeeper', 'property.payouts.record'),

  ('owner', 'property.trust.reconcile'),
  ('admin', 'property.trust.reconcile'),
  ('accountant', 'property.trust.reconcile'),

  ('owner', 'property.reports.view'),
  ('admin', 'property.reports.view'),
  ('accountant', 'property.reports.view'),
  ('bookkeeper', 'property.reports.view'),
  ('read_only', 'property.reports.view'),

  ('owner', 'property.reports.export'),
  ('admin', 'property.reports.export'),
  ('accountant', 'property.reports.export'),

  ('owner', 'property.integrations.manage'),
  ('admin', 'property.integrations.manage'),

  ('owner', 'property.settings.manage'),
  ('admin', 'property.settings.manage'),
  ('accountant', 'property.settings.manage'),

  ('owner', 'property.audit.view'),
  ('admin', 'property.audit.view'),
  ('accountant', 'property.audit.view'),
  ('bookkeeper', 'property.audit.view')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  default_rental_mode TEXT NOT NULL DEFAULT 'hybrid'
    CHECK (default_rental_mode IN ('short_term', 'long_term', 'hybrid')),
  default_business_model TEXT NOT NULL DEFAULT 'agency'
    CHECK (default_business_model IN ('agency', 'principal', 'owner_direct')),
  property_number_prefix TEXT NOT NULL DEFAULT 'PROP-'
    CHECK (char_length(trim(property_number_prefix)) BETWEEN 1 AND 12),
  require_ownership_hundred_pct BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rental_mode TEXT NOT NULL DEFAULT 'hybrid'
    CHECK (rental_mode IN ('short_term', 'long_term', 'hybrid')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  country_code CHAR(2),
  region TEXT,
  city TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  timezone TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms NUMERIC(5, 2) CHECK (bathrooms IS NULL OR bathrooms >= 0),
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  furnished BOOLEAN,
  acquisition_date DATE,
  commencement_date DATE,
  inactive_date DATE,
  notes TEXT,
  manager_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_properties_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT pm_properties_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_properties_company_code_uidx
  ON public.pm_properties (company_id, lower(code));
CREATE INDEX IF NOT EXISTS pm_properties_company_status_idx
  ON public.pm_properties (company_id, status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Units
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  floor_label TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms NUMERIC(5, 2) CHECK (bathrooms IS NULL OR bathrooms >= 0),
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  furnished BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_units_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT pm_units_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_units_property_code_uidx
  ON public.pm_units (property_id, lower(code));
CREATE INDEX IF NOT EXISTS pm_units_company_property_idx
  ON public.pm_units (company_id, property_id, status);

-- ---------------------------------------------------------------------------
-- Owners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  statement_delivery_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_owners_display_name_len CHECK (char_length(trim(display_name)) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_owners_company_contact_uidx
  ON public.pm_owners (company_id, contact_id);
CREATE INDEX IF NOT EXISTS pm_owners_company_status_idx
  ON public.pm_owners (company_id, status);

-- ---------------------------------------------------------------------------
-- Property ownership (effective-dated)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_property_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.pm_owners(id) ON DELETE CASCADE,
  ownership_pct NUMERIC(7, 4) NOT NULL
    CHECK (ownership_pct >= 0 AND ownership_pct <= 100),
  distribution_pct NUMERIC(7, 4) NOT NULL
    CHECK (distribution_pct >= 0 AND distribution_pct <= 100),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_property_ownership_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS pm_property_ownership_property_idx
  ON public.pm_property_ownership (property_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS pm_property_ownership_owner_idx
  ON public.pm_property_ownership (company_id, owner_id);

-- ---------------------------------------------------------------------------
-- Management agreements (versioned)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_management_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.pm_owners(id) ON DELETE SET NULL,
  version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'superseded', 'terminated')),
  business_model TEXT NOT NULL DEFAULT 'agency'
    CHECK (business_model IN ('agency', 'principal', 'owner_direct')),
  fee_type TEXT NOT NULL DEFAULT 'percent_gross'
    CHECK (fee_type IN (
      'percent_gross', 'percent_net', 'percent_accommodation', 'percent_collected',
      'fixed_monthly', 'fixed_per_booking', 'tiered', 'custom'
    )),
  fee_rate_pct NUMERIC(7, 4)
    CHECK (fee_rate_pct IS NULL OR (fee_rate_pct >= 0 AND fee_rate_pct <= 100)),
  fee_fixed_minor BIGINT CHECK (fee_fixed_minor IS NULL OR fee_fixed_minor >= 0),
  minimum_monthly_fee_minor BIGINT
    CHECK (minimum_monthly_fee_minor IS NULL OR minimum_monthly_fee_minor >= 0),
  minimum_reserve_minor BIGINT
    CHECK (minimum_reserve_minor IS NULL OR minimum_reserve_minor >= 0),
  payout_frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payout_frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'manual')),
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_management_agreements_date_range CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS pm_management_agreements_property_idx
  ON public.pm_management_agreements (property_id, version_no DESC);
CREATE INDEX IF NOT EXISTS pm_management_agreements_company_status_idx
  ON public.pm_management_agreements (company_id, status);

-- Document sequences for property codes
INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'pm_property', 'PROP-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_property_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_management_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PM settings select" ON public.pm_settings;
CREATE POLICY "PM settings select"
  ON public.pm_settings FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'property.view')
      OR public.has_company_permission(company_id, 'property.settings.manage')
    )
  );

DROP POLICY IF EXISTS "PM properties select" ON public.pm_properties;
CREATE POLICY "PM properties select"
  ON public.pm_properties FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM units select" ON public.pm_units;
CREATE POLICY "PM units select"
  ON public.pm_units FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM owners select" ON public.pm_owners;
CREATE POLICY "PM owners select"
  ON public.pm_owners FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.owner.view')
  );

DROP POLICY IF EXISTS "PM ownership select" ON public.pm_property_ownership;
CREATE POLICY "PM ownership select"
  ON public.pm_property_ownership FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.owner.view')
  );

DROP POLICY IF EXISTS "PM management agreements select" ON public.pm_management_agreements;
CREATE POLICY "PM management agreements select"
  ON public.pm_management_agreements FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

REVOKE ALL ON TABLE public.pm_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_properties FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_units FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_owners FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_property_ownership FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_management_agreements FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.pm_settings TO authenticated;
GRANT SELECT ON TABLE public.pm_properties TO authenticated;
GRANT SELECT ON TABLE public.pm_units TO authenticated;
GRANT SELECT ON TABLE public.pm_owners TO authenticated;
GRANT SELECT ON TABLE public.pm_property_ownership TO authenticated;
GRANT SELECT ON TABLE public.pm_management_agreements TO authenticated;

GRANT ALL ON TABLE public.pm_settings TO service_role;
GRANT ALL ON TABLE public.pm_properties TO service_role;
GRANT ALL ON TABLE public.pm_units TO service_role;
GRANT ALL ON TABLE public.pm_owners TO service_role;
GRANT ALL ON TABLE public.pm_property_ownership TO service_role;
GRANT ALL ON TABLE public.pm_management_agreements TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.pm_require_permission(_company_id UUID, _permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, _permission) THEN
    RAISE EXCEPTION 'Missing permission %', _permission USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_allocate_number(
  _company_id UUID,
  _document_type TEXT,
  _fallback_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _prefix TEXT;
  _next BIGINT;
  _padding INT;
BEGIN
  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES (_company_id, _document_type, _fallback_prefix, 1, 4)
  ON CONFLICT (company_id, document_type) DO NOTHING;

  UPDATE public.document_sequences
  SET next_number = next_number + 1
  WHERE company_id = _company_id AND document_type = _document_type
  RETURNING prefix, next_number - 1, padding INTO _prefix, _next, _padding;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Could not allocate % number', _document_type;
  END IF;
  RETURN _prefix || lpad(_next::text, GREATEST(_padding, 1), '0');
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_ensure_settings(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.pm_settings (company_id)
  VALUES (_company_id)
  ON CONFLICT (company_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_require_enabled(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _enabled BOOLEAN;
BEGIN
  PERFORM private.pm_ensure_settings(_company_id);
  SELECT enabled INTO _enabled FROM public.pm_settings WHERE company_id = _company_id;
  IF NOT COALESCE(_enabled, false) THEN
    RAISE EXCEPTION 'Property Management is disabled for this organisation. Enable it in Property Management Settings.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_validate_ownership_sum(_company_id UUID, _property_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _require BOOLEAN;
  _open_count BIGINT;
  _sum NUMERIC;
BEGIN
  SELECT require_ownership_hundred_pct INTO _require
  FROM public.pm_settings
  WHERE company_id = _company_id;

  IF NOT COALESCE(_require, false) THEN
    RETURN;
  END IF;

  SELECT count(*), COALESCE(sum(ownership_pct), 0)
  INTO _open_count, _sum
  FROM public.pm_property_ownership
  WHERE company_id = _company_id
    AND property_id = _property_id
    AND effective_to IS NULL;

  IF _open_count > 0 AND round(_sum, 4) <> 100 THEN
    RAISE EXCEPTION 'Open ownership shares must total 100%% (current %)', _sum;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_property_to_jsonb(_r public.pm_properties)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'code', _r.code,
    'name', _r.name,
    'rentalMode', _r.rental_mode,
    'status', _r.status,
    'currencyCode', _r.currency_code,
    'countryCode', _r.country_code,
    'region', _r.region,
    'city', _r.city,
    'addressLine1', _r.address_line1,
    'addressLine2', _r.address_line2,
    'postalCode', _r.postal_code,
    'timezone', _r.timezone,
    'bedrooms', _r.bedrooms,
    'bathrooms', _r.bathrooms,
    'capacity', _r.capacity,
    'furnished', _r.furnished,
    'acquisitionDate', _r.acquisition_date,
    'commencementDate', _r.commencement_date,
    'inactiveDate', _r.inactive_date,
    'notes', _r.notes,
    'managerContactId', _r.manager_contact_id,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_unit_to_jsonb(_r public.pm_units)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'propertyId', _r.property_id,
    'code', _r.code,
    'name', _r.name,
    'status', _r.status,
    'floorLabel', _r.floor_label,
    'bedrooms', _r.bedrooms,
    'bathrooms', _r.bathrooms,
    'capacity', _r.capacity,
    'furnished', _r.furnished,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_owner_to_jsonb(
  _r public.pm_owners,
  _contact_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'contactId', _r.contact_id,
    'contactName', _contact_name,
    'displayName', _r.display_name,
    'status', _r.status,
    'statementDeliveryEmail', _r.statement_delivery_email,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_ownership_to_jsonb(
  _r public.pm_property_ownership,
  _owner_display_name TEXT DEFAULT NULL
)
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
    'ownerDisplayName', _owner_display_name,
    'ownershipPct', _r.ownership_pct,
    'distributionPct', _r.distribution_pct,
    'effectiveFrom', _r.effective_from,
    'effectiveTo', _r.effective_to,
    'createdAt', _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_agreement_to_jsonb(_r public.pm_management_agreements)
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
    'versionNo', _r.version_no,
    'status', _r.status,
    'businessModel', _r.business_model,
    'feeType', _r.fee_type,
    'feeRatePct', _r.fee_rate_pct,
    'feeFixedMinor', _r.fee_fixed_minor,
    'minimumMonthlyFeeMinor', _r.minimum_monthly_fee_minor,
    'minimumReserveMinor', _r.minimum_reserve_minor,
    'payoutFrequency', _r.payout_frequency,
    'startDate', _r.start_date,
    'endDate', _r.end_date,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

-- ---------------------------------------------------------------------------
-- Settings RPCs
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
  );
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

REVOKE ALL ON FUNCTION public.get_pm_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pm_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_settings(
  UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN, INTEGER
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard KPIs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pm_dashboard_kpis(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _enabled BOOLEAN := false;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');
  PERFORM private.pm_ensure_settings(_company_id);

  SELECT enabled INTO _enabled FROM public.pm_settings WHERE company_id = _company_id;

  RETURN jsonb_build_object(
    'propertyCount', (
      SELECT count(*) FROM public.pm_properties p
      WHERE p.company_id = _company_id AND p.status <> 'archived'
    ),
    'unitCount', (
      SELECT count(*) FROM public.pm_units u
      WHERE u.company_id = _company_id AND u.status <> 'archived'
    ),
    'ownerCount', (
      SELECT count(*) FROM public.pm_owners o
      WHERE o.company_id = _company_id AND o.status = 'active'
    ),
    'activeAgreementCount', (
      SELECT count(*) FROM public.pm_management_agreements a
      WHERE a.company_id = _company_id AND a.status = 'active'
    ),
    'enabled', COALESCE(_enabled, false),
    'currencyNote', 'KPIs are counts only until financial posting batches land.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pm_dashboard_kpis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pm_dashboard_kpis(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Property RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_properties(
  _company_id UUID,
  _search TEXT DEFAULT NULL,
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
    SELECT jsonb_agg(private.pm_property_to_jsonb(p) ORDER BY p.updated_at DESC)
    FROM public.pm_properties p
    WHERE p.company_id = _company_id
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR p.status = _status)
      AND (
        _search IS NULL OR trim(_search) = ''
        OR p.name ILIKE '%' || trim(_search) || '%'
        OR p.code ILIKE '%' || trim(_search) || '%'
        OR COALESCE(p.city, '') ILIKE '%' || trim(_search) || '%'
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_property(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _code TEXT DEFAULT NULL,
  _name TEXT DEFAULT NULL,
  _rental_mode TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _country_code TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _city TEXT DEFAULT NULL,
  _address_line1 TEXT DEFAULT NULL,
  _address_line2 TEXT DEFAULT NULL,
  _postal_code TEXT DEFAULT NULL,
  _timezone TEXT DEFAULT NULL,
  _bedrooms INTEGER DEFAULT NULL,
  _bathrooms NUMERIC DEFAULT NULL,
  _capacity INTEGER DEFAULT NULL,
  _furnished BOOLEAN DEFAULT NULL,
  _acquisition_date DATE DEFAULT NULL,
  _commencement_date DATE DEFAULT NULL,
  _inactive_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _manager_contact_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _settings public.pm_settings%ROWTYPE;
  _code TEXT;
  _row public.pm_properties%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.manage');
  PERFORM private.pm_require_enabled(_company_id);
  SELECT * INTO _settings FROM public.pm_settings WHERE company_id = _company_id;

  IF _name IS NULL OR char_length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Property name is required';
  END IF;

  IF _rental_mode IS NOT NULL
     AND _rental_mode NOT IN ('short_term', 'long_term', 'hybrid') THEN
    RAISE EXCEPTION 'Invalid rental mode';
  END IF;

  IF COALESCE(_status, 'draft') NOT IN ('draft', 'active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'Invalid property status';
  END IF;

  IF _manager_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = _manager_contact_id AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Manager contact not found in this organisation';
  END IF;

  IF _id IS NULL THEN
    _code := NULLIF(trim(_code), '');
    IF _code IS NULL THEN
      _code := private.pm_allocate_number(
        _company_id, 'pm_property', _settings.property_number_prefix
      );
    END IF;

    INSERT INTO public.pm_properties (
      company_id, code, name, rental_mode, status, currency_code, country_code,
      region, city, address_line1, address_line2, postal_code, timezone,
      bedrooms, bathrooms, capacity, furnished, acquisition_date, commencement_date,
      inactive_date, notes, manager_contact_id, updated_by
    ) VALUES (
      _company_id,
      _code,
      trim(_name),
      COALESCE(_rental_mode, _settings.default_rental_mode, 'hybrid'),
      COALESCE(_status, 'draft'),
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
      NULLIF(upper(trim(_country_code)), ''),
      NULLIF(trim(_region), ''),
      NULLIF(trim(_city), ''),
      NULLIF(trim(_address_line1), ''),
      NULLIF(trim(_address_line2), ''),
      NULLIF(trim(_postal_code), ''),
      NULLIF(trim(_timezone), ''),
      _bedrooms,
      _bathrooms,
      _capacity,
      _furnished,
      _acquisition_date,
      _commencement_date,
      _inactive_date,
      NULLIF(trim(_notes), ''),
      _manager_contact_id,
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_properties SET
      code = COALESCE(NULLIF(trim(_code), ''), code),
      name = trim(_name),
      rental_mode = COALESCE(_rental_mode, rental_mode),
      status = COALESCE(_status, status),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      country_code = CASE
        WHEN _country_code IS NOT NULL THEN NULLIF(upper(trim(_country_code)), '')
        ELSE country_code
      END,
      region = CASE WHEN _region IS NOT NULL THEN NULLIF(trim(_region), '') ELSE region END,
      city = CASE WHEN _city IS NOT NULL THEN NULLIF(trim(_city), '') ELSE city END,
      address_line1 = CASE
        WHEN _address_line1 IS NOT NULL THEN NULLIF(trim(_address_line1), '') ELSE address_line1
      END,
      address_line2 = CASE
        WHEN _address_line2 IS NOT NULL THEN NULLIF(trim(_address_line2), '') ELSE address_line2
      END,
      postal_code = CASE
        WHEN _postal_code IS NOT NULL THEN NULLIF(trim(_postal_code), '') ELSE postal_code
      END,
      timezone = CASE WHEN _timezone IS NOT NULL THEN NULLIF(trim(_timezone), '') ELSE timezone END,
      bedrooms = COALESCE(_bedrooms, bedrooms),
      bathrooms = COALESCE(_bathrooms, bathrooms),
      capacity = COALESCE(_capacity, capacity),
      furnished = COALESCE(_furnished, furnished),
      acquisition_date = COALESCE(_acquisition_date, acquisition_date),
      commencement_date = COALESCE(_commencement_date, commencement_date),
      inactive_date = CASE
        WHEN _inactive_date IS NOT NULL THEN _inactive_date
        WHEN COALESCE(_status, status) = 'inactive' AND inactive_date IS NULL THEN CURRENT_DATE
        ELSE inactive_date
      END,
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      manager_contact_id = COALESCE(_manager_contact_id, manager_contact_id),
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Property not found';
    END IF;
  END IF;

  RETURN private.pm_property_to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.list_pm_properties(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_property(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  INTEGER, NUMERIC, INTEGER, BOOLEAN, DATE, DATE, DATE, TEXT, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_properties(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_property(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  INTEGER, NUMERIC, INTEGER, BOOLEAN, DATE, DATE, DATE, TEXT, UUID
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Unit RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_units(
  _company_id UUID,
  _property_id UUID DEFAULT NULL
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
    SELECT jsonb_agg(private.pm_unit_to_jsonb(u) ORDER BY u.code)
    FROM public.pm_units u
    WHERE u.company_id = _company_id
      AND (_property_id IS NULL OR u.property_id = _property_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_unit(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _code TEXT DEFAULT NULL,
  _name TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _floor_label TEXT DEFAULT NULL,
  _bedrooms INTEGER DEFAULT NULL,
  _bathrooms NUMERIC DEFAULT NULL,
  _capacity INTEGER DEFAULT NULL,
  _furnished BOOLEAN DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_units%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _code IS NULL OR char_length(trim(_code)) = 0 THEN
    RAISE EXCEPTION 'Unit code is required';
  END IF;
  IF _name IS NULL OR char_length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Unit name is required';
  END IF;

  IF COALESCE(_status, 'draft') NOT IN ('draft', 'active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'Invalid unit status';
  END IF;

  IF _id IS NULL THEN
    IF _property_id IS NULL THEN
      RAISE EXCEPTION 'Property is required for a new unit';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.pm_properties p
      WHERE p.id = _property_id AND p.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Property not found in this organisation';
    END IF;

    INSERT INTO public.pm_units (
      company_id, property_id, code, name, status, floor_label,
      bedrooms, bathrooms, capacity, furnished, notes, updated_by
    ) VALUES (
      _company_id,
      _property_id,
      trim(_code),
      trim(_name),
      COALESCE(_status, 'draft'),
      NULLIF(trim(_floor_label), ''),
      _bedrooms,
      _bathrooms,
      _capacity,
      _furnished,
      NULLIF(trim(_notes), ''),
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    IF _property_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pm_properties p
      WHERE p.id = _property_id AND p.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Property not found in this organisation';
    END IF;

    UPDATE public.pm_units SET
      property_id = COALESCE(_property_id, property_id),
      code = COALESCE(NULLIF(trim(_code), ''), code),
      name = trim(_name),
      status = COALESCE(_status, status),
      floor_label = CASE
        WHEN _floor_label IS NOT NULL THEN NULLIF(trim(_floor_label), '') ELSE floor_label
      END,
      bedrooms = COALESCE(_bedrooms, bedrooms),
      bathrooms = COALESCE(_bathrooms, bathrooms),
      capacity = COALESCE(_capacity, capacity),
      furnished = COALESCE(_furnished, furnished),
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Unit not found';
    END IF;
  END IF;

  RETURN private.pm_unit_to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.list_pm_units(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_unit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_units(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_unit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, BOOLEAN, TEXT
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_owners(
  _company_id UUID,
  _search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.owner.view');

  RETURN COALESCE((
    SELECT jsonb_agg(
      private.pm_owner_to_jsonb(o, c.name) ORDER BY o.display_name
    )
    FROM public.pm_owners o
    LEFT JOIN public.contacts c ON c.id = o.contact_id AND c.company_id = _company_id
    WHERE o.company_id = _company_id
      AND (
        _search IS NULL OR trim(_search) = ''
        OR o.display_name ILIKE '%' || trim(_search) || '%'
        OR COALESCE(c.name, '') ILIKE '%' || trim(_search) || '%'
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_owner(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _contact_id UUID DEFAULT NULL,
  _display_name TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _statement_delivery_email TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_owners%ROWTYPE;
  _contact_name TEXT;
  _display TEXT;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.owner.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _contact_id IS NULL THEN
    RAISE EXCEPTION 'Owner contact is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = _contact_id AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Contact not found in this organisation';
  END IF;

  SELECT name INTO _contact_name FROM public.contacts WHERE id = _contact_id;
  _display := COALESCE(NULLIF(trim(_display_name), ''), NULLIF(trim(_contact_name), ''));
  IF _display IS NULL OR char_length(_display) = 0 THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;

  IF COALESCE(_status, 'active') NOT IN ('active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'Invalid owner status';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.pm_owners (
      company_id, contact_id, display_name, status,
      statement_delivery_email, notes, updated_by
    ) VALUES (
      _company_id,
      _contact_id,
      _display,
      COALESCE(_status, 'active'),
      NULLIF(lower(trim(_statement_delivery_email)), ''),
      NULLIF(trim(_notes), ''),
      auth.uid()
    )
    ON CONFLICT (company_id, contact_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      status = EXCLUDED.status,
      statement_delivery_email = EXCLUDED.statement_delivery_email,
      notes = EXCLUDED.notes,
      updated_by = auth.uid(),
      updated_at = now()
  RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_owners SET
      contact_id = _contact_id,
      display_name = _display,
      status = COALESCE(_status, status),
      statement_delivery_email = CASE
        WHEN _statement_delivery_email IS NOT NULL
          THEN NULLIF(lower(trim(_statement_delivery_email)), '')
        ELSE statement_delivery_email
      END,
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Owner not found';
    END IF;
  END IF;

  RETURN private.pm_owner_to_jsonb(_row, _contact_name);
END;
$$;

REVOKE ALL ON FUNCTION public.list_pm_owners(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_owner(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_owners(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_owner(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ownership RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_property_ownership(
  _company_id UUID,
  _property_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.owner.view');

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_properties p
    WHERE p.id = _property_id AND p.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Property not found in this organisation';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      private.pm_ownership_to_jsonb(po, o.display_name)
      ORDER BY po.effective_from DESC, po.created_at DESC
    )
    FROM public.pm_property_ownership po
    JOIN public.pm_owners o ON o.id = po.owner_id AND o.company_id = _company_id
    WHERE po.company_id = _company_id AND po.property_id = _property_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_property_ownership(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _ownership_pct NUMERIC DEFAULT NULL,
  _distribution_pct NUMERIC DEFAULT NULL,
  _effective_from DATE DEFAULT NULL,
  _effective_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_property_ownership%ROWTYPE;
  _owner_display TEXT;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.owner.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _property_id IS NULL OR _owner_id IS NULL OR _ownership_pct IS NULL OR _effective_from IS NULL THEN
    RAISE EXCEPTION 'Property, owner, ownership percent and effective from date are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_properties p
    WHERE p.id = _property_id AND p.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Property not found in this organisation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_owners o
    WHERE o.id = _owner_id AND o.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Owner not found in this organisation';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.pm_property_ownership (
      company_id, property_id, owner_id, ownership_pct, distribution_pct,
      effective_from, effective_to, created_by
    ) VALUES (
      _company_id,
      _property_id,
      _owner_id,
      _ownership_pct,
      COALESCE(_distribution_pct, _ownership_pct),
      _effective_from,
      _effective_to,
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_property_ownership SET
      property_id = _property_id,
      owner_id = _owner_id,
      ownership_pct = _ownership_pct,
      distribution_pct = COALESCE(_distribution_pct, ownership_pct),
      effective_from = _effective_from,
      effective_to = _effective_to
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Ownership row not found';
    END IF;
  END IF;

  PERFORM private.pm_validate_ownership_sum(_company_id, _property_id);

  SELECT display_name INTO _owner_display
  FROM public.pm_owners WHERE id = _row.owner_id;

  RETURN private.pm_ownership_to_jsonb(_row, _owner_display);
END;
$$;

REVOKE ALL ON FUNCTION public.list_pm_property_ownership(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_property_ownership(
  UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, DATE, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_property_ownership(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_property_ownership(
  UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, DATE, DATE
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Management agreement RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_management_agreements(
  _company_id UUID,
  _property_id UUID DEFAULT NULL
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
      private.pm_agreement_to_jsonb(a) ORDER BY a.version_no DESC, a.updated_at DESC
    )
    FROM public.pm_management_agreements a
    WHERE a.company_id = _company_id
      AND (_property_id IS NULL OR a.property_id = _property_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_management_agreement(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _business_model TEXT DEFAULT NULL,
  _fee_type TEXT DEFAULT NULL,
  _fee_rate_pct NUMERIC DEFAULT NULL,
  _fee_fixed_minor BIGINT DEFAULT NULL,
  _minimum_monthly_fee_minor BIGINT DEFAULT NULL,
  _minimum_reserve_minor BIGINT DEFAULT NULL,
  _payout_frequency TEXT DEFAULT NULL,
  _start_date DATE DEFAULT NULL,
  _end_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _activate BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_management_agreements%ROWTYPE;
  _settings public.pm_settings%ROWTYPE;
  _version_no INTEGER;
  _status TEXT;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.manage');
  PERFORM private.pm_require_enabled(_company_id);
  SELECT * INTO _settings FROM public.pm_settings WHERE company_id = _company_id;

  IF _property_id IS NULL OR _start_date IS NULL THEN
    RAISE EXCEPTION 'Property and start date are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_properties p
    WHERE p.id = _property_id AND p.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Property not found in this organisation';
  END IF;

  IF _owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pm_owners o
    WHERE o.id = _owner_id AND o.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Owner not found in this organisation';
  END IF;

  IF COALESCE(_business_model, _settings.default_business_model, 'agency')
     NOT IN ('agency', 'principal', 'owner_direct') THEN
    RAISE EXCEPTION 'Invalid business model';
  END IF;

  IF COALESCE(_fee_type, 'percent_gross') NOT IN (
    'percent_gross', 'percent_net', 'percent_accommodation', 'percent_collected',
    'fixed_monthly', 'fixed_per_booking', 'tiered', 'custom'
  ) THEN
    RAISE EXCEPTION 'Invalid fee type';
  END IF;

  IF COALESCE(_payout_frequency, 'monthly') NOT IN (
    'weekly', 'biweekly', 'monthly', 'quarterly', 'manual'
  ) THEN
    RAISE EXCEPTION 'Invalid payout frequency';
  END IF;

  _status := CASE WHEN COALESCE(_activate, false) THEN 'active' ELSE 'draft' END;

  IF _id IS NULL THEN
    SELECT COALESCE(max(version_no), 0) + 1 INTO _version_no
    FROM public.pm_management_agreements
    WHERE property_id = _property_id AND company_id = _company_id;

    INSERT INTO public.pm_management_agreements (
      company_id, property_id, owner_id, version_no, status, business_model, fee_type,
      fee_rate_pct, fee_fixed_minor, minimum_monthly_fee_minor, minimum_reserve_minor,
      payout_frequency, start_date, end_date, notes, created_by, updated_by
    ) VALUES (
      _company_id,
      _property_id,
      _owner_id,
      _version_no,
      _status,
      COALESCE(_business_model, _settings.default_business_model, 'agency'),
      COALESCE(_fee_type, 'percent_gross'),
      _fee_rate_pct,
      _fee_fixed_minor,
      _minimum_monthly_fee_minor,
      _minimum_reserve_minor,
      COALESCE(_payout_frequency, 'monthly'),
      _start_date,
      _end_date,
      NULLIF(trim(_notes), ''),
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    SELECT status INTO _status
    FROM public.pm_management_agreements
  WHERE id = _id AND company_id = _company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Management agreement not found';
    END IF;

    IF COALESCE(_activate, false) THEN
      _status := 'active';
    END IF;

    UPDATE public.pm_management_agreements SET
      property_id = _property_id,
      owner_id = _owner_id,
      status = _status,
      business_model = COALESCE(_business_model, business_model),
      fee_type = COALESCE(_fee_type, fee_type),
      fee_rate_pct = COALESCE(_fee_rate_pct, fee_rate_pct),
      fee_fixed_minor = COALESCE(_fee_fixed_minor, fee_fixed_minor),
      minimum_monthly_fee_minor = COALESCE(_minimum_monthly_fee_minor, minimum_monthly_fee_minor),
      minimum_reserve_minor = COALESCE(_minimum_reserve_minor, minimum_reserve_minor),
      payout_frequency = COALESCE(_payout_frequency, payout_frequency),
      start_date = COALESCE(_start_date, start_date),
      end_date = _end_date,
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Management agreement not found';
    END IF;
  END IF;

  IF _row.status = 'active' THEN
    UPDATE public.pm_management_agreements SET
      status = 'superseded',
      updated_at = now(),
      updated_by = auth.uid()
    WHERE company_id = _company_id
      AND property_id = _row.property_id
      AND status = 'active'
      AND id <> _row.id;

    UPDATE public.pm_management_agreements SET
      status = 'active',
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = _row.id;
    SELECT * INTO _row FROM public.pm_management_agreements WHERE id = _row.id;
  END IF;

  RETURN private.pm_agreement_to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.list_pm_management_agreements(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_management_agreement(
  UUID, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, BIGINT, BIGINT, BIGINT, TEXT, DATE, DATE, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_management_agreements(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_management_agreement(
  UUID, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, BIGINT, BIGINT, BIGINT, TEXT, DATE, DATE, TEXT, BOOLEAN
) TO authenticated;