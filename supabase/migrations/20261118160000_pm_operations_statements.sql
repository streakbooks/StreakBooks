-- PM-02 operations & owner statements: tenants, leases, rent, reservations, fees, commissions, statements.
-- Additive and idempotent. Does not post journals.
-- Clients SELECT under RLS; mutations use SECURITY DEFINER RPCs with permission checks.

-- ---------------------------------------------------------------------------
-- Document sequences
-- ---------------------------------------------------------------------------
INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'pm_lease', 'LEASE-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'pm_rent_charge', 'RCHG-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'pm_owner_statement', 'OST-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- pm_tenants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_tenants_display_name_len CHECK (char_length(trim(display_name)) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_tenants_company_contact_uidx
  ON public.pm_tenants (company_id, contact_id);
CREATE INDEX IF NOT EXISTS pm_tenants_company_status_idx
  ON public.pm_tenants (company_id, status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- pm_leases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.pm_units(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.pm_tenants(id) ON DELETE RESTRICT,
  lease_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'archived')),
  start_date DATE NOT NULL,
  end_date DATE,
  rent_amount_minor BIGINT NOT NULL CHECK (rent_amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  rent_frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (rent_frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual')),
  due_day INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  late_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (late_fee_minor >= 0),
  security_deposit_minor BIGINT NOT NULL DEFAULT 0 CHECK (security_deposit_minor >= 0),
  proration_method TEXT NOT NULL DEFAULT 'calendar'
    CHECK (proration_method IN ('calendar', 'none')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_leases_date_range CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT pm_leases_number_len CHECK (char_length(trim(lease_number)) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_leases_company_number_uidx
  ON public.pm_leases (company_id, lease_number);
CREATE INDEX IF NOT EXISTS pm_leases_company_property_idx
  ON public.pm_leases (company_id, property_id, status);
CREATE INDEX IF NOT EXISTS pm_leases_company_tenant_idx
  ON public.pm_leases (company_id, tenant_id);

-- ---------------------------------------------------------------------------
-- pm_rent_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_rent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES public.pm_leases(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_rent_schedules_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS pm_rent_schedules_lease_idx
  ON public.pm_rent_schedules (lease_id, effective_from DESC);

-- ---------------------------------------------------------------------------
-- pm_rent_charges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_rent_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES public.pm_leases(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.pm_units(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.pm_tenants(id) ON DELETE RESTRICT,
  charge_number TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'partially_paid', 'paid', 'void')),
  description TEXT,
  sales_invoice_id UUID,
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_rent_charges_period CHECK (period_end >= period_start),
  CONSTRAINT pm_rent_charges_number_len CHECK (char_length(trim(charge_number)) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_rent_charges_lease_period_uidx
  ON public.pm_rent_charges (company_id, lease_id, period_start, period_end)
  WHERE status <> 'void';
CREATE INDEX IF NOT EXISTS pm_rent_charges_company_status_idx
  ON public.pm_rent_charges (company_id, status, due_date);
CREATE INDEX IF NOT EXISTS pm_rent_charges_property_period_idx
  ON public.pm_rent_charges (company_id, property_id, period_start, period_end);

-- ---------------------------------------------------------------------------
-- pm_security_deposits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_security_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES public.pm_leases(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.pm_tenants(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'partially_refunded', 'refunded', 'forfeited', 'transferred')),
  received_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pm_security_deposits_lease_idx
  ON public.pm_security_deposits (company_id, lease_id);

-- ---------------------------------------------------------------------------
-- pm_reservations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.pm_units(id) ON DELETE SET NULL,
  guest_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  guest_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN (
      'airbnb', 'vrbo', 'booking_com', 'direct', 'hostaway', 'guesty',
      'ownerrez', 'hostfully', 'lodgify', 'manual', 'other'
    )),
  external_reservation_id TEXT,
  status TEXT NOT NULL DEFAULT 'inquiry'
    CHECK (status IN (
      'inquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
    )),
  booking_date DATE,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights INTEGER NOT NULL CHECK (nights >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  base_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (base_amount_minor >= 0),
  cleaning_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (cleaning_fee_minor >= 0),
  other_fees_minor BIGINT NOT NULL DEFAULT 0 CHECK (other_fees_minor >= 0),
  taxes_minor BIGINT NOT NULL DEFAULT 0 CHECK (taxes_minor >= 0),
  channel_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (channel_fee_minor >= 0),
  processing_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (processing_fee_minor >= 0),
  discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  refund_minor BIGINT NOT NULL DEFAULT 0 CHECK (refund_minor >= 0),
  host_payout_minor BIGINT NOT NULL DEFAULT 0 CHECK (host_payout_minor >= 0),
  settlement_status TEXT NOT NULL DEFAULT 'open'
    CHECK (settlement_status IN ('open', 'partial', 'settled', 'excluded')),
  recognition_method TEXT NOT NULL DEFAULT 'check_in'
    CHECK (recognition_method IN ('check_in', 'check_out', 'stay_night', 'payment', 'contract')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_reservations_stay CHECK (check_out > check_in)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_reservations_external_uidx
  ON public.pm_reservations (company_id, source, external_reservation_id)
  WHERE external_reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_reservations_property_dates_idx
  ON public.pm_reservations (company_id, property_id, check_in, check_out);

-- ---------------------------------------------------------------------------
-- pm_reservation_financial_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_reservation_financial_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES public.pm_reservations(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL,
  description TEXT,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  owner_share_minor BIGINT NOT NULL DEFAULT 0,
  manager_share_minor BIGINT NOT NULL DEFAULT 0,
  recognition_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_reservation_financial_lines_res_idx
  ON public.pm_reservation_financial_lines (reservation_id, recognition_date);

-- ---------------------------------------------------------------------------
-- pm_fee_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES public.pm_management_agreements(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.pm_owners(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  fee_type TEXT NOT NULL DEFAULT 'percent_gross'
    CHECK (fee_type IN (
      'percent_gross', 'percent_net', 'percent_accommodation', 'percent_collected',
      'fixed_monthly', 'fixed_per_booking', 'tiered', 'custom'
    )),
  rate_pct NUMERIC(7, 4) CHECK (rate_pct IS NULL OR (rate_pct >= 0 AND rate_pct <= 100)),
  fixed_minor BIGINT CHECK (fixed_minor IS NULL OR fixed_minor >= 0),
  minimum_minor BIGINT CHECK (minimum_minor IS NULL OR minimum_minor >= 0),
  include_cleaning BOOLEAN NOT NULL DEFAULT false,
  include_channel_fees BOOLEAN NOT NULL DEFAULT false,
  include_taxes BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE NOT NULL,
  effective_to DATE,
  version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_fee_rules_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  CONSTRAINT pm_fee_rules_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS pm_fee_rules_property_active_idx
  ON public.pm_fee_rules (company_id, property_id, is_active, effective_from DESC);

-- ---------------------------------------------------------------------------
-- pm_commission_calculations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_commission_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fee_rule_id UUID REFERENCES public.pm_fee_rules(id) ON DELETE SET NULL,
  agreement_id UUID REFERENCES public.pm_management_agreements(id) ON DELETE SET NULL,
  property_id UUID NOT NULL REFERENCES public.pm_properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.pm_owners(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('reservation', 'rent_charge', 'manual')),
  source_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  base_amount_minor BIGINT NOT NULL CHECK (base_amount_minor >= 0),
  commission_minor BIGINT NOT NULL CHECK (commission_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  rule_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated', 'posted', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_commission_calculations_period CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS pm_commission_calculations_source_idx
  ON public.pm_commission_calculations (company_id, source_type, source_id)
  WHERE status <> 'void';
CREATE INDEX IF NOT EXISTS pm_commission_calculations_property_period_idx
  ON public.pm_commission_calculations (company_id, property_id, period_start, period_end);

-- ---------------------------------------------------------------------------
-- pm_owner_statements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_owner_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement_number TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.pm_owners(id) ON DELETE RESTRICT,
  property_id UUID REFERENCES public.pm_properties(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  basis TEXT NOT NULL DEFAULT 'accrual'
    CHECK (basis IN ('cash', 'accrual')),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'calculated', 'exception_review', 'ready_for_approval', 'approved',
      'published', 'paid', 'partially_paid', 'closed', 'superseded'
    )),
  opening_balance_minor BIGINT NOT NULL DEFAULT 0,
  income_minor BIGINT NOT NULL DEFAULT 0,
  expenses_minor BIGINT NOT NULL DEFAULT 0,
  fees_minor BIGINT NOT NULL DEFAULT 0,
  contributions_minor BIGINT NOT NULL DEFAULT 0,
  distributions_minor BIGINT NOT NULL DEFAULT 0,
  closing_balance_minor BIGINT NOT NULL DEFAULT 0,
  reserve_required_minor BIGINT NOT NULL DEFAULT 0,
  available_for_distribution_minor BIGINT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_owner_statements_period CHECK (period_end >= period_start),
  CONSTRAINT pm_owner_statements_number_len CHECK (char_length(trim(statement_number)) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS pm_owner_statements_company_number_uidx
  ON public.pm_owner_statements (company_id, statement_number);
CREATE INDEX IF NOT EXISTS pm_owner_statements_owner_period_idx
  ON public.pm_owner_statements (company_id, owner_id, period_start DESC);

-- ---------------------------------------------------------------------------
-- pm_owner_statement_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_owner_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement_id UUID NOT NULL REFERENCES public.pm_owner_statements(id) ON DELETE CASCADE,
  section TEXT NOT NULL
    CHECK (section IN (
      'income', 'expense', 'fee', 'reservation', 'rent', 'owner_txn',
      'settlement', 'note'
    )),
  line_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  property_id UUID REFERENCES public.pm_properties(id) ON DELETE SET NULL,
  source_type TEXT,
  source_id UUID,
  journal_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_owner_statement_lines_statement_idx
  ON public.pm_owner_statement_lines (statement_id, sort_order, line_date);

-- ---------------------------------------------------------------------------
-- pm_statement_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_statement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement_id UUID NOT NULL UNIQUE REFERENCES public.pm_owner_statements(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pm_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_rent_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_rent_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_security_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_reservation_financial_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_commission_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_owner_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_owner_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_statement_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PM tenants select" ON public.pm_tenants;
CREATE POLICY "PM tenants select"
  ON public.pm_tenants FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM leases select" ON public.pm_leases;
CREATE POLICY "PM leases select"
  ON public.pm_leases FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM rent schedules select" ON public.pm_rent_schedules;
CREATE POLICY "PM rent schedules select"
  ON public.pm_rent_schedules FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM rent charges select" ON public.pm_rent_charges;
CREATE POLICY "PM rent charges select"
  ON public.pm_rent_charges FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM security deposits select" ON public.pm_security_deposits;
CREATE POLICY "PM security deposits select"
  ON public.pm_security_deposits FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM reservations select" ON public.pm_reservations;
CREATE POLICY "PM reservations select"
  ON public.pm_reservations FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM reservation financial lines select" ON public.pm_reservation_financial_lines;
CREATE POLICY "PM reservation financial lines select"
  ON public.pm_reservation_financial_lines FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM fee rules select" ON public.pm_fee_rules;
CREATE POLICY "PM fee rules select"
  ON public.pm_fee_rules FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM commission calculations select" ON public.pm_commission_calculations;
CREATE POLICY "PM commission calculations select"
  ON public.pm_commission_calculations FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.view')
  );

DROP POLICY IF EXISTS "PM owner statements select" ON public.pm_owner_statements;
CREATE POLICY "PM owner statements select"
  ON public.pm_owner_statements FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.statements.view')
  );

DROP POLICY IF EXISTS "PM owner statement lines select" ON public.pm_owner_statement_lines;
CREATE POLICY "PM owner statement lines select"
  ON public.pm_owner_statement_lines FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.statements.view')
  );

DROP POLICY IF EXISTS "PM statement snapshots select" ON public.pm_statement_snapshots;
CREATE POLICY "PM statement snapshots select"
  ON public.pm_statement_snapshots FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'property.statements.view')
  );

REVOKE ALL ON TABLE public.pm_tenants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_leases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_rent_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_rent_charges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_security_deposits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_reservation_financial_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_fee_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_commission_calculations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_owner_statements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_owner_statement_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pm_statement_snapshots FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.pm_tenants TO authenticated;
GRANT SELECT ON TABLE public.pm_leases TO authenticated;
GRANT SELECT ON TABLE public.pm_rent_schedules TO authenticated;
GRANT SELECT ON TABLE public.pm_rent_charges TO authenticated;
GRANT SELECT ON TABLE public.pm_security_deposits TO authenticated;
GRANT SELECT ON TABLE public.pm_reservations TO authenticated;
GRANT SELECT ON TABLE public.pm_reservation_financial_lines TO authenticated;
GRANT SELECT ON TABLE public.pm_fee_rules TO authenticated;
GRANT SELECT ON TABLE public.pm_commission_calculations TO authenticated;
GRANT SELECT ON TABLE public.pm_owner_statements TO authenticated;
GRANT SELECT ON TABLE public.pm_owner_statement_lines TO authenticated;
GRANT SELECT ON TABLE public.pm_statement_snapshots TO authenticated;

GRANT ALL ON TABLE public.pm_tenants TO service_role;
GRANT ALL ON TABLE public.pm_leases TO service_role;
GRANT ALL ON TABLE public.pm_rent_schedules TO service_role;
GRANT ALL ON TABLE public.pm_rent_charges TO service_role;
GRANT ALL ON TABLE public.pm_security_deposits TO service_role;
GRANT ALL ON TABLE public.pm_reservations TO service_role;
GRANT ALL ON TABLE public.pm_reservation_financial_lines TO service_role;
GRANT ALL ON TABLE public.pm_fee_rules TO service_role;
GRANT ALL ON TABLE public.pm_commission_calculations TO service_role;
GRANT ALL ON TABLE public.pm_owner_statements TO service_role;
GRANT ALL ON TABLE public.pm_owner_statement_lines TO service_role;
GRANT ALL ON TABLE public.pm_statement_snapshots TO service_role;

-- ---------------------------------------------------------------------------
-- JSONB helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.pm_tenant_to_jsonb(
  _r public.pm_tenants,
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
    'emergencyContactName', _r.emergency_contact_name,
    'emergencyContactPhone', _r.emergency_contact_phone,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_lease_to_jsonb(_r public.pm_leases)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'propertyId', _r.property_id,
    'unitId', _r.unit_id,
    'tenantId', _r.tenant_id,
    'leaseNumber', _r.lease_number,
    'status', _r.status,
    'startDate', _r.start_date,
    'endDate', _r.end_date,
    'rentAmountMinor', _r.rent_amount_minor,
    'currencyCode', _r.currency_code,
    'rentFrequency', _r.rent_frequency,
    'dueDay', _r.due_day,
    'graceDays', _r.grace_days,
    'lateFeeMinor', _r.late_fee_minor,
    'securityDepositMinor', _r.security_deposit_minor,
    'prorationMethod', _r.proration_method,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_rent_schedule_to_jsonb(_r public.pm_rent_schedules)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'leaseId', _r.lease_id,
    'effectiveFrom', _r.effective_from,
    'effectiveTo', _r.effective_to,
    'amountMinor', _r.amount_minor,
    'currencyCode', _r.currency_code,
    'notes', _r.notes,
    'createdAt', _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_rent_charge_to_jsonb(_r public.pm_rent_charges)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'leaseId', _r.lease_id,
    'propertyId', _r.property_id,
    'unitId', _r.unit_id,
    'tenantId', _r.tenant_id,
    'chargeNumber', _r.charge_number,
    'periodStart', _r.period_start,
    'periodEnd', _r.period_end,
    'dueDate', _r.due_date,
    'amountMinor', _r.amount_minor,
    'currencyCode', _r.currency_code,
    'status', _r.status,
    'description', _r.description,
    'salesInvoiceId', _r.sales_invoice_id,
    'journalId', _r.journal_id,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_security_deposit_to_jsonb(_r public.pm_security_deposits)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'leaseId', _r.lease_id,
    'propertyId', _r.property_id,
    'tenantId', _r.tenant_id,
    'amountMinor', _r.amount_minor,
    'currencyCode', _r.currency_code,
    'status', _r.status,
    'receivedOn', _r.received_on,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_reservation_to_jsonb(_r public.pm_reservations)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'propertyId', _r.property_id,
    'unitId', _r.unit_id,
    'guestContactId', _r.guest_contact_id,
    'guestName', _r.guest_name,
    'source', _r.source,
    'externalReservationId', _r.external_reservation_id,
    'status', _r.status,
    'bookingDate', _r.booking_date,
    'checkIn', _r.check_in,
    'checkOut', _r.check_out,
    'nights', _r.nights,
    'currencyCode', _r.currency_code,
    'baseAmountMinor', _r.base_amount_minor,
    'cleaningFeeMinor', _r.cleaning_fee_minor,
    'otherFeesMinor', _r.other_fees_minor,
    'taxesMinor', _r.taxes_minor,
    'channelFeeMinor', _r.channel_fee_minor,
    'processingFeeMinor', _r.processing_fee_minor,
    'discountMinor', _r.discount_minor,
    'refundMinor', _r.refund_minor,
    'hostPayoutMinor', _r.host_payout_minor,
    'settlementStatus', _r.settlement_status,
    'recognitionMethod', _r.recognition_method,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_fee_rule_to_jsonb(_r public.pm_fee_rules)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'agreementId', _r.agreement_id,
    'propertyId', _r.property_id,
    'ownerId', _r.owner_id,
    'name', _r.name,
    'feeType', _r.fee_type,
    'ratePct', _r.rate_pct,
    'fixedMinor', _r.fixed_minor,
    'minimumMinor', _r.minimum_minor,
    'includeCleaning', _r.include_cleaning,
    'includeChannelFees', _r.include_channel_fees,
    'includeTaxes', _r.include_taxes,
    'effectiveFrom', _r.effective_from,
    'effectiveTo', _r.effective_to,
    'versionNo', _r.version_no,
    'isActive', _r.is_active,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
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
    'createdAt', _r.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_owner_statement_to_jsonb(_r public.pm_owner_statements)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'statementNumber', _r.statement_number,
    'ownerId', _r.owner_id,
    'propertyId', _r.property_id,
    'periodStart', _r.period_start,
    'periodEnd', _r.period_end,
    'basis', _r.basis,
    'currencyCode', _r.currency_code,
    'status', _r.status,
    'openingBalanceMinor', _r.opening_balance_minor,
    'incomeMinor', _r.income_minor,
    'expensesMinor', _r.expenses_minor,
    'feesMinor', _r.fees_minor,
    'contributionsMinor', _r.contributions_minor,
    'distributionsMinor', _r.distributions_minor,
    'closingBalanceMinor', _r.closing_balance_minor,
    'reserveRequiredMinor', _r.reserve_required_minor,
    'availableForDistributionMinor', _r.available_for_distribution_minor,
    'calculatedAt', _r.calculated_at,
    'approvedAt', _r.approved_at,
    'approvedBy', _r.approved_by,
    'publishedAt', _r.published_at,
    'notes', _r.notes,
    'createdAt', _r.created_at,
    'updatedAt', _r.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.pm_owner_statement_line_to_jsonb(_r public.pm_owner_statement_lines)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', _r.id,
    'companyId', _r.company_id,
    'statementId', _r.statement_id,
    'section', _r.section,
    'lineDate', _r.line_date,
    'description', _r.description,
    'amountMinor', _r.amount_minor,
    'propertyId', _r.property_id,
    'sourceType', _r.source_type,
    'sourceId', _r.source_id,
    'journalId', _r.journal_id,
    'sortOrder', _r.sort_order,
    'createdAt', _r.created_at
  );
$$;

-- Commission math from rule snapshot / row fields
CREATE OR REPLACE FUNCTION private.pm_compute_commission_minor(
  _fee_type TEXT,
  _rate_pct NUMERIC,
  _fixed_minor BIGINT,
  _minimum_minor BIGINT,
  _base_amount_minor BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  _commission BIGINT := 0;
BEGIN
  IF _fee_type IN ('percent_gross', 'percent_net', 'percent_accommodation', 'percent_collected', 'tiered', 'custom') THEN
  _commission := round(COALESCE(_rate_pct, 0) * _base_amount_minor / 100.0)::BIGINT;
  ELSIF _fee_type IN ('fixed_monthly', 'fixed_per_booking') THEN
    _commission := COALESCE(_fixed_minor, 0);
  END IF;
  IF _minimum_minor IS NOT NULL AND _commission < _minimum_minor THEN
    _commission := _minimum_minor;
  END IF;
  IF _commission < 0 THEN
    _commission := 0;
  END IF;
  RETURN _commission;
END;
$$;

CREATE OR REPLACE FUNCTION private.pm_resolve_fee_rule(
  _company_id UUID,
  _property_id UUID,
  _as_of DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rule public.pm_fee_rules%ROWTYPE;
  _agreement public.pm_management_agreements%ROWTYPE;
BEGIN
  SELECT * INTO _rule
  FROM public.pm_fee_rules fr
  WHERE fr.company_id = _company_id
    AND fr.is_active = true
    AND (fr.property_id IS NULL OR fr.property_id = _property_id)
    AND fr.effective_from <= _as_of
    AND (fr.effective_to IS NULL OR fr.effective_to >= _as_of)
  ORDER BY
    CASE WHEN fr.property_id = _property_id THEN 0 ELSE 1 END,
    fr.version_no DESC,
    fr.effective_from DESC
  LIMIT 1;

  IF _rule.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'feeRuleId', _rule.id,
      'agreementId', _rule.agreement_id,
      'ownerId', _rule.owner_id,
      'feeType', _rule.fee_type,
      'ratePct', _rule.rate_pct,
      'fixedMinor', _rule.fixed_minor,
      'minimumMinor', _rule.minimum_minor,
      'source', 'fee_rule'
    );
  END IF;

  SELECT * INTO _agreement
  FROM public.pm_management_agreements ma
  WHERE ma.company_id = _company_id
    AND ma.property_id = _property_id
    AND ma.status = 'active'
    AND ma.start_date <= _as_of
    AND (ma.end_date IS NULL OR ma.end_date >= _as_of)
  ORDER BY ma.version_no DESC, ma.start_date DESC
  LIMIT 1;

  IF _agreement.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'feeRuleId', NULL,
      'agreementId', _agreement.id,
      'ownerId', _agreement.owner_id,
      'feeType', _agreement.fee_type,
      'ratePct', _agreement.fee_rate_pct,
      'fixedMinor', _agreement.fee_fixed_minor,
      'minimumMinor', _agreement.minimum_monthly_fee_minor,
      'source', 'agreement'
    );
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tenant RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_tenants(
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
    SELECT jsonb_agg(
      private.pm_tenant_to_jsonb(t, c.name) ORDER BY t.display_name
    )
    FROM public.pm_tenants t
    LEFT JOIN public.contacts c ON c.id = t.contact_id AND c.company_id = _company_id
    WHERE t.company_id = _company_id
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR t.status = _status)
      AND (
        _search IS NULL OR trim(_search) = ''
        OR t.display_name ILIKE '%' || trim(_search) || '%'
        OR COALESCE(c.name, '') ILIKE '%' || trim(_search) || '%'
      )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_tenant(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _contact_id UUID DEFAULT NULL,
  _display_name TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _emergency_contact_name TEXT DEFAULT NULL,
  _emergency_contact_phone TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_tenants%ROWTYPE;
  _contact_name TEXT;
  _display TEXT;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.tenant.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _contact_id IS NULL THEN
    RAISE EXCEPTION 'Tenant contact is required';
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
    RAISE EXCEPTION 'Invalid tenant status';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.pm_tenants (
      company_id, contact_id, display_name, status,
      emergency_contact_name, emergency_contact_phone, notes, updated_by
    ) VALUES (
      _company_id, _contact_id, _display, COALESCE(_status, 'active'),
      NULLIF(trim(_emergency_contact_name), ''),
      NULLIF(trim(_emergency_contact_phone), ''),
      NULLIF(trim(_notes), ''),
      auth.uid()
    )
  ON CONFLICT (company_id, contact_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      status = EXCLUDED.status,
      emergency_contact_name = EXCLUDED.emergency_contact_name,
      emergency_contact_phone = EXCLUDED.emergency_contact_phone,
      notes = EXCLUDED.notes,
      updated_by = auth.uid(),
      updated_at = now()
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_tenants SET
      contact_id = COALESCE(_contact_id, contact_id),
      display_name = _display,
      status = COALESCE(_status, status),
      emergency_contact_name = CASE
        WHEN _emergency_contact_name IS NOT NULL THEN NULLIF(trim(_emergency_contact_name), '')
        ELSE emergency_contact_name
      END,
      emergency_contact_phone = CASE
        WHEN _emergency_contact_phone IS NOT NULL THEN NULLIF(trim(_emergency_contact_phone), '')
        ELSE emergency_contact_phone
      END,
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Tenant not found';
    END IF;
  END IF;

  RETURN private.pm_tenant_to_jsonb(_row, _contact_name);
END;
$$;

-- ---------------------------------------------------------------------------
-- Lease RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_leases(
  _company_id UUID,
  _property_id UUID DEFAULT NULL,
  _tenant_id UUID DEFAULT NULL,
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
    SELECT jsonb_agg(private.pm_lease_to_jsonb(l) ORDER BY l.updated_at DESC)
    FROM public.pm_leases l
    WHERE l.company_id = _company_id
      AND (_property_id IS NULL OR l.property_id = _property_id)
      AND (_tenant_id IS NULL OR l.tenant_id = _tenant_id)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR l.status = _status)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_lease(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _unit_id UUID DEFAULT NULL,
  _tenant_id UUID DEFAULT NULL,
  _lease_number TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _start_date DATE DEFAULT NULL,
  _end_date DATE DEFAULT NULL,
  _rent_amount_minor BIGINT DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _rent_frequency TEXT DEFAULT NULL,
  _due_day INTEGER DEFAULT NULL,
  _grace_days INTEGER DEFAULT NULL,
  _late_fee_minor BIGINT DEFAULT NULL,
  _security_deposit_minor BIGINT DEFAULT NULL,
  _proration_method TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_leases%ROWTYPE;
  _num TEXT;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.lease.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _property_id IS NULL OR _tenant_id IS NULL OR _start_date IS NULL THEN
    RAISE EXCEPTION 'Property, tenant and start date are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_properties p
    WHERE p.id = _property_id AND p.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Property not found';
  END IF;

  IF _unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pm_units u
    WHERE u.id = _unit_id AND u.company_id = _company_id AND u.property_id = _property_id
  ) THEN
    RAISE EXCEPTION 'Unit not found on property';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_tenants t
    WHERE t.id = _tenant_id AND t.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF COALESCE(_status, 'draft') NOT IN ('draft', 'active', 'expired', 'terminated', 'archived') THEN
    RAISE EXCEPTION 'Invalid lease status';
  END IF;

  IF _id IS NULL THEN
    _num := NULLIF(trim(_lease_number), '');
    IF _num IS NULL THEN
      _num := private.pm_allocate_number(_company_id, 'pm_lease', 'LEASE-');
    END IF;

    INSERT INTO public.pm_leases (
      company_id, property_id, unit_id, tenant_id, lease_number, status,
      start_date, end_date, rent_amount_minor, currency_code, rent_frequency,
      due_day, grace_days, late_fee_minor, security_deposit_minor,
      proration_method, notes, updated_by
    ) VALUES (
      _company_id, _property_id, _unit_id, _tenant_id, _num,
      COALESCE(_status, 'draft'),
      _start_date, _end_date,
      COALESCE(_rent_amount_minor, 0),
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
      COALESCE(_rent_frequency, 'monthly'),
      COALESCE(_due_day, 1),
      COALESCE(_grace_days, 0),
      COALESCE(_late_fee_minor, 0),
      COALESCE(_security_deposit_minor, 0),
      COALESCE(_proration_method, 'calendar'),
      NULLIF(trim(_notes), ''),
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_leases SET
      property_id = COALESCE(_property_id, property_id),
      unit_id = COALESCE(_unit_id, unit_id),
      tenant_id = COALESCE(_tenant_id, tenant_id),
      lease_number = COALESCE(NULLIF(trim(_lease_number), ''), lease_number),
      status = COALESCE(_status, status),
      start_date = COALESCE(_start_date, start_date),
      end_date = CASE WHEN _end_date IS NOT NULL THEN _end_date ELSE end_date END,
      rent_amount_minor = COALESCE(_rent_amount_minor, rent_amount_minor),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      rent_frequency = COALESCE(_rent_frequency, rent_frequency),
      due_day = COALESCE(_due_day, due_day),
      grace_days = COALESCE(_grace_days, grace_days),
      late_fee_minor = COALESCE(_late_fee_minor, late_fee_minor),
      security_deposit_minor = COALESCE(_security_deposit_minor, security_deposit_minor),
      proration_method = COALESCE(_proration_method, proration_method),
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Lease not found';
    END IF;
  END IF;

  RETURN private.pm_lease_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Rent schedule RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_rent_schedules(
  _company_id UUID,
  _lease_id UUID DEFAULT NULL
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
    SELECT jsonb_agg(private.pm_rent_schedule_to_jsonb(s) ORDER BY s.effective_from DESC)
    FROM public.pm_rent_schedules s
    WHERE s.company_id = _company_id
      AND (_lease_id IS NULL OR s.lease_id = _lease_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_rent_schedule(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _lease_id UUID DEFAULT NULL,
  _effective_from DATE DEFAULT NULL,
  _effective_to DATE DEFAULT NULL,
  _amount_minor BIGINT DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_rent_schedules%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.rent.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _lease_id IS NULL OR _effective_from IS NULL OR _amount_minor IS NULL THEN
    RAISE EXCEPTION 'Lease, effective from and amount are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_leases l
    WHERE l.id = _lease_id AND l.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Lease not found';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.pm_rent_schedules (
      company_id, lease_id, effective_from, effective_to,
      amount_minor, currency_code, notes
    ) VALUES (
      _company_id, _lease_id, _effective_from, _effective_to,
      _amount_minor,
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
      NULLIF(trim(_notes), '')
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_rent_schedules SET
      lease_id = COALESCE(_lease_id, lease_id),
      effective_from = COALESCE(_effective_from, effective_from),
      effective_to = CASE WHEN _effective_to IS NOT NULL THEN _effective_to ELSE effective_to END,
      amount_minor = COALESCE(_amount_minor, amount_minor),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Rent schedule not found';
    END IF;
  END IF;

  RETURN private.pm_rent_schedule_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Rent charge RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_rent_charges(
  _company_id UUID,
  _lease_id UUID DEFAULT NULL,
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
    SELECT jsonb_agg(private.pm_rent_charge_to_jsonb(c) ORDER BY c.due_date DESC)
    FROM public.pm_rent_charges c
    WHERE c.company_id = _company_id
      AND (_lease_id IS NULL OR c.lease_id = _lease_id)
      AND (_property_id IS NULL OR c.property_id = _property_id)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR c.status = _status)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_pm_rent_charge(
  _company_id UUID,
  _lease_id UUID,
  _period_start DATE,
  _period_end DATE,
  _due_date DATE DEFAULT NULL,
  _description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lease public.pm_leases%ROWTYPE;
  _existing public.pm_rent_charges%ROWTYPE;
  _amount BIGINT;
  _row public.pm_rent_charges%ROWTYPE;
  _num TEXT;
  _due DATE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.rent.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _period_start IS NULL OR _period_end IS NULL THEN
    RAISE EXCEPTION 'Period start and end are required';
  END IF;
  IF _period_end < _period_start THEN
    RAISE EXCEPTION 'Invalid period range';
  END IF;

  SELECT * INTO _lease
  FROM public.pm_leases l
  WHERE l.id = _lease_id AND l.company_id = _company_id;

  IF _lease.id IS NULL THEN
    RAISE EXCEPTION 'Lease not found';
  END IF;
  IF _lease.status <> 'active' THEN
    RAISE EXCEPTION 'Rent charges require an active lease';
  END IF;

  SELECT * INTO _existing
  FROM public.pm_rent_charges rc
  WHERE rc.company_id = _company_id
    AND rc.lease_id = _lease_id
    AND rc.period_start = _period_start
    AND rc.period_end = _period_end
    AND rc.status <> 'void'
  LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    RETURN private.pm_rent_charge_to_jsonb(_existing);
  END IF;

  SELECT rs.amount_minor INTO _amount
  FROM public.pm_rent_schedules rs
  WHERE rs.company_id = _company_id
    AND rs.lease_id = _lease_id
    AND rs.effective_from <= _period_end
    AND (rs.effective_to IS NULL OR rs.effective_to >= _period_start)
  ORDER BY rs.effective_from DESC
  LIMIT 1;

  _amount := COALESCE(_amount, _lease.rent_amount_minor);
  _due := COALESCE(_due_date, _period_end);
  _num := private.pm_allocate_number(_company_id, 'pm_rent_charge', 'RCHG-');

  INSERT INTO public.pm_rent_charges (
    company_id, lease_id, property_id, unit_id, tenant_id, charge_number,
    period_start, period_end, due_date, amount_minor, currency_code,
    status, description
  ) VALUES (
    _company_id, _lease_id, _lease.property_id, _lease.unit_id, _lease.tenant_id,
    _num, _period_start, _period_end, _due, _amount, _lease.currency_code,
    'draft',
    COALESCE(NULLIF(trim(_description), ''), 'Rent for ' || _period_start::text || ' – ' || _period_end::text)
  )
  RETURNING * INTO _row;

  RETURN private.pm_rent_charge_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Security deposit RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_security_deposits(
  _company_id UUID,
  _lease_id UUID DEFAULT NULL
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
    SELECT jsonb_agg(private.pm_security_deposit_to_jsonb(d) ORDER BY d.created_at DESC)
    FROM public.pm_security_deposits d
    WHERE d.company_id = _company_id
      AND (_lease_id IS NULL OR d.lease_id = _lease_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_security_deposit(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _lease_id UUID DEFAULT NULL,
  _amount_minor BIGINT DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _received_on DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lease public.pm_leases%ROWTYPE;
  _row public.pm_security_deposits%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.lease.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _lease_id IS NULL THEN
    RAISE EXCEPTION 'Lease is required';
  END IF;

  SELECT * INTO _lease FROM public.pm_leases l
  WHERE l.id = _lease_id AND l.company_id = _company_id;
  IF _lease.id IS NULL THEN
    RAISE EXCEPTION 'Lease not found';
  END IF;

  IF COALESCE(_status, 'held') NOT IN (
    'held', 'partially_refunded', 'refunded', 'forfeited', 'transferred'
  ) THEN
    RAISE EXCEPTION 'Invalid deposit status';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.pm_security_deposits (
      company_id, lease_id, property_id, tenant_id,
      amount_minor, currency_code, status, received_on, notes, updated_by
    ) VALUES (
      _company_id, _lease_id, _lease.property_id, _lease.tenant_id,
      COALESCE(_amount_minor, _lease.security_deposit_minor, 0),
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), _lease.currency_code),
      COALESCE(_status, 'held'),
      _received_on,
      NULLIF(trim(_notes), ''),
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_security_deposits SET
      amount_minor = COALESCE(_amount_minor, amount_minor),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      status = COALESCE(_status, status),
      received_on = COALESCE(_received_on, received_on),
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Security deposit not found';
    END IF;
  END IF;

  RETURN private.pm_security_deposit_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Reservation RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_reservations(
  _company_id UUID,
  _property_id UUID DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
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
    SELECT jsonb_agg(private.pm_reservation_to_jsonb(r) ORDER BY r.check_in DESC)
    FROM public.pm_reservations r
    WHERE r.company_id = _company_id
      AND (_property_id IS NULL OR r.property_id = _property_id)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR r.status = _status)
      AND (_from IS NULL OR r.check_out >= _from)
      AND (_to IS NULL OR r.check_in <= _to)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_reservation(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _unit_id UUID DEFAULT NULL,
  _guest_contact_id UUID DEFAULT NULL,
  _guest_name TEXT DEFAULT NULL,
  _source TEXT DEFAULT NULL,
  _external_reservation_id TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _booking_date DATE DEFAULT NULL,
  _check_in DATE DEFAULT NULL,
  _check_out DATE DEFAULT NULL,
  _nights INTEGER DEFAULT NULL,
  _currency_code TEXT DEFAULT NULL,
  _base_amount_minor BIGINT DEFAULT NULL,
  _cleaning_fee_minor BIGINT DEFAULT NULL,
  _other_fees_minor BIGINT DEFAULT NULL,
  _taxes_minor BIGINT DEFAULT NULL,
  _channel_fee_minor BIGINT DEFAULT NULL,
  _processing_fee_minor BIGINT DEFAULT NULL,
  _discount_minor BIGINT DEFAULT NULL,
  _refund_minor BIGINT DEFAULT NULL,
  _host_payout_minor BIGINT DEFAULT NULL,
  _settlement_status TEXT DEFAULT NULL,
  _recognition_method TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_reservations%ROWTYPE;
  _n INTEGER;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.reservation.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _property_id IS NULL OR _check_in IS NULL OR _check_out IS NULL THEN
    RAISE EXCEPTION 'Property, check-in and check-out are required';
  END IF;
  IF _check_out <= _check_in THEN
    RAISE EXCEPTION 'Check-out must be after check-in';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_properties p WHERE p.id = _property_id AND p.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Property not found';
  END IF;

  IF _guest_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts c WHERE c.id = _guest_contact_id AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Guest contact not found';
  END IF;

  _n := COALESCE(_nights, (_check_out - _check_in)::INTEGER);

  IF _id IS NULL THEN
    INSERT INTO public.pm_reservations (
      company_id, property_id, unit_id, guest_contact_id, guest_name, source,
      external_reservation_id, status, booking_date, check_in, check_out, nights,
      currency_code, base_amount_minor, cleaning_fee_minor, other_fees_minor,
      taxes_minor, channel_fee_minor, processing_fee_minor, discount_minor,
      refund_minor, host_payout_minor, settlement_status, recognition_method,
      notes, updated_by
    ) VALUES (
      _company_id, _property_id, _unit_id, _guest_contact_id,
      NULLIF(trim(_guest_name), ''),
      COALESCE(_source, 'manual'),
      NULLIF(trim(_external_reservation_id), ''),
      COALESCE(_status, 'inquiry'),
      _booking_date, _check_in, _check_out, _n,
      COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
      COALESCE(_base_amount_minor, 0),
      COALESCE(_cleaning_fee_minor, 0),
      COALESCE(_other_fees_minor, 0),
      COALESCE(_taxes_minor, 0),
      COALESCE(_channel_fee_minor, 0),
      COALESCE(_processing_fee_minor, 0),
      COALESCE(_discount_minor, 0),
      COALESCE(_refund_minor, 0),
      COALESCE(_host_payout_minor, 0),
      COALESCE(_settlement_status, 'open'),
      COALESCE(_recognition_method, 'check_in'),
      NULLIF(trim(_notes), ''),
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_reservations SET
      property_id = COALESCE(_property_id, property_id),
      unit_id = COALESCE(_unit_id, unit_id),
      guest_contact_id = COALESCE(_guest_contact_id, guest_contact_id),
      guest_name = CASE WHEN _guest_name IS NOT NULL THEN NULLIF(trim(_guest_name), '') ELSE guest_name END,
      source = COALESCE(_source, source),
      external_reservation_id = CASE
        WHEN _external_reservation_id IS NOT NULL THEN NULLIF(trim(_external_reservation_id), '')
        ELSE external_reservation_id
      END,
      status = COALESCE(_status, status),
      booking_date = COALESCE(_booking_date, booking_date),
      check_in = COALESCE(_check_in, check_in),
      check_out = COALESCE(_check_out, check_out),
      nights = COALESCE(_n, nights),
      currency_code = COALESCE(NULLIF(upper(trim(_currency_code)), ''), currency_code),
      base_amount_minor = COALESCE(_base_amount_minor, base_amount_minor),
      cleaning_fee_minor = COALESCE(_cleaning_fee_minor, cleaning_fee_minor),
      other_fees_minor = COALESCE(_other_fees_minor, other_fees_minor),
      taxes_minor = COALESCE(_taxes_minor, taxes_minor),
      channel_fee_minor = COALESCE(_channel_fee_minor, channel_fee_minor),
      processing_fee_minor = COALESCE(_processing_fee_minor, processing_fee_minor),
      discount_minor = COALESCE(_discount_minor, discount_minor),
      refund_minor = COALESCE(_refund_minor, refund_minor),
      host_payout_minor = COALESCE(_host_payout_minor, host_payout_minor),
      settlement_status = COALESCE(_settlement_status, settlement_status),
      recognition_method = COALESCE(_recognition_method, recognition_method),
      notes = CASE WHEN _notes IS NOT NULL THEN NULLIF(trim(_notes), '') ELSE notes END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Reservation not found';
    END IF;
  END IF;

  RETURN private.pm_reservation_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fee rule RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_fee_rules(
  _company_id UUID,
  _property_id UUID DEFAULT NULL,
  _active_only BOOLEAN DEFAULT true
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
    SELECT jsonb_agg(private.pm_fee_rule_to_jsonb(fr) ORDER BY fr.effective_from DESC, fr.version_no DESC)
    FROM public.pm_fee_rules fr
    WHERE fr.company_id = _company_id
      AND (_property_id IS NULL OR fr.property_id = _property_id OR fr.property_id IS NULL)
      AND (NOT _active_only OR fr.is_active = true)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_pm_fee_rule(
  _company_id UUID,
  _id UUID DEFAULT NULL,
  _agreement_id UUID DEFAULT NULL,
  _property_id UUID DEFAULT NULL,
  _owner_id UUID DEFAULT NULL,
  _name TEXT DEFAULT NULL,
  _fee_type TEXT DEFAULT NULL,
  _rate_pct NUMERIC DEFAULT NULL,
  _fixed_minor BIGINT DEFAULT NULL,
  _minimum_minor BIGINT DEFAULT NULL,
  _include_cleaning BOOLEAN DEFAULT NULL,
  _include_channel_fees BOOLEAN DEFAULT NULL,
  _include_taxes BOOLEAN DEFAULT NULL,
  _effective_from DATE DEFAULT NULL,
  _effective_to DATE DEFAULT NULL,
  _version_no INTEGER DEFAULT NULL,
  _is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_fee_rules%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.commission.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _name IS NULL OR trim(_name) = '' OR _effective_from IS NULL THEN
    RAISE EXCEPTION 'Name and effective from are required';
  END IF;

  IF COALESCE(_fee_type, 'percent_gross') NOT IN (
    'percent_gross', 'percent_net', 'percent_accommodation', 'percent_collected',
    'fixed_monthly', 'fixed_per_booking', 'tiered', 'custom'
  ) THEN
    RAISE EXCEPTION 'Invalid fee type';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.pm_fee_rules (
      company_id, agreement_id, property_id, owner_id, name, fee_type,
      rate_pct, fixed_minor, minimum_minor, include_cleaning, include_channel_fees,
      include_taxes, effective_from, effective_to, version_no, is_active
    ) VALUES (
      _company_id, _agreement_id, _property_id, _owner_id, trim(_name),
      COALESCE(_fee_type, 'percent_gross'),
      _rate_pct, _fixed_minor, _minimum_minor,
      COALESCE(_include_cleaning, false),
      COALESCE(_include_channel_fees, false),
      COALESCE(_include_taxes, false),
      _effective_from, _effective_to,
      COALESCE(_version_no, 1),
      COALESCE(_is_active, true)
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.pm_fee_rules SET
      agreement_id = COALESCE(_agreement_id, agreement_id),
      property_id = COALESCE(_property_id, property_id),
      owner_id = COALESCE(_owner_id, owner_id),
      name = trim(_name),
      fee_type = COALESCE(_fee_type, fee_type),
      rate_pct = COALESCE(_rate_pct, rate_pct),
      fixed_minor = COALESCE(_fixed_minor, fixed_minor),
      minimum_minor = COALESCE(_minimum_minor, minimum_minor),
      include_cleaning = COALESCE(_include_cleaning, include_cleaning),
      include_channel_fees = COALESCE(_include_channel_fees, include_channel_fees),
      include_taxes = COALESCE(_include_taxes, include_taxes),
      effective_from = COALESCE(_effective_from, effective_from),
      effective_to = CASE WHEN _effective_to IS NOT NULL THEN _effective_to ELSE effective_to END,
      version_no = COALESCE(_version_no, version_no),
      is_active = COALESCE(_is_active, is_active),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Fee rule not found';
    END IF;
  END IF;

  RETURN private.pm_fee_rule_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Commission RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_pm_commission(
  _company_id UUID,
  _property_id UUID,
  _source_type TEXT,
  _source_id UUID,
  _base_amount_minor BIGINT,
  _currency_code TEXT,
  _period_start DATE,
  _period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _existing public.pm_commission_calculations%ROWTYPE;
  _rule jsonb;
  _commission BIGINT;
  _row public.pm_commission_calculations%ROWTYPE;
  _owner_id UUID;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.commission.manage');
  PERFORM private.pm_require_enabled(_company_id);

  IF _source_type NOT IN ('reservation', 'rent_charge', 'manual') THEN
    RAISE EXCEPTION 'Invalid source type';
  END IF;
  IF _base_amount_minor IS NULL OR _base_amount_minor < 0 THEN
    RAISE EXCEPTION 'Base amount is required';
  END IF;

  SELECT * INTO _existing
  FROM public.pm_commission_calculations cc
  WHERE cc.company_id = _company_id
    AND cc.source_type = _source_type
    AND cc.source_id = _source_id
    AND cc.status <> 'void'
  LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    RETURN private.pm_commission_calc_to_jsonb(_existing);
  END IF;

  _rule := private.pm_resolve_fee_rule(_company_id, _property_id, COALESCE(_period_start, CURRENT_DATE));
  IF _rule IS NULL THEN
    RAISE EXCEPTION 'No active fee rule or agreement for property';
  END IF;

  _owner_id := (_rule->>'ownerId')::UUID;
  _commission := private.pm_compute_commission_minor(
    _rule->>'feeType',
    (_rule->>'ratePct')::NUMERIC,
    (_rule->>'fixedMinor')::BIGINT,
    (_rule->>'minimumMinor')::BIGINT,
    _base_amount_minor
  );

  INSERT INTO public.pm_commission_calculations (
    company_id, fee_rule_id, agreement_id, property_id, owner_id,
    source_type, source_id, period_start, period_end,
    base_amount_minor, commission_minor, currency_code, rule_snapshot, status
  ) VALUES (
    _company_id,
    (_rule->>'feeRuleId')::UUID,
    (_rule->>'agreementId')::UUID,
    _property_id,
    _owner_id,
    _source_type,
    _source_id,
    COALESCE(_period_start, CURRENT_DATE),
    COALESCE(_period_end, _period_start, CURRENT_DATE),
    _base_amount_minor,
    _commission,
    COALESCE(NULLIF(upper(trim(_currency_code)), ''), 'USD'),
    _rule,
    'calculated'
  )
  RETURNING * INTO _row;

  RETURN private.pm_commission_calc_to_jsonb(_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Owner statement RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pm_owner_statements(
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
  PERFORM private.pm_require_permission(_company_id, 'property.statements.view');

  RETURN COALESCE((
    SELECT jsonb_agg(private.pm_owner_statement_to_jsonb(s) ORDER BY s.period_start DESC, s.created_at DESC)
    FROM public.pm_owner_statements s
    WHERE s.company_id = _company_id
      AND (_owner_id IS NULL OR s.owner_id = _owner_id)
      AND (_property_id IS NULL OR s.property_id = _property_id)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR s.status = _status)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pm_owner_statement(
  _company_id UUID,
  _statement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _stmt public.pm_owner_statements%ROWTYPE;
  _lines JSONB;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.statements.view');

  SELECT * INTO _stmt
  FROM public.pm_owner_statements s
  WHERE s.id = _statement_id AND s.company_id = _company_id;

  IF _stmt.id IS NULL THEN
    RAISE EXCEPTION 'Statement not found';
  END IF;

  SELECT COALESCE(jsonb_agg(
    private.pm_owner_statement_line_to_jsonb(l) ORDER BY l.sort_order, l.line_date
  ), '[]'::jsonb) INTO _lines
  FROM public.pm_owner_statement_lines l
  WHERE l.statement_id = _statement_id AND l.company_id = _company_id;

  RETURN jsonb_build_object(
    'statement', private.pm_owner_statement_to_jsonb(_stmt),
    'lines', _lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_pm_owner_statement(
  _company_id UUID,
  _owner_id UUID,
  _property_id UUID DEFAULT NULL,
  _period_start DATE,
  _period_end DATE,
  _basis TEXT DEFAULT 'accrual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _stmt public.pm_owner_statements%ROWTYPE;
  _num TEXT;
  _currency CHAR(3) := 'USD';
  _income BIGINT := 0;
  _fees BIGINT := 0;
  _expenses BIGINT := 0;
  _reserve BIGINT := 0;
  _sort INT := 0;
  _rc RECORD;
  _rv RECORD;
  _cc RECORD;
  _owner_share BIGINT;
  _ownership_pct NUMERIC(7, 4);
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.statements.generate');
  PERFORM private.pm_require_enabled(_company_id);

  IF _owner_id IS NULL OR _period_start IS NULL OR _period_end IS NULL THEN
    RAISE EXCEPTION 'Owner and period are required';
  END IF;
  IF _period_end < _period_start THEN
    RAISE EXCEPTION 'Invalid statement period';
  END IF;
  IF COALESCE(_basis, 'accrual') NOT IN ('cash', 'accrual') THEN
    RAISE EXCEPTION 'Invalid basis';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pm_owners o WHERE o.id = _owner_id AND o.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Owner not found';
  END IF;

  _num := private.pm_allocate_number(_company_id, 'pm_owner_statement', 'OST-');

  INSERT INTO public.pm_owner_statements (
    company_id, statement_number, owner_id, property_id,
    period_start, period_end, basis, currency_code, status, notes
  ) VALUES (
    _company_id, _num, _owner_id, _property_id,
    _period_start, _period_end, COALESCE(_basis, 'accrual'), _currency,
    'draft', NULL
  )
  RETURNING * INTO _stmt;

  FOR _rc IN
    SELECT rc.*, po.ownership_pct, po.distribution_pct
    FROM public.pm_rent_charges rc
    INNER JOIN public.pm_property_ownership po ON po.company_id = rc.company_id
      AND po.property_id = rc.property_id
      AND po.owner_id = _owner_id
      AND po.effective_from <= _period_end
      AND (po.effective_to IS NULL OR po.effective_to >= _period_start)
    WHERE rc.company_id = _company_id
      AND rc.status IN ('posted', 'paid', 'partially_paid')
      AND rc.period_start <= _period_end
      AND rc.period_end >= _period_start
      AND (_property_id IS NULL OR rc.property_id = _property_id)
  LOOP
    _ownership_pct := COALESCE(_rc.distribution_pct, _rc.ownership_pct, 100);
    _owner_share := round(_rc.amount_minor * _ownership_pct / 100.0)::BIGINT;
    _income := _income + _owner_share;
    _sort := _sort + 10;
    _currency := _rc.currency_code;

    INSERT INTO public.pm_owner_statement_lines (
      company_id, statement_id, section, line_date, description,
      amount_minor, property_id, source_type, source_id, sort_order
    ) VALUES (
      _company_id, _stmt.id, 'rent', _rc.due_date,
      'Rent charge ' || _rc.charge_number,
      _owner_share, _rc.property_id, 'rent_charge', _rc.id, _sort
    );
  END LOOP;

  FOR _rv IN
    SELECT r.*, fl.line_type, fl.description AS line_desc,
           fl.owner_share_minor, fl.amount_minor AS line_amount,
           fl.id AS fin_line_id, po.ownership_pct, po.distribution_pct
    FROM public.pm_reservations r
    INNER JOIN public.pm_property_ownership po ON po.company_id = r.company_id
      AND po.property_id = r.property_id
      AND po.owner_id = _owner_id
      AND po.effective_from <= _period_end
      AND (po.effective_to IS NULL OR po.effective_to >= _period_start)
    LEFT JOIN public.pm_reservation_financial_lines fl ON fl.reservation_id = r.id
    WHERE r.company_id = _company_id
      AND r.status NOT IN ('cancelled', 'no_show')
      AND r.check_in <= _period_end
      AND r.check_out >= _period_start
      AND (_property_id IS NULL OR r.property_id = _property_id)
  LOOP
    IF _rv.fin_line_id IS NOT NULL THEN
      _owner_share := COALESCE(_rv.owner_share_minor, 0);
    ELSE
      _ownership_pct := COALESCE(_rv.distribution_pct, _rv.ownership_pct, 100);
      _owner_share := round(COALESCE(_rv.host_payout_minor, 0) * _ownership_pct / 100.0)::BIGINT;
    END IF;

    IF _owner_share = 0 THEN
      CONTINUE;
    END IF;

    _income := _income + _owner_share;
    _sort := _sort + 10;
    _currency := _rv.currency_code;

    INSERT INTO public.pm_owner_statement_lines (
      company_id, statement_id, section, line_date, description,
      amount_minor, property_id, source_type, source_id, sort_order
    ) VALUES (
      _company_id, _stmt.id, 'reservation', _rv.check_in,
      COALESCE(_rv.line_desc, 'Reservation ' || COALESCE(_rv.external_reservation_id, _rv.id::text)),
      _owner_share, _rv.property_id, 'reservation',
      COALESCE(_rv.fin_line_id, _rv.id), _sort
    );
  END LOOP;

  FOR _cc IN
    SELECT cc.*, po.ownership_pct, po.distribution_pct
    FROM public.pm_commission_calculations cc
    INNER JOIN public.pm_property_ownership po ON po.company_id = cc.company_id
      AND po.property_id = cc.property_id
      AND po.owner_id = _owner_id
      AND po.effective_from <= _period_end
      AND (po.effective_to IS NULL OR po.effective_to >= _period_start)
    WHERE cc.company_id = _company_id
      AND cc.status IN ('calculated', 'posted')
      AND cc.period_start <= _period_end
      AND cc.period_end >= _period_start
      AND (_property_id IS NULL OR cc.property_id = _property_id)
  LOOP
    _ownership_pct := COALESCE(_cc.distribution_pct, _cc.ownership_pct, 100);
    _owner_share := round(_cc.commission_minor * _ownership_pct / 100.0)::BIGINT;
    _fees := _fees + _owner_share;
    _sort := _sort + 10;

    INSERT INTO public.pm_owner_statement_lines (
      company_id, statement_id, section, line_date, description,
      amount_minor, property_id, source_type, source_id, sort_order
    ) VALUES (
      _company_id, _stmt.id, 'fee', _cc.period_end,
      'Management commission',
      -_owner_share, _cc.property_id, 'commission', _cc.id, _sort
    );
  END LOOP;

  SELECT COALESCE(ma.minimum_reserve_minor, 0) INTO _reserve
  FROM public.pm_management_agreements ma
  WHERE ma.company_id = _company_id
    AND ma.status = 'active'
    AND ma.owner_id = _owner_id
    AND (_property_id IS NULL OR ma.property_id = _property_id)
    AND ma.start_date <= _period_end
    AND (ma.end_date IS NULL OR ma.end_date >= _period_start)
  ORDER BY ma.version_no DESC
  LIMIT 1;

  _reserve := COALESCE(_reserve, 0);

  UPDATE public.pm_owner_statements SET
    currency_code = _currency,
    income_minor = _income,
    expenses_minor = _expenses,
    fees_minor = _fees,
    closing_balance_minor = opening_balance_minor + _income - _expenses - _fees
      + contributions_minor - distributions_minor,
    reserve_required_minor = _reserve,
    available_for_distribution_minor = GREATEST(
      0,
      opening_balance_minor + _income - _expenses - _fees
        + contributions_minor - distributions_minor - _reserve
    ),
    status = 'calculated',
    calculated_at = now(),
    updated_at = now()
  WHERE id = _stmt.id AND company_id = _company_id
  RETURNING * INTO _stmt;

  RETURN public.get_pm_owner_statement(_company_id, _stmt.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_pm_owner_statement(
  _company_id UUID,
  _statement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _stmt public.pm_owner_statements%ROWTYPE;
  _snapshot JSONB;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.statements.approve');

  SELECT * INTO _stmt
  FROM public.pm_owner_statements s
  WHERE s.id = _statement_id AND s.company_id = _company_id
  FOR UPDATE;

  IF _stmt.id IS NULL THEN
    RAISE EXCEPTION 'Statement not found';
  END IF;

  IF _stmt.status IN ('approved', 'published', 'paid', 'partially_paid', 'closed') THEN
    RAISE EXCEPTION 'Statement is already approved or beyond';
  END IF;

  IF _stmt.status NOT IN ('calculated', 'ready_for_approval', 'exception_review') THEN
    RAISE EXCEPTION 'Statement must be calculated before approval';
  END IF;

  _snapshot := public.get_pm_owner_statement(_company_id, _statement_id);

  INSERT INTO public.pm_statement_snapshots (company_id, statement_id, snapshot, created_by)
  VALUES (_company_id, _statement_id, _snapshot, auth.uid())
  ON CONFLICT (statement_id) DO UPDATE SET
    snapshot = EXCLUDED.snapshot,
    created_by = EXCLUDED.created_by,
    created_at = now();

  UPDATE public.pm_owner_statements SET
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  WHERE id = _statement_id AND company_id = _company_id
  RETURNING * INTO _stmt;

  RETURN jsonb_build_object(
    'statement', private.pm_owner_statement_to_jsonb(_stmt),
    'snapshotId', (
      SELECT ss.id FROM public.pm_statement_snapshots ss WHERE ss.statement_id = _statement_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_pm_owner_statement(
  _company_id UUID,
  _statement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _stmt public.pm_owner_statements%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.statements.publish');

  SELECT * INTO _stmt
  FROM public.pm_owner_statements s
  WHERE s.id = _statement_id AND s.company_id = _company_id
  FOR UPDATE;

  IF _stmt.id IS NULL THEN
    RAISE EXCEPTION 'Statement not found';
  END IF;

  IF _stmt.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved statements can be published';
  END IF;

  UPDATE public.pm_owner_statements SET
    status = 'published',
    published_at = now(),
    updated_at = now()
  WHERE id = _statement_id AND company_id = _company_id
  RETURNING * INTO _stmt;

  RETURN private.pm_owner_statement_to_jsonb(_stmt);
END;
$$;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.list_pm_tenants(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_tenant(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_tenants(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_tenant(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_leases(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_lease(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, BIGINT, TEXT, TEXT,
  INTEGER, INTEGER, BIGINT, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_leases(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_lease(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, BIGINT, TEXT, TEXT,
  INTEGER, INTEGER, BIGINT, BIGINT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_rent_schedules(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_rent_schedule(
  UUID, UUID, UUID, DATE, DATE, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_rent_schedules(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_rent_schedule(
  UUID, UUID, UUID, DATE, DATE, BIGINT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_rent_charges(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_pm_rent_charge(
  UUID, UUID, DATE, DATE, DATE, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_rent_charges(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pm_rent_charge(
  UUID, UUID, DATE, DATE, DATE, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_security_deposits(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_security_deposit(
  UUID, UUID, UUID, BIGINT, TEXT, TEXT, DATE, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_security_deposits(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_security_deposit(
  UUID, UUID, UUID, BIGINT, TEXT, TEXT, DATE, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_reservations(UUID, UUID, TEXT, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_reservation(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, DATE, INTEGER,
  TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_reservations(UUID, UUID, TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_reservation(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, DATE, INTEGER,
  TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_fee_rules(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_pm_fee_rule(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, BIGINT, BIGINT,
  BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE, INTEGER, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_fee_rules(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pm_fee_rule(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, BIGINT, BIGINT,
  BOOLEAN, BOOLEAN, BOOLEAN, DATE, DATE, INTEGER, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.calculate_pm_commission(
  UUID, UUID, TEXT, UUID, BIGINT, TEXT, DATE, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_pm_commission(
  UUID, UUID, TEXT, UUID, BIGINT, TEXT, DATE, DATE
) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pm_owner_statements(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pm_owner_statement(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_pm_owner_statement(
  UUID, UUID, UUID, DATE, DATE, TEXT
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_pm_owner_statement(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_pm_owner_statement(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pm_owner_statements(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pm_owner_statement(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pm_owner_statement(
  UUID, UUID, UUID, DATE, DATE, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pm_owner_statement(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_pm_owner_statement(UUID, UUID) TO authenticated;