-- Real Estate Management foundation.
-- Development inventory, reservations, collections and revenue recognition.
-- Cash, invoices and milestones do not recognise revenue.
-- Capitalisable costs are stored and are not posted as assets.
-- Every journal goes through public.post_journal.
-- Rollback: drop realestate_* functions and tables in child-to-parent order.
-- Do not apply to hosted Supabase until backup evidence exists for qugoaaizclvkzesptovm.

ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'real_estate_deposit';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'real_estate_revenue';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'real_estate_commission';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'real_estate_cost';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'real_estate_refund';

INSERT INTO public.role_permissions (role, permission)
SELECT role::public.company_role, permission
FROM (VALUES ('owner'), ('admin')) AS roles(role)
CROSS JOIN (VALUES
  ('realestate.view'),
  ('realestate.manage'),
  ('realestate.inventory.manage'),
  ('realestate.sales.manage'),
  ('realestate.collections.manage'),
  ('realestate.post'),
  ('realestate.approve'),
  ('realestate.reverse'),
  ('realestate.commissions.manage'),
  ('realestate.costs.manage'),
  ('realestate.budgets.manage'),
  ('realestate.export'),
  ('realestate.admin')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'accountant'::public.company_role, permission
FROM (VALUES
  ('realestate.view'),
  ('realestate.manage'),
  ('realestate.inventory.manage'),
  ('realestate.sales.manage'),
  ('realestate.collections.manage'),
  ('realestate.post'),
  ('realestate.approve'),
  ('realestate.reverse'),
  ('realestate.commissions.manage'),
  ('realestate.costs.manage'),
  ('realestate.budgets.manage'),
  ('realestate.export')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'bookkeeper'::public.company_role, permission
FROM (VALUES
  ('realestate.view'),
  ('realestate.inventory.manage'),
  ('realestate.sales.manage'),
  ('realestate.collections.manage'),
  ('realestate.post'),
  ('realestate.costs.manage'),
  ('realestate.export')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'staff'::public.company_role, permission
FROM (VALUES
  ('realestate.view'),
  ('realestate.inventory.manage'),
  ('realestate.sales.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'read_only'::public.company_role, permission
FROM (VALUES ('realestate.view'), ('realestate.export')) AS perms(permission)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.realestate_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  area_unit TEXT NOT NULL DEFAULT 'sqm'
    CHECK (area_unit IN ('sqm', 'sqft', 'acre', 'hectare')),
  recognition_policy TEXT NOT NULL DEFAULT 'unset'
    CHECK (recognition_policy IN ('unset', 'point_in_time', 'over_time')),
  enforce_segregation BOOLEAN NOT NULL DEFAULT false,
  reservation_hold_days INTEGER NOT NULL DEFAULT 7 CHECK (reservation_hold_days BETWEEN 1 AND 365),
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 365),
  late_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK (late_fee_bps BETWEEN 0 AND 10000),
  country_code CHAR(2) NOT NULL DEFAULT 'US',
  account_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.realestate_counters (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, kind)
);

CREATE TABLE IF NOT EXISTS public.realestate_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'active', 'completed', 'archived')),
  currency_code CHAR(3) NOT NULL,
  start_on DATE,
  target_on DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  CONSTRAINT realestate_projects_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT realestate_projects_code_nonempty CHECK (length(trim(code)) > 0)
);

CREATE TABLE IF NOT EXISTS public.realestate_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.realestate_projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS public.realestate_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.realestate_projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.realestate_phases(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('building', 'tower', 'block', 'villa_cluster', 'warehouse', 'mixed', 'land')),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS public.realestate_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  structure_id UUID NOT NULL REFERENCES public.realestate_structures(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  UNIQUE (structure_id, label)
);

CREATE TABLE IF NOT EXISTS public.realestate_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.realestate_projects(id) ON DELETE RESTRICT,
  phase_id UUID REFERENCES public.realestate_phases(id) ON DELETE SET NULL,
  structure_id UUID REFERENCES public.realestate_structures(id) ON DELETE SET NULL,
  level_id UUID REFERENCES public.realestate_levels(id) ON DELETE SET NULL,
  unit_code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'apartment', 'villa', 'house', 'office', 'retail', 'warehouse', 'plot', 'industrial', 'parking', 'other'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'planned', 'under_development', 'available', 'on_hold', 'reserved', 'booked', 'under_agreement',
    'sold', 'fully_paid', 'ready_for_handover', 'handed_over', 'cancelled', 'resale', 'withdrawn'
  )),
  construction_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (construction_status IN ('not_started', 'in_progress', 'structure', 'finishing', 'complete')),
  carpet_area NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (carpet_area >= 0),
  built_up_area NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (built_up_area >= 0),
  saleable_area NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (saleable_area >= 0),
  land_area NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (land_area >= 0),
  list_price_minor BIGINT NOT NULL DEFAULT 0 CHECK (list_price_minor >= 0),
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, unit_code)
);

CREATE TABLE IF NOT EXISTS public.realestate_unit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.realestate_units(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('status', 'price')),
  from_value TEXT,
  to_value TEXT,
  amount_minor BIGINT,
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.realestate_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.realestate_units(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
  holder_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'released', 'converted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS realestate_holds_one_active
  ON public.realestate_holds (unit_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.realestate_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.realestate_projects(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.realestate_units(id) ON DELETE RESTRICT,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  hold_id UUID REFERENCES public.realestate_holds(id) ON DELETE SET NULL,
  sale_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'under_agreement', 'sold', 'cancelled')),
  contract_minor BIGINT NOT NULL CHECK (contract_minor > 0),
  collected_minor BIGINT NOT NULL DEFAULT 0 CHECK (collected_minor >= 0),
  recognised_minor BIGINT NOT NULL DEFAULT 0 CHECK (recognised_minor >= 0),
  liability_applied_minor BIGINT NOT NULL DEFAULT 0 CHECK (liability_applied_minor >= 0),
  cos_recognised_minor BIGINT NOT NULL DEFAULT 0 CHECK (cos_recognised_minor >= 0),
  currency_code CHAR(3) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE (company_id, sale_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS realestate_sales_one_open
  ON public.realestate_sales (unit_id) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.realestate_payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.realestate_sales(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sale_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS realestate_plans_one_active
  ON public.realestate_payment_plans (sale_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.realestate_instalments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.realestate_payment_plans(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.realestate_sales(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  due_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  allocated_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  CONSTRAINT realestate_instalments_allocation CHECK (allocated_minor <= amount_minor),
  UNIQUE (plan_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.realestate_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.realestate_sales(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  received_on DATE NOT NULL,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.realestate_collection_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.realestate_collections(id) ON DELETE CASCADE,
  instalment_id UUID NOT NULL REFERENCES public.realestate_instalments(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)
);

CREATE TABLE IF NOT EXISTS public.realestate_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.realestate_sales(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  refunded_on DATE NOT NULL,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.realestate_recognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.realestate_sales(id) ON DELETE RESTRICT,
  policy TEXT NOT NULL,
  revenue_minor BIGINT NOT NULL CHECK (revenue_minor > 0),
  liability_minor BIGINT NOT NULL CHECK (liability_minor >= 0),
  asset_minor BIGINT NOT NULL CHECK (asset_minor >= 0),
  cos_minor BIGINT NOT NULL CHECK (cos_minor >= 0),
  progress_bps INTEGER,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  calculation_ref TEXT NOT NULL,
  evidence_note TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT realestate_recognitions_balance CHECK (liability_minor + asset_minor = revenue_minor)
);

CREATE TABLE IF NOT EXISTS public.realestate_brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('employee', 'broker', 'agency', 'referral', 'channel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT realestate_brokers_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.realestate_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES public.realestate_brokers(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.realestate_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('contract', 'collected')),
  rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (rate_bps BETWEEN 0 AND 10000),
  fixed_minor BIGINT NOT NULL DEFAULT 0 CHECK (fixed_minor >= 0),
  withholding_bps INTEGER NOT NULL DEFAULT 0 CHECK (withholding_bps BETWEEN 0 AND 10000),
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_event TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.realestate_commission_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.realestate_sales(id) ON DELETE RESTRICT,
  broker_id UUID NOT NULL REFERENCES public.realestate_brokers(id) ON DELETE RESTRICT,
  rule_id UUID REFERENCES public.realestate_commission_rules(id) ON DELETE SET NULL,
  gross_minor BIGINT NOT NULL CHECK (gross_minor >= 0),
  withholding_minor BIGINT NOT NULL CHECK (withholding_minor >= 0),
  net_minor BIGINT NOT NULL CHECK (net_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('suggested', 'approved', 'posted', 'cancelled')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT,
  created_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT realestate_accruals_parts CHECK (gross_minor = withholding_minor + net_minor)
);

CREATE UNIQUE INDEX IF NOT EXISTS realestate_accruals_one_live
  ON public.realestate_commission_accruals (sale_id, broker_id)
  WHERE status IN ('suggested', 'approved', 'posted');

CREATE TABLE IF NOT EXISTS public.realestate_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.realestate_projects(id) ON DELETE RESTRICT,
  phase_id UUID REFERENCES public.realestate_phases(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN (
    'capitalisable', 'wip', 'inventory', 'fixed_asset', 'investment_property',
    'operating_expense', 'prepayment', 'accrual'
  )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  incurred_on DATE NOT NULL,
  vendor_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.realestate_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.realestate_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'superseded')),
  version INTEGER NOT NULL,
  created_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS realestate_budgets_one_approved
  ON public.realestate_budgets (project_id) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS public.realestate_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.realestate_budgets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0)
);

CREATE INDEX IF NOT EXISTS realestate_units_company_status_idx
  ON public.realestate_units (company_id, status);
CREATE INDEX IF NOT EXISTS realestate_sales_company_idx
  ON public.realestate_sales (company_id, status);
CREATE INDEX IF NOT EXISTS realestate_instalments_due_idx
  ON public.realestate_instalments (company_id, due_on);

CREATE OR REPLACE FUNCTION public.realestate_internal_require(_company_id UUID, _permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT public.has_company_permission(_company_id, _permission) THEN
    RAISE EXCEPTION 'Missing permission %', _permission;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_internal_enabled(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_settings WHERE company_id = _company_id AND enabled
  ) THEN
    RAISE EXCEPTION 'Real Estate Management is not activated for this organisation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_internal_account(_company_id UUID, _role TEXT)
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
  FROM public.realestate_settings WHERE company_id = _company_id;
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

CREATE OR REPLACE FUNCTION public.realestate_internal_number(_company_id UUID, _kind TEXT, _prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _value BIGINT;
BEGIN
  INSERT INTO public.realestate_counters (company_id, kind, last_value)
  VALUES (_company_id, _kind, 1)
  ON CONFLICT (company_id, kind)
  DO UPDATE SET last_value = public.realestate_counters.last_value + 1
  RETURNING last_value INTO _value;
  RETURN _prefix || lpad(_value::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_internal_status_allowed(_from TEXT, _to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (_from, _to) IN (
    ('planned', 'under_development'), ('planned', 'available'), ('planned', 'withdrawn'), ('planned', 'cancelled'),
    ('under_development', 'planned'), ('under_development', 'available'), ('under_development', 'on_hold'),
    ('under_development', 'withdrawn'), ('under_development', 'cancelled'),
    ('available', 'on_hold'), ('available', 'reserved'), ('available', 'withdrawn'), ('available', 'cancelled'),
    ('on_hold', 'available'), ('on_hold', 'reserved'), ('on_hold', 'withdrawn'), ('on_hold', 'cancelled'),
    ('reserved', 'available'), ('reserved', 'booked'), ('reserved', 'cancelled'),
    ('booked', 'under_agreement'), ('booked', 'available'), ('booked', 'cancelled'),
    ('under_agreement', 'sold'), ('under_agreement', 'booked'), ('under_agreement', 'available'), ('under_agreement', 'cancelled'),
    ('sold', 'fully_paid'), ('sold', 'under_agreement'), ('sold', 'available'), ('sold', 'cancelled'),
    ('fully_paid', 'ready_for_handover'), ('fully_paid', 'sold'), ('fully_paid', 'available'), ('fully_paid', 'cancelled'),
    ('ready_for_handover', 'handed_over'), ('ready_for_handover', 'fully_paid'), ('ready_for_handover', 'cancelled'),
    ('handed_over', 'resale'),
    ('resale', 'available'), ('resale', 'reserved'),
    ('withdrawn', 'planned'),
    ('cancelled', 'available'), ('cancelled', 'planned')
  )
$$;

CREATE OR REPLACE FUNCTION public.realestate_internal_transition(
  _company_id UUID, _unit_id UUID, _to TEXT, _reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _unit public.realestate_units;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _unit FROM public.realestate_units
  WHERE id = _unit_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found'; END IF;
  IF _unit.status = _to THEN RAISE EXCEPTION 'Property is already %', _to; END IF;
  IF NOT public.realestate_internal_status_allowed(_unit.status, _to) THEN
    RAISE EXCEPTION 'Cannot change a % property to %', _unit.status, _to;
  END IF;
  UPDATE public.realestate_units
  SET status = _to, version = version + 1, updated_at = now()
  WHERE id = _unit_id;
  INSERT INTO public.realestate_unit_events (
    company_id, unit_id, event_type, from_value, to_value, reason, actor_user_id
  ) VALUES (
    _company_id, _unit_id, 'status', _unit.status, _to, COALESCE(_reason, ''), auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_internal_post(
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
  _base TEXT;
  _elem JSONB;
  _debit BIGINT;
  _credit BIGINT;
  _sum_d BIGINT := 0;
  _sum_c BIGINT := 0;
  _clean JSONB := '[]'::JSONB;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT (
    public.has_company_permission(_company_id, 'accounting.post')
    OR public.has_company_permission(_company_id, 'journals.manual')
  ) THEN
    RAISE EXCEPTION 'Posting also requires accounting.post or journals.manual';
  END IF;
  SELECT upper(base_currency) INTO _base FROM public.companies WHERE id = _company_id;
  IF _currency IS NULL OR length(_currency) <> 3 THEN RAISE EXCEPTION 'Invalid currency_code'; END IF;
  IF upper(_currency) = _base AND _fx IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Base-currency postings use an exchange rate of 1';
  END IF;
  IF _fx IS NULL OR _fx <= 0 THEN RAISE EXCEPTION 'fx_rate_to_base must be positive'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'Journal requires at least two lines';
  END IF;
  FOR _elem IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    _debit := COALESCE((_elem->>'debit_minor')::BIGINT, 0);
    _credit := COALESCE((_elem->>'credit_minor')::BIGINT, 0);
    IF (_debit > 0 AND _credit > 0) OR (_debit = 0 AND _credit = 0) OR _debit < 0 OR _credit < 0 THEN
      RAISE EXCEPTION 'Each journal line must have one positive side';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = (_elem->>'account_id')::UUID AND company_id = _company_id
        AND is_active AND is_postable AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Account is not postable in this organisation';
    END IF;
    _sum_d := _sum_d + _debit;
    _sum_c := _sum_c + _credit;
    _clean := _clean || jsonb_build_array(jsonb_build_object(
      'account_id', _elem->>'account_id',
      'debit_minor', _debit,
      'credit_minor', _credit,
      'description', COALESCE(_elem->>'description', '')
    ));
  END LOOP;
  IF _sum_d <> _sum_c OR _sum_d = 0 THEN RAISE EXCEPTION 'Journal does not balance'; END IF;
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
  RETURN _journal;
END;
$$;
