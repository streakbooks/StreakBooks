-- Gym & Fitness Management.
-- Membership, scheduling and commercial balances live here.
-- Money posts only through public.post_journal. Disabling the module
-- leaves journals and subledger rows in place.

ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_membership';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_payment';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_recognition';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_refund';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_session';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_class';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_commission';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_voucher';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_cancellation';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_retail';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_maintenance';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'gym_royalty';

INSERT INTO public.role_permissions (role, permission)
SELECT role::public.company_role, permission
FROM (VALUES ('owner'), ('admin')) AS roles(role)
CROSS JOIN (VALUES
  ('gym.view'),
  ('gym.manage'),
  ('gym.post'),
  ('gym.approve'),
  ('gym.reverse'),
  ('gym.export'),
  ('gym.admin'),
  ('gym.members.manage'),
  ('gym.plans.manage'),
  ('gym.schedule.manage'),
  ('gym.attendance.manage'),
  ('gym.trainers.manage'),
  ('gym.billing.manage'),
  ('gym.portal.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'accountant'::public.company_role, permission
FROM (VALUES
  ('gym.view'),
  ('gym.post'),
  ('gym.approve'),
  ('gym.reverse'),
  ('gym.export'),
  ('gym.members.manage'),
  ('gym.billing.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'bookkeeper'::public.company_role, permission
FROM (VALUES
  ('gym.view'),
  ('gym.post'),
  ('gym.export'),
  ('gym.members.manage'),
  ('gym.billing.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'staff'::public.company_role, permission
FROM (VALUES
  ('gym.view'),
  ('gym.members.manage'),
  ('gym.schedule.manage'),
  ('gym.attendance.manage')
) AS perms(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
SELECT 'read_only'::public.company_role, permission
FROM (VALUES ('gym.view'), ('gym.export')) AS perms(permission)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gym_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  country_code CHAR(2) NOT NULL DEFAULT 'US',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  account_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_settings_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT gym_settings_country CHECK (country_code ~ '^[A-Z]{2}$')
);

CREATE TABLE IF NOT EXISTS public.gym_counters (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, kind)
);

CREATE TABLE IF NOT EXISTS public.gym_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('branch', 'franchise')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  CONSTRAINT gym_branches_name CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.gym_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  CONSTRAINT gym_plans_name CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.gym_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.gym_plans(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN (
    'day', 'week', 'month', 'quarter', 'half_year', 'year', 'lifetime', 'session', 'custom'
  )),
  term_count INTEGER NOT NULL CHECK (term_count BETWEEN 1 AND 3660),
  price_minor BIGINT NOT NULL CHECK (price_minor > 0),
  joining_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (joining_fee_minor >= 0),
  tax_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_bps BETWEEN 0 AND 10000),
  joining_fee_policy TEXT NOT NULL DEFAULT 'immediate' CHECK (joining_fee_policy IN ('immediate', 'defer')),
  recognition TEXT NOT NULL CHECK (recognition IN ('monthly', 'daily', 'immediate', 'session')),
  cancel_policy TEXT NOT NULL DEFAULT 'keep_deferred' CHECK (cancel_policy IN (
    'keep_deferred', 'refund_unrecognised', 'forfeit'
  )),
  session_count INTEGER CHECK (session_count IS NULL OR session_count > 0),
  access_before_payment BOOLEAN NOT NULL DEFAULT true,
  requires_acceptance BOOLEAN NOT NULL DEFAULT true,
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 60),
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  currency_code CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_no)
);

CREATE TABLE IF NOT EXISTS public.gym_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  payer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  guardian_member_id UUID REFERENCES public.gym_members(id) ON DELETE SET NULL,
  member_number TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'prospect', 'trial', 'active', 'inactive', 'frozen', 'suspended', 'expired', 'cancelled', 'archived'
  )),
  is_minor BOOLEAN NOT NULL DEFAULT false,
  health_notes TEXT,
  emergency_name TEXT,
  emergency_phone TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, member_number),
  CONSTRAINT gym_members_name CHECK (length(trim(display_name)) > 0),
  CONSTRAINT gym_members_minor_guardian CHECK (NOT is_minor OR guardian_member_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS gym_members_email_idx
  ON public.gym_members (company_id, lower(email))
  WHERE email IS NOT NULL AND status <> 'archived';

CREATE UNIQUE INDEX IF NOT EXISTS gym_members_portal_user_idx
  ON public.gym_members (company_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gym_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.gym_branches(id) ON DELETE RESTRICT,
  plan_version_id UUID NOT NULL REFERENCES public.gym_plan_versions(id) ON DELETE RESTRICT,
  renewed_from_id UUID REFERENCES public.gym_memberships(id) ON DELETE RESTRICT,
  membership_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending_payment', 'trial', 'active', 'frozen', 'suspended', 'expired', 'cancelled'
  )),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  price_minor BIGINT NOT NULL CHECK (price_minor > 0),
  joining_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (joining_fee_minor >= 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  deferred_minor BIGINT NOT NULL CHECK (deferred_minor >= 0),
  billing_interval TEXT NOT NULL,
  recognition TEXT NOT NULL,
  cancel_policy TEXT NOT NULL,
  joining_fee_policy TEXT NOT NULL,
  access_before_payment BOOLEAN NOT NULL,
  grace_days INTEGER NOT NULL DEFAULT 0,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  signature_name TEXT,
  accepted_at TIMESTAMPTZ,
  freeze_until DATE,
  currency_code CHAR(3) NOT NULL,
  fx_rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (fx_rate_to_base > 0),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, membership_number),
  UNIQUE (company_id, idempotency_key),
  UNIQUE (renewed_from_id),
  CONSTRAINT gym_memberships_dates CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS public.gym_recognition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.gym_memberships(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  recognise_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'recognised', 'cancelled')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  UNIQUE (membership_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.gym_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  membership_id UUID REFERENCES public.gym_memberships(id) ON DELETE RESTRICT,
  charge_number TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'membership', 'session', 'class', 'retail', 'royalty', 'maintenance', 'cancellation'
  )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  allocated_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'void')),
  charged_on DATE NOT NULL,
  memo TEXT,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, charge_number),
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT gym_charges_allocation CHECK (allocated_minor <= amount_minor)
);

CREATE TABLE IF NOT EXISTS public.gym_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  receipt_number TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  allocated_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'card_manual', 'pending_gateway')),
  status TEXT NOT NULL CHECK (status IN ('posted', 'pending', 'void')),
  evidence TEXT,
  received_on DATE NOT NULL,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, receipt_number),
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT gym_receipts_allocation CHECK (allocated_minor + refunded_minor <= amount_minor),
  CONSTRAINT gym_receipts_pending_has_no_journal CHECK (status <> 'pending' OR journal_id IS NULL),
  CONSTRAINT gym_receipts_posted_has_journal CHECK (status <> 'posted' OR journal_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.gym_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  remaining_minor BIGINT NOT NULL CHECK (remaining_minor >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'redeemed', 'void')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT gym_vouchers_remaining CHECK (remaining_minor <= amount_minor)
);

CREATE TABLE IF NOT EXISTS public.gym_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.gym_charges(id) ON DELETE RESTRICT,
  receipt_id UUID REFERENCES public.gym_receipts(id) ON DELETE RESTRICT,
  voucher_id UUID REFERENCES public.gym_vouchers(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_allocations_one_source CHECK (
    (receipt_id IS NOT NULL)::INTEGER + (voucher_id IS NOT NULL)::INTEGER = 1
  )
);

CREATE TABLE IF NOT EXISTS public.gym_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.gym_memberships(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  destination TEXT NOT NULL CHECK (destination IN ('bank', 'accounts_receivable')),
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.gym_trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('employee', 'contractor')),
  commission_kind TEXT NOT NULL DEFAULT 'percent' CHECK (commission_kind IN ('fixed', 'percent', 'tiered')),
  commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
  commission_fixed_minor BIGINT NOT NULL DEFAULT 0 CHECK (commission_fixed_minor >= 0),
  commission_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  certification_expires_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_trainers_name CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.gym_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.gym_branches(id) ON DELETE RESTRICT,
  trainer_id UUID REFERENCES public.gym_trainers(id) ON DELETE RESTRICT,
  member_id UUID REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  room_code TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'confirmed', 'cancelled', 'completed', 'no_show')),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT gym_appointments_range CHECK (starts_at < ends_at),
  CONSTRAINT gym_appointments_resource CHECK (trainer_id IS NOT NULL OR room_code IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.gym_class_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  price_minor BIGINT NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  instructor_id UUID REFERENCES public.gym_trainers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gym_class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.gym_class_templates(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES public.gym_trainers(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_class_sessions_range CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS public.gym_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.gym_class_sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('registered', 'waitlisted', 'cancelled', 'attended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gym_bookings_live_member_idx
  ON public.gym_bookings (session_id, member_id)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.gym_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  membership_id UUID REFERENCES public.gym_memberships(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.gym_branches(id) ON DELETE SET NULL,
  attended_on DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'qr', 'barcode')),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.gym_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.gym_members(id) ON DELETE RESTRICT,
  trainer_id UUID REFERENCES public.gym_trainers(id) ON DELETE SET NULL,
  sessions_purchased INTEGER NOT NULL CHECK (sessions_purchased > 0),
  sessions_remaining INTEGER NOT NULL CHECK (sessions_remaining >= 0),
  price_minor BIGINT NOT NULL CHECK (price_minor > 0),
  liability_minor BIGINT NOT NULL CHECK (liability_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'exhausted', 'cancelled')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT gym_packages_remaining CHECK (sessions_remaining <= sessions_purchased),
  CONSTRAINT gym_packages_liability CHECK (liability_minor <= price_minor)
);

CREATE TABLE IF NOT EXISTS public.gym_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.gym_trainers(id) ON DELETE RESTRICT,
  package_id UUID REFERENCES public.gym_packages(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'reversed')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.gym_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.gym_branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'equipment',
  fixed_asset_id UUID,
  maintenance_due_on DATE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'down', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gym_equipment_name CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.gym_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'lost')),
  member_id UUID REFERENCES public.gym_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gym_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.gym_branches(id) ON DELETE CASCADE,
  budget_year INTEGER NOT NULL CHECK (budget_year BETWEEN 2000 AND 2200),
  budget_month INTEGER NOT NULL CHECK (budget_month BETWEEN 1 AND 12),
  role TEXT NOT NULL CHECK (role IN ('membership_revenue', 'trainer_cost', 'maintenance')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gym_budget_lines_key_idx
  ON public.gym_budget_lines (
    company_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID),
    budget_year,
    budget_month,
    role
  );

CREATE INDEX IF NOT EXISTS gym_memberships_company_status_idx
  ON public.gym_memberships (company_id, status);
CREATE INDEX IF NOT EXISTS gym_recognition_due_idx
  ON public.gym_recognition_lines (company_id, status, recognise_on);
CREATE INDEX IF NOT EXISTS gym_appointments_trainer_idx
  ON public.gym_appointments (trainer_id, starts_at, ends_at);

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$ BEGIN
  ALTER TABLE public.gym_appointments
    ADD CONSTRAINT gym_appointments_trainer_no_overlap
    EXCLUDE USING gist (
      trainer_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status IN ('booked', 'confirmed') AND trainer_id IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.gym_require(_company_id UUID, _permission TEXT)
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

CREATE OR REPLACE FUNCTION public.gym_enabled(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_settings WHERE company_id = _company_id AND enabled
  ) THEN
    RAISE EXCEPTION 'Gym & Fitness Management is not activated for this organisation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_mapped_account(_company_id UUID, _role TEXT)
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
  FROM public.gym_settings WHERE company_id = _company_id;
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

CREATE OR REPLACE FUNCTION public.gym_next_number(_company_id UUID, _kind TEXT, _prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _value BIGINT;
BEGIN
  INSERT INTO public.gym_counters (company_id, kind, last_value)
  VALUES (_company_id, _kind, 1)
  ON CONFLICT (company_id, kind)
  DO UPDATE SET last_value = public.gym_counters.last_value + 1
  RETURNING last_value INTO _value;
  RETURN _prefix || lpad(_value::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_post_balanced(
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
  _clean JSONB := '[]'::JSONB;
  _elem JSONB;
  _ord BIGINT;
  _debit BIGINT;
  _credit BIGINT;
  _account UUID;
  _base CHAR(3);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NOT (
    public.has_company_permission(_company_id, 'accounting.post')
    OR public.has_company_permission(_company_id, 'journals.manual')
  ) THEN
    RAISE EXCEPTION 'Posting also requires accounting.post or journals.manual';
  END IF;
  IF _fx IS NULL OR _fx <= 0 THEN RAISE EXCEPTION 'fx_rate_to_base must be positive'; END IF;
  IF _currency IS NULL OR length(_currency) <> 3 THEN RAISE EXCEPTION 'Invalid currency_code'; END IF;
  SELECT base_currency INTO _base FROM public.companies WHERE id = _company_id;
  IF upper(_currency) <> _base AND _fx = 1 THEN
    RAISE EXCEPTION 'fx_rate_to_base is required when the currency differs from the organisation currency';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'Journal requires at least two lines';
  END IF;
  FOR _elem, _ord IN SELECT value, ordinality FROM jsonb_array_elements(_lines) WITH ORDINALITY
  LOOP
    _account := NULLIF(_elem->>'account_id', '')::UUID;
    _debit := COALESCE((_elem->>'debit_minor')::BIGINT, 0);
    _credit := COALESCE((_elem->>'credit_minor')::BIGINT, 0);
    IF _account IS NULL THEN RAISE EXCEPTION 'Line % needs an account', _ord; END IF;
    IF (_debit > 0 AND _credit > 0) OR (_debit = 0 AND _credit = 0) OR _debit < 0 OR _credit < 0 THEN
      RAISE EXCEPTION 'Line % must have a single positive side', _ord;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = _account AND company_id = _company_id AND is_active AND is_postable AND archived_at IS NULL
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
      SELECT SUM(COALESCE((elem->>'debit_minor')::BIGINT, 0)) AS debits,
             SUM(COALESCE((elem->>'credit_minor')::BIGINT, 0)) AS credits
      FROM jsonb_array_elements(_lines) AS elem
    ) totals
    WHERE totals.debits <> totals.credits OR totals.debits = 0
  ) THEN
    RAISE EXCEPTION 'Journal does not balance';
  END IF;
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

CREATE OR REPLACE FUNCTION public.gym_upsert_settings(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _currency CHAR(3);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.admin');
  _currency := upper(COALESCE(_payload->>'currency_code', 'USD'));
  IF length(_currency) <> 3 THEN RAISE EXCEPTION 'Invalid currency_code'; END IF;
  INSERT INTO public.gym_settings (company_id, enabled, currency_code, country_code, timezone, account_map)
  VALUES (
    _company_id,
    COALESCE((_payload->>'enabled')::BOOLEAN, false),
    _currency,
    upper(COALESCE(_payload->>'country_code', 'US')),
    COALESCE(NULLIF(_payload->>'timezone', ''), 'UTC'),
    COALESCE(_payload->'account_map', '{}'::JSONB)
  )
  ON CONFLICT (company_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    currency_code = EXCLUDED.currency_code,
    country_code = EXCLUDED.country_code,
    timezone = EXCLUDED.timezone,
    account_map = EXCLUDED.account_map,
    version = public.gym_settings.version + 1,
    updated_at = now();
  RETURN jsonb_build_object('id', _company_id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_create_branch(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.admin');
  INSERT INTO public.gym_branches (company_id, code, name, kind, timezone)
  VALUES (
    _company_id,
    trim(_payload->>'code'),
    trim(_payload->>'name'),
    COALESCE(_payload->>'kind', 'branch'),
    COALESCE(NULLIF(_payload->>'timezone', ''), 'UTC')
  )
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_save_plan(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan UUID;
  _version INTEGER;
  _version_id UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.plans.manage');
  IF COALESCE(_payload->>'recognition', '') = 'session' AND NULLIF(_payload->>'session_count', '') IS NULL THEN
    RAISE EXCEPTION 'Session plans need a session count';
  END IF;
  IF _payload->>'billing_interval' = 'lifetime' AND _payload->>'recognition' = 'monthly'
     AND COALESCE((_payload->>'term_count')::INTEGER, 0) < 1 THEN
    RAISE EXCEPTION 'Lifetime plans recognised monthly need an explicit term';
  END IF;
  SELECT id INTO _plan FROM public.gym_plans
  WHERE company_id = _company_id AND code = trim(_payload->>'code');
  IF _plan IS NULL THEN
    INSERT INTO public.gym_plans (company_id, code, name)
    VALUES (_company_id, trim(_payload->>'code'), trim(_payload->>'name'))
    RETURNING id INTO _plan;
    _version := 1;
  ELSE
    UPDATE public.gym_plans SET name = trim(_payload->>'name') WHERE id = _plan;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO _version
    FROM public.gym_plan_versions WHERE plan_id = _plan;
  END IF;
  INSERT INTO public.gym_plan_versions (
    company_id, plan_id, version_no, billing_interval, term_count, price_minor, joining_fee_minor,
    tax_bps, joining_fee_policy, recognition, cancel_policy, session_count, access_before_payment,
    requires_acceptance, grace_days, auto_renew, currency_code
  ) VALUES (
    _company_id, _plan, _version,
    _payload->>'billing_interval',
    (_payload->>'term_count')::INTEGER,
    (_payload->>'price_minor')::BIGINT,
    COALESCE((_payload->>'joining_fee_minor')::BIGINT, 0),
    COALESCE((_payload->>'tax_bps')::INTEGER, 0),
    COALESCE(_payload->>'joining_fee_policy', 'immediate'),
    _payload->>'recognition',
    COALESCE(_payload->>'cancel_policy', 'keep_deferred'),
    NULLIF(_payload->>'session_count', '')::INTEGER,
    COALESCE((_payload->>'access_before_payment')::BOOLEAN, true),
    COALESCE((_payload->>'requires_acceptance')::BOOLEAN, true),
    COALESCE((_payload->>'grace_days')::INTEGER, 0),
    COALESCE((_payload->>'auto_renew')::BOOLEAN, false),
    upper(COALESCE(_payload->>'currency_code', 'USD'))
  ) RETURNING id INTO _version_id;
  RETURN jsonb_build_object('id', _plan, 'status', 'saved', 'replayed', false, 'kind', _version_id::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_create_member(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _contact UUID;
  _payer UUID;
  _guardian UUID;
  _minor BOOLEAN := COALESCE((_payload->>'is_minor')::BOOLEAN, false);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  _contact := NULLIF(_payload->>'contact_id', '')::UUID;
  _payer := NULLIF(_payload->>'payer_contact_id', '')::UUID;
  _guardian := NULLIF(_payload->>'guardian_member_id', '')::UUID;
  IF _minor AND _guardian IS NULL THEN
    RAISE EXCEPTION 'A child member needs a guardian in this organisation';
  END IF;
  IF _contact IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE id = _contact AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Contact is not in this organisation';
  END IF;
  IF _payer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE id = _payer AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Payer is not in this organisation';
  END IF;
  IF _guardian IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gym_members WHERE id = _guardian AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Guardian is not a member of this organisation';
  END IF;
  IF NULLIF(_payload->>'email', '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gym_members
    WHERE company_id = _company_id AND lower(email) = lower(_payload->>'email') AND status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'A member with this email already exists';
  END IF;
  INSERT INTO public.gym_members (
    company_id, contact_id, payer_contact_id, guardian_member_id, member_number, display_name,
    email, phone, status, is_minor, health_notes, emergency_name, emergency_phone
  ) VALUES (
    _company_id, _contact, _payer, _guardian,
    public.gym_next_number(_company_id, 'member', 'MBR-'),
    trim(_payload->>'display_name'),
    NULLIF(lower(trim(COALESCE(_payload->>'email', ''))), ''),
    NULLIF(_payload->>'phone', ''),
    COALESCE(_payload->>'status', 'prospect'),
    _minor,
    NULLIF(_payload->>'health_notes', ''),
    NULLIF(_payload->>'emergency_name', ''),
    NULLIF(_payload->>'emergency_phone', '')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_import_members(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row JSONB;
  _ready INTEGER := 0;
  _duplicates INTEGER := 0;
  _errors INTEGER := 0;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  IF jsonb_typeof(_payload) <> 'array' THEN RAISE EXCEPTION 'Import payload must be a list'; END IF;
  FOR _row IN SELECT value FROM jsonb_array_elements(_payload)
  LOOP
    BEGIN
      IF length(trim(COALESCE(_row->>'display_name', ''))) = 0 THEN
        RAISE EXCEPTION 'Display name is required';
      END IF;
      IF NULLIF(_row->>'email', '') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.gym_members
        WHERE company_id = _company_id AND lower(email) = lower(_row->>'email') AND status <> 'archived'
      ) THEN
        _duplicates := _duplicates + 1;
      ELSE
        PERFORM public.gym_create_member(_company_id, _row);
        _ready := _ready + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%already exists%' THEN
        _duplicates := _duplicates + 1;
      ELSE
        _errors := _errors + 1;
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('status', 'saved', 'replayed', false, 'reason',
    format('ready %s, duplicates %s, errors %s', _ready, _duplicates, _errors));
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_activate_membership(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing UUID;
  _journal UUID;
  _member UUID;
  _version public.gym_plan_versions%ROWTYPE;
  _id UUID;
  _months INTEGER;
  _ends DATE;
  _starts DATE;
  _tax BIGINT;
  _deferred BIGINT;
  _immediate_joining BIGINT;
  _total BIGINT;
  _base BIGINT;
  _assigned BIGINT := 0;
  _amount BIGINT;
  _on DATE;
  _i INTEGER;
  _days INTEGER;
  _lines JSONB := '[]'::JSONB;
  _status TEXT;
  _currency CHAR(3);
  _fx NUMERIC;
  _number TEXT;
  _charge UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;
  SELECT id, journal_id INTO _existing, _journal
  FROM public.gym_memberships
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', _existing, 'journal_id', _journal, 'status', 'saved', 'replayed', true);
  END IF;
  _member := (_payload->>'member_id')::UUID;
  IF NOT EXISTS (SELECT 1 FROM public.gym_members WHERE id = _member AND company_id = _company_id AND status <> 'archived') THEN
    RAISE EXCEPTION 'Member is not in this organisation';
  END IF;
  SELECT v.* INTO _version
  FROM public.gym_plan_versions v
  JOIN public.gym_plans p ON p.id = v.plan_id
  WHERE p.id = (_payload->>'plan_id')::UUID AND p.company_id = _company_id AND p.status = 'active'
  ORDER BY v.version_no DESC
  LIMIT 1;
  IF _version.id IS NULL THEN RAISE EXCEPTION 'Plan is not available'; END IF;
  IF _version.billing_interval = 'session' THEN
    RAISE EXCEPTION 'Session packages are sold separately from memberships';
  END IF;
  IF _version.requires_acceptance AND length(trim(COALESCE(_payload->>'signature_name', ''))) = 0 THEN
    RAISE EXCEPTION 'Contract acceptance name is required';
  END IF;
  _starts := (_payload->>'starts_on')::DATE;
  IF _starts IS NULL THEN RAISE EXCEPTION 'starts_on is required'; END IF;
  _months := CASE _version.billing_interval
    WHEN 'month' THEN _version.term_count
    WHEN 'quarter' THEN _version.term_count * 3
    WHEN 'half_year' THEN _version.term_count * 6
    WHEN 'year' THEN _version.term_count * 12
    WHEN 'lifetime' THEN _version.term_count
    ELSE NULL
  END;
  IF _version.billing_interval IN ('day', 'week', 'custom') THEN
    _days := CASE _version.billing_interval
      WHEN 'day' THEN _version.term_count
      WHEN 'week' THEN _version.term_count * 7
      ELSE _version.term_count
    END;
    _ends := _starts + _days - 1;
  ELSIF _months IS NOT NULL THEN
    _ends := (_starts + (_months || ' months')::INTERVAL)::DATE - 1;
  ELSE
    RAISE EXCEPTION 'Plan interval is not supported';
  END IF;
  _tax := ((_version.price_minor + _version.joining_fee_minor) * _version.tax_bps + 5000) / 10000;
  _immediate_joining := CASE WHEN _version.joining_fee_policy = 'immediate' THEN _version.joining_fee_minor ELSE 0 END;
  _deferred := _version.price_minor + CASE WHEN _version.joining_fee_policy = 'defer' THEN _version.joining_fee_minor ELSE 0 END;
  IF _version.recognition = 'immediate' THEN
    _immediate_joining := _immediate_joining + _deferred;
    _deferred := 0;
  END IF;
  _total := _version.price_minor + _version.joining_fee_minor + _tax;
  _status := CASE
    WHEN COALESCE((_payload->>'trial')::BOOLEAN, false) THEN 'trial'
    WHEN NOT _version.access_before_payment THEN 'pending_payment'
    ELSE 'active'
  END;
  _currency := _version.currency_code;
  _fx := COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1);
  _number := public.gym_next_number(_company_id, 'membership', 'GMS-');
  INSERT INTO public.gym_memberships (
    company_id, member_id, branch_id, plan_version_id, renewed_from_id, membership_number, status,
    starts_on, ends_on, price_minor, joining_fee_minor, tax_minor, deferred_minor, billing_interval,
    recognition, cancel_policy, joining_fee_policy, access_before_payment, grace_days, auto_renew,
    signature_name, accepted_at, currency_code, fx_rate_to_base, idempotency_key
  ) VALUES (
    _company_id, _member, NULLIF(_payload->>'branch_id', '')::UUID, _version.id,
    NULLIF(_payload->>'renewed_from_id', '')::UUID, _number, _status, _starts, _ends,
    _version.price_minor, _version.joining_fee_minor, _tax, _deferred, _version.billing_interval,
    _version.recognition, _version.cancel_policy, _version.joining_fee_policy, _version.access_before_payment,
    _version.grace_days, _version.auto_renew,
    NULLIF(trim(COALESCE(_payload->>'signature_name', '')), ''),
    CASE WHEN NULLIF(trim(COALESCE(_payload->>'signature_name', '')), '') IS NULL THEN NULL ELSE now() END,
    _currency, _fx, _payload->>'idempotency_key'
  ) RETURNING id INTO _id;

  IF _deferred > 0 AND _version.recognition = 'monthly' THEN
    IF _months IS NULL OR _months < 1 THEN
      RAISE EXCEPTION 'Monthly recognition needs a month term';
    END IF;
    _base := _deferred / _months;
    FOR _i IN 0.._months - 1 LOOP
      _amount := CASE WHEN _i = _months - 1 THEN _deferred - _assigned ELSE _base END;
      _assigned := _assigned + _amount;
      IF _amount > 0 THEN
        _on := (_starts + (_i || ' months')::INTERVAL)::DATE;
        INSERT INTO public.gym_recognition_lines (company_id, membership_id, line_no, recognise_on, amount_minor)
        VALUES (_company_id, _id, _i + 1, _on, _amount);
      END IF;
    END LOOP;
  ELSIF _deferred > 0 AND _version.recognition = 'daily' THEN
    _days := (_ends - _starts) + 1;
    _base := _deferred / _days;
    FOR _i IN 0.._days - 1 LOOP
      _amount := CASE WHEN _i = _days - 1 THEN _deferred - _assigned ELSE _base END;
      _assigned := _assigned + _amount;
      IF _amount > 0 THEN
        INSERT INTO public.gym_recognition_lines (company_id, membership_id, line_no, recognise_on, amount_minor)
        VALUES (_company_id, _id, _i + 1, _starts + _i, _amount);
      END IF;
    END LOOP;
  ELSIF _deferred > 0 THEN
    RAISE EXCEPTION 'Recognition method % cannot defer this plan', _version.recognition;
  END IF;
  IF _deferred > 0 AND (SELECT COALESCE(SUM(amount_minor), 0) FROM public.gym_recognition_lines WHERE membership_id = _id) <> _deferred THEN
    RAISE EXCEPTION 'Recognition schedule does not equal deferred membership';
  END IF;

  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'account_id', public.gym_mapped_account(_company_id, 'accounts_receivable'),
    'debit_minor', _total, 'credit_minor', 0, 'description', 'Membership invoice'
  ));
  IF _deferred > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.gym_mapped_account(_company_id, 'deferred_membership_revenue'),
      'debit_minor', 0, 'credit_minor', _deferred, 'description', 'Deferred membership'
    ));
  END IF;
  IF _immediate_joining > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.gym_mapped_account(_company_id, CASE WHEN _version.recognition = 'immediate' AND _version.joining_fee_minor = 0 THEN 'membership_revenue' ELSE 'joining_fee_revenue' END),
      'debit_minor', 0, 'credit_minor', _immediate_joining, 'description', 'Earned on invoice'
    ));
  END IF;
  IF _version.recognition = 'immediate' AND _version.joining_fee_minor > 0 AND _deferred = 0 THEN
    NULL;
  END IF;
  IF _tax > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.gym_mapped_account(_company_id, 'tax_liability'),
      'debit_minor', 0, 'credit_minor', _tax, 'description', 'Tax on membership invoice'
    ));
  END IF;
  IF _version.recognition = 'immediate' AND _version.price_minor > 0 AND _version.joining_fee_minor > 0 THEN
    -- The combined earned amount was credited to joining_fee_revenue above. Split the membership portion.
    _lines := (
      SELECT jsonb_agg(elem) FROM jsonb_array_elements(_lines) elem
      WHERE elem->>'description' IS DISTINCT FROM 'Earned on invoice'
    );
    _lines := _lines || jsonb_build_array(
      jsonb_build_object(
        'account_id', public.gym_mapped_account(_company_id, 'membership_revenue'),
        'debit_minor', 0, 'credit_minor', _version.price_minor, 'description', 'Membership revenue'
      ),
      jsonb_build_object(
        'account_id', public.gym_mapped_account(_company_id, 'joining_fee_revenue'),
        'debit_minor', 0, 'credit_minor', _version.joining_fee_minor, 'description', 'Joining fee'
      )
    );
  END IF;

  _journal := public.gym_post_balanced(
    _company_id, 'gym_membership', _id, _starts,
    'Membership ' || _number, _currency, _fx, 'gym-membership-' || _id::TEXT, _lines
  );
  UPDATE public.gym_memberships SET journal_id = _journal WHERE id = _id;
  INSERT INTO public.gym_charges (
    company_id, member_id, membership_id, charge_number, kind, amount_minor, charged_on, journal_id, idempotency_key
  ) VALUES (
    _company_id, _member, _id, public.gym_next_number(_company_id, 'charge', 'GCH-'),
    'membership', _total, _starts, _journal, 'gym-charge-' || _id::TEXT
  ) RETURNING id INTO _charge;
  UPDATE public.gym_members SET status = CASE WHEN status = 'prospect' THEN 'active' ELSE status END
  WHERE id = _member;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (_company_id, auth.uid(), 'gym.membership.activated', 'gym_membership', _id,
    jsonb_build_object('journal_id', _journal, 'charge_id', _charge));
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', _status, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_allocate(
  _company_id UUID,
  _member_id UUID,
  _amount BIGINT,
  _receipt_id UUID,
  _voucher_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _left BIGINT := _amount;
  _charge RECORD;
  _take BIGINT;
BEGIN
  FOR _charge IN
    SELECT id, amount_minor - allocated_minor AS open_amount
    FROM public.gym_charges
    WHERE company_id = _company_id AND member_id = _member_id AND status = 'open'
      AND amount_minor > allocated_minor
    ORDER BY charged_on, created_at
    FOR UPDATE
  LOOP
    EXIT WHEN _left = 0;
    _take := LEAST(_left, _charge.open_amount);
    INSERT INTO public.gym_allocations (company_id, charge_id, receipt_id, voucher_id, amount_minor)
    VALUES (_company_id, _charge.id, _receipt_id, _voucher_id, _take);
    UPDATE public.gym_charges
    SET allocated_minor = allocated_minor + _take,
        status = CASE WHEN allocated_minor + _take = amount_minor THEN 'settled' ELSE 'open' END
    WHERE id = _charge.id;
    _left := _left - _take;
  END LOOP;
  RETURN _amount - _left;
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_record_receipt(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing UUID;
  _journal UUID;
  _member UUID;
  _amount BIGINT;
  _method TEXT;
  _id UUID;
  _allocated BIGINT := 0;
  _currency CHAR(3);
  _fx NUMERIC;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.billing.manage');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  SELECT id, journal_id INTO _existing, _journal FROM public.gym_receipts
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', _existing, 'journal_id', _journal, 'status', 'saved', 'replayed', true);
  END IF;
  _method := _payload->>'method';
  IF _method IN ('card_gateway', 'upi', 'direct_debit') THEN
    RAISE EXCEPTION 'Gateway payments stay pending until a verified provider confirmation exists';
  END IF;
  _member := (_payload->>'member_id')::UUID;
  _amount := (_payload->>'amount_minor')::BIGINT;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Receipt must be positive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gym_members WHERE id = _member AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Member is not in this organisation';
  END IF;
  _currency := upper(COALESCE(_payload->>'currency_code', (SELECT currency_code FROM public.gym_settings WHERE company_id = _company_id), 'USD'));
  _fx := COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1);
  IF _method = 'pending_gateway' THEN
    INSERT INTO public.gym_receipts (
      company_id, member_id, receipt_number, amount_minor, method, status, evidence, received_on, idempotency_key
    ) VALUES (
      _company_id, _member, public.gym_next_number(_company_id, 'receipt', 'GRC-'), _amount,
      'pending_gateway', 'pending', NULLIF(_payload->>'evidence', ''), COALESCE((_payload->>'received_on')::DATE, CURRENT_DATE),
      _payload->>'idempotency_key'
    ) RETURNING id INTO _id;
    RETURN jsonb_build_object('id', _id, 'status', 'pending', 'replayed', false, 'reason', 'No journal was posted');
  END IF;
  IF _method = 'card_manual' AND length(trim(COALESCE(_payload->>'evidence', ''))) < 3 THEN
    RAISE EXCEPTION 'A manual card receipt needs evidence of collection';
  END IF;
  IF _method NOT IN ('cash', 'bank_transfer', 'card_manual') THEN
    RAISE EXCEPTION 'Payment method is not available';
  END IF;
  _id := gen_random_uuid();
  _journal := public.gym_post_balanced(
    _company_id, 'gym_payment', _id, COALESCE((_payload->>'received_on')::DATE, CURRENT_DATE),
    'Member receipt', _currency, _fx, 'gym-receipt-' || _id::TEXT,
    jsonb_build_array(
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'bank'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Member receipt'),
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'accounts_receivable'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Receipt applied to receivable')
    )
  );
  INSERT INTO public.gym_receipts (
    id, company_id, member_id, receipt_number, amount_minor, method, status, evidence, received_on,
    journal_id, idempotency_key
  ) VALUES (
    _id, _company_id, _member, public.gym_next_number(_company_id, 'receipt', 'GRC-'), _amount,
    _method, 'posted', NULLIF(_payload->>'evidence', ''), COALESCE((_payload->>'received_on')::DATE, CURRENT_DATE),
    _journal, _payload->>'idempotency_key'
  );
  _allocated := public.gym_allocate(_company_id, _member, _amount, _id, NULL);
  UPDATE public.gym_receipts SET allocated_minor = _allocated WHERE id = _id;
  UPDATE public.gym_memberships SET status = 'active'
  WHERE company_id = _company_id AND member_id = _member AND status = 'pending_payment'
    AND NOT access_before_payment
    AND id IN (
      SELECT membership_id FROM public.gym_charges
      WHERE company_id = _company_id AND status = 'settled' AND kind = 'membership'
    );
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'posted', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_recognise_due(_company_id UUID, _as_of DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _line RECORD;
  _count INTEGER := 0;
  _journal UUID;
  _currency CHAR(3);
  _fx NUMERIC;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF _as_of IS NULL THEN RAISE EXCEPTION 'as_of is required'; END IF;
  FOR _line IN
    SELECT l.id, l.amount_minor, l.recognise_on, m.currency_code, m.fx_rate_to_base, m.id AS membership_id
    FROM public.gym_recognition_lines l
    JOIN public.gym_memberships m ON m.id = l.membership_id
    WHERE l.company_id = _company_id AND l.status = 'scheduled' AND l.recognise_on <= _as_of
      AND m.status IN ('active', 'trial', 'expired')
    ORDER BY l.recognise_on, l.line_no
    FOR UPDATE OF l
  LOOP
    _currency := _line.currency_code;
    _fx := _line.fx_rate_to_base;
    _journal := public.gym_post_balanced(
      _company_id, 'gym_recognition', _line.id, _line.recognise_on,
      'Membership revenue recognition', _currency, _fx, 'gym-recognition-' || _line.id::TEXT,
      jsonb_build_array(
        jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'deferred_membership_revenue'), 'debit_minor', _line.amount_minor, 'credit_minor', 0, 'description', 'Recognise membership'),
        jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'membership_revenue'), 'debit_minor', 0, 'credit_minor', _line.amount_minor, 'description', 'Membership revenue')
      )
    );
    UPDATE public.gym_recognition_lines
    SET status = 'recognised', journal_id = _journal
    WHERE id = _line.id AND status = 'scheduled';
    _count := _count + 1;
  END LOOP;
  RETURN jsonb_build_object('status', 'saved', 'replayed', false, 'reason', _count::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_freeze_membership(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID := (_payload->>'membership_id')::UUID;
  _days INTEGER := (_payload->>'days')::INTEGER;
  _status TEXT;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  PERFORM public.gym_enabled(_company_id);
  IF _days IS NULL OR _days < 1 OR _days > 366 THEN RAISE EXCEPTION 'Freeze length is invalid'; END IF;
  SELECT status INTO _status FROM public.gym_memberships WHERE id = _id AND company_id = _company_id FOR UPDATE;
  IF _status IS NULL THEN RAISE EXCEPTION 'Membership is not in this organisation'; END IF;
  IF _status NOT IN ('active', 'trial') THEN RAISE EXCEPTION 'Membership cannot move from % to frozen', _status; END IF;
  UPDATE public.gym_recognition_lines
  SET recognise_on = recognise_on + _days
  WHERE membership_id = _id AND status = 'scheduled';
  UPDATE public.gym_memberships
  SET status = 'frozen', freeze_until = CURRENT_DATE + _days, ends_on = ends_on + _days
  WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'status', 'frozen', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_reactivate_membership(_company_id UUID, _membership_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status TEXT;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  PERFORM public.gym_enabled(_company_id);
  SELECT status INTO _status FROM public.gym_memberships
  WHERE id = _membership_id AND company_id = _company_id FOR UPDATE;
  IF _status IS NULL THEN RAISE EXCEPTION 'Membership is not in this organisation'; END IF;
  IF _status NOT IN ('frozen', 'suspended', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Membership cannot move from % to active', _status;
  END IF;
  UPDATE public.gym_memberships SET status = 'active', freeze_until = NULL WHERE id = _membership_id;
  RETURN jsonb_build_object('id', _membership_id, 'status', 'active', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_cancel_membership(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID := (_payload->>'membership_id')::UUID;
  _row public.gym_memberships%ROWTYPE;
  _remaining BIGINT;
  _destination TEXT := COALESCE(_payload->>'destination', 'accounts_receivable');
  _journal UUID;
  _refundable BIGINT;
  _left BIGINT;
  _receipt RECORD;
  _take BIGINT;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  PERFORM public.gym_require(_company_id, 'gym.reverse');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.gym_refunds WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key'
  ) OR EXISTS (
    SELECT 1 FROM public.gym_memberships
    WHERE id = _id AND company_id = _company_id AND status = 'cancelled'
      AND cancel_policy = 'keep_deferred'
  ) THEN
    RETURN jsonb_build_object('id', _id, 'status', 'cancelled', 'replayed', true);
  END IF;
  SELECT * INTO _row FROM public.gym_memberships WHERE id = _id AND company_id = _company_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Membership is not in this organisation'; END IF;
  IF _row.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', _id, 'status', 'cancelled', 'replayed', true);
  END IF;
  SELECT COALESCE(SUM(amount_minor), 0) INTO _remaining
  FROM public.gym_recognition_lines WHERE membership_id = _id AND status = 'scheduled';
  IF _row.cancel_policy = 'keep_deferred' THEN
    UPDATE public.gym_memberships SET status = 'cancelled' WHERE id = _id;
    RETURN jsonb_build_object('id', _id, 'status', 'cancelled', 'replayed', false,
      'reason', 'Unrecognised balance stays deferred until a refund or forfeit is posted');
  END IF;
  IF _remaining = 0 THEN
    UPDATE public.gym_memberships SET status = 'cancelled' WHERE id = _id;
    RETURN jsonb_build_object('id', _id, 'status', 'cancelled', 'replayed', false);
  END IF;
  IF _row.cancel_policy = 'refund_unrecognised' THEN
    IF _destination NOT IN ('bank', 'accounts_receivable') THEN RAISE EXCEPTION 'Refund destination is invalid'; END IF;
    IF _destination = 'bank' THEN
      SELECT COALESCE(SUM(amount_minor - refunded_minor), 0) INTO _refundable
      FROM public.gym_receipts
      WHERE company_id = _company_id AND member_id = _row.member_id AND status = 'posted';
      IF _refundable < _remaining THEN
        RAISE EXCEPTION 'Cash refund exceeds amounts received';
      END IF;
    END IF;
    _journal := public.gym_post_balanced(
      _company_id, 'gym_refund', _id, CURRENT_DATE, 'Refund of unrecognised membership',
      _row.currency_code, _row.fx_rate_to_base, 'gym-refund-' || _payload->>'idempotency_key',
      jsonb_build_array(
        jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'deferred_membership_revenue'), 'debit_minor', _remaining, 'credit_minor', 0, 'description', 'Refund unrecognised membership'),
        jsonb_build_object('account_id', public.gym_mapped_account(_company_id, _destination), 'debit_minor', 0, 'credit_minor', _remaining, 'description', 'Refund unrecognised membership')
      )
    );
    IF _destination = 'bank' THEN
      _left := _remaining;
      FOR _receipt IN
        SELECT id, amount_minor - refunded_minor AS open_amount
        FROM public.gym_receipts
        WHERE company_id = _company_id AND member_id = _row.member_id AND status = 'posted'
          AND amount_minor > refunded_minor
        ORDER BY received_on
        FOR UPDATE
      LOOP
        EXIT WHEN _left = 0;
        _take := LEAST(_left, _receipt.open_amount);
        UPDATE public.gym_receipts SET refunded_minor = refunded_minor + _take WHERE id = _receipt.id;
        _left := _left - _take;
      END LOOP;
    END IF;
    INSERT INTO public.gym_refunds (company_id, membership_id, amount_minor, destination, journal_id, idempotency_key)
    VALUES (_company_id, _id, _remaining, _destination, _journal, _payload->>'idempotency_key');
  ELSIF _row.cancel_policy = 'forfeit' THEN
    _journal := public.gym_post_balanced(
      _company_id, 'gym_cancellation', _id, CURRENT_DATE, 'Forfeit of unused membership',
      _row.currency_code, _row.fx_rate_to_base, 'gym-forfeit-' || _payload->>'idempotency_key',
      jsonb_build_array(
        jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'deferred_membership_revenue'), 'debit_minor', _remaining, 'credit_minor', 0, 'description', 'Forfeit unused membership'),
        jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'cancellation_fee_revenue'), 'debit_minor', 0, 'credit_minor', _remaining, 'description', 'Cancellation fee')
      )
    );
  ELSE
    RAISE EXCEPTION 'Cancellation policy is not configured';
  END IF;
  UPDATE public.gym_recognition_lines SET status = 'cancelled' WHERE membership_id = _id AND status = 'scheduled';
  UPDATE public.gym_memberships SET status = 'cancelled' WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'cancelled', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_renew_membership(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.gym_memberships%ROWTYPE;
  _plan UUID;
  _existing UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  PERFORM public.gym_enabled(_company_id);
  SELECT * INTO _row FROM public.gym_memberships
  WHERE id = (_payload->>'membership_id')::UUID AND company_id = _company_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Membership is not in this organisation'; END IF;
  SELECT id INTO _existing FROM public.gym_memberships WHERE renewed_from_id = _row.id;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', _existing, 'status', 'saved', 'replayed', true);
  END IF;
  IF _row.status NOT IN ('active', 'expired', 'trial') THEN
    RAISE EXCEPTION 'Membership cannot be renewed from %', _row.status;
  END IF;
  SELECT plan_id INTO _plan FROM public.gym_plan_versions WHERE id = _row.plan_version_id;
  RETURN public.gym_activate_membership(_company_id, jsonb_build_object(
    'member_id', _row.member_id,
    'plan_id', _plan,
    'branch_id', _row.branch_id,
    'starts_on', _row.ends_on + 1,
    'idempotency_key', _payload->>'idempotency_key',
    'signature_name', COALESCE(NULLIF(_payload->>'signature_name', ''), _row.signature_name, 'Renewal'),
    'renewed_from_id', _row.id,
    'fx_rate_to_base', _row.fx_rate_to_base
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_book_appointment(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _trainer UUID := NULLIF(_payload->>'trainer_id', '')::UUID;
  _starts TIMESTAMPTZ := (_payload->>'starts_at')::TIMESTAMPTZ;
  _ends TIMESTAMPTZ := (_payload->>'ends_at')::TIMESTAMPTZ;
  _room TEXT := NULLIF(_payload->>'room_code', '');
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.schedule.manage');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  SELECT id INTO _id FROM public.gym_appointments
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF _id IS NOT NULL THEN RETURN jsonb_build_object('id', _id, 'status', 'booked', 'replayed', true); END IF;
  IF _starts IS NULL OR _ends IS NULL OR _starts >= _ends THEN RAISE EXCEPTION 'Schedule end must be after the start'; END IF;
  IF _trainer IS NULL AND _room IS NULL THEN RAISE EXCEPTION 'An appointment needs a trainer or a room'; END IF;
  IF _trainer IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::TEXT || ':' || _trainer::TEXT, 0));
    IF NOT EXISTS (SELECT 1 FROM public.gym_trainers WHERE id = _trainer AND company_id = _company_id AND status = 'active') THEN
      RAISE EXCEPTION 'Trainer is not available in this organisation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.gym_appointments
      WHERE trainer_id = _trainer AND status IN ('booked', 'confirmed')
        AND starts_at < _ends AND ends_at > _starts
    ) THEN
      RAISE EXCEPTION 'That trainer is already booked for this time';
    END IF;
  END IF;
  IF _room IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gym_appointments
    WHERE company_id = _company_id AND room_code = _room AND status IN ('booked', 'confirmed')
      AND starts_at < _ends AND ends_at > _starts
  ) THEN
    RAISE EXCEPTION 'That room is already booked for this time';
  END IF;
  INSERT INTO public.gym_appointments (
    company_id, branch_id, trainer_id, member_id, kind, room_code, starts_at, ends_at, status, idempotency_key
  ) VALUES (
    _company_id, NULLIF(_payload->>'branch_id', '')::UUID, _trainer, NULLIF(_payload->>'member_id', '')::UUID,
    COALESCE(NULLIF(_payload->>'kind', ''), 'personal_training'), _room, _starts, _ends, 'booked',
    _payload->>'idempotency_key'
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'booked', 'replayed', false);
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'That trainer or room is already booked for this time';
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_cancel_appointment(_company_id UUID, _appointment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.schedule.manage');
  PERFORM public.gym_enabled(_company_id);
  UPDATE public.gym_appointments SET status = 'cancelled'
  WHERE id = _appointment_id AND company_id = _company_id AND status IN ('booked', 'confirmed');
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment cannot be cancelled'; END IF;
  RETURN jsonb_build_object('id', _appointment_id, 'status', 'cancelled', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_save_class(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _template UUID;
  _session UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.schedule.manage');
  PERFORM public.gym_enabled(_company_id);
  INSERT INTO public.gym_class_templates (company_id, name, capacity, price_minor, instructor_id)
  VALUES (
    _company_id, trim(_payload->>'name'), (_payload->>'capacity')::INTEGER,
    COALESCE((_payload->>'price_minor')::BIGINT, 0), NULLIF(_payload->>'instructor_id', '')::UUID
  ) RETURNING id INTO _template;
  INSERT INTO public.gym_class_sessions (company_id, template_id, instructor_id, starts_at, ends_at, capacity)
  VALUES (
    _company_id, _template, NULLIF(_payload->>'instructor_id', '')::UUID,
    (_payload->>'starts_at')::TIMESTAMPTZ, (_payload->>'ends_at')::TIMESTAMPTZ, (_payload->>'capacity')::INTEGER
  ) RETURNING id INTO _session;
  RETURN jsonb_build_object('id', _session, 'status', 'scheduled', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_book_class(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session UUID := (_payload->>'session_id')::UUID;
  _member UUID := (_payload->>'member_id')::UUID;
  _capacity INTEGER;
  _registered INTEGER;
  _status TEXT;
  _id UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.schedule.manage');
  PERFORM public.gym_enabled(_company_id);
  IF NOT EXISTS (SELECT 1 FROM public.gym_members WHERE id = _member AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Member is not in this organisation';
  END IF;
  SELECT capacity INTO _capacity FROM public.gym_class_sessions
  WHERE id = _session AND company_id = _company_id AND status = 'scheduled'
  FOR UPDATE;
  IF _capacity IS NULL THEN RAISE EXCEPTION 'Class session is not open'; END IF;
  SELECT count(*) INTO _registered FROM public.gym_bookings
  WHERE session_id = _session AND status = 'registered';
  _status := CASE WHEN _registered >= _capacity THEN 'waitlisted' ELSE 'registered' END;
  INSERT INTO public.gym_bookings (company_id, session_id, member_id, status)
  VALUES (_company_id, _session, _member, _status)
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', _status, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_cancel_booking(_company_id UUID, _booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session UUID;
  _promoted UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.schedule.manage');
  PERFORM public.gym_enabled(_company_id);
  SELECT session_id INTO _session FROM public.gym_bookings
  WHERE id = _booking_id AND company_id = _company_id AND status IN ('registered', 'waitlisted')
  FOR UPDATE;
  IF _session IS NULL THEN RAISE EXCEPTION 'Booking cannot be cancelled'; END IF;
  UPDATE public.gym_bookings SET status = 'cancelled' WHERE id = _booking_id;
  SELECT id INTO _promoted FROM public.gym_bookings
  WHERE session_id = _session AND status = 'waitlisted'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  IF _promoted IS NOT NULL THEN
    UPDATE public.gym_bookings SET status = 'registered' WHERE id = _promoted;
  END IF;
  RETURN jsonb_build_object('id', _booking_id, 'status', 'cancelled', 'replayed', false, 'kind', _promoted::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_check_in(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member UUID;
  _day DATE := COALESCE((_payload->>'attended_on')::DATE, CURRENT_DATE);
  _membership UUID;
  _id UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.attendance.manage');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  SELECT id INTO _id FROM public.gym_attendance
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF _id IS NOT NULL THEN RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', true); END IF;
  SELECT id INTO _member FROM public.gym_members
  WHERE company_id = _company_id AND (
    id = NULLIF(_payload->>'member_id', '')::UUID OR member_number = NULLIF(_payload->>'member_number', '')
  );
  IF _member IS NULL THEN RAISE EXCEPTION 'Member was not found'; END IF;
  SELECT id INTO _membership FROM public.gym_memberships
  WHERE company_id = _company_id AND member_id = _member
    AND status IN ('active', 'trial')
    AND starts_on <= _day AND ends_on + grace_days >= _day
  ORDER BY starts_on DESC
  LIMIT 1;
  IF _membership IS NULL THEN RAISE EXCEPTION 'No membership allows access on this date'; END IF;
  INSERT INTO public.gym_attendance (
    company_id, member_id, membership_id, branch_id, attended_on, source, idempotency_key
  ) VALUES (
    _company_id, _member, _membership, NULLIF(_payload->>'branch_id', '')::UUID, _day,
    COALESCE(NULLIF(_payload->>'source', ''), 'manual'), _payload->>'idempotency_key'
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', false);
END;
$$;

-- Additional commercial functions are appended below.

CREATE OR REPLACE FUNCTION public.gym_save_trainer(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.trainers.manage');
  IF _id IS NULL THEN
    INSERT INTO public.gym_trainers (
      company_id, display_name, email, kind, commission_kind, commission_bps, commission_fixed_minor,
      commission_tiers, certification_expires_on
    ) VALUES (
      _company_id, trim(_payload->>'display_name'), NULLIF(lower(COALESCE(_payload->>'email', '')), ''),
      COALESCE(_payload->>'kind', 'employee'), COALESCE(_payload->>'commission_kind', 'percent'),
      COALESCE((_payload->>'commission_bps')::INTEGER, 0), COALESCE((_payload->>'commission_fixed_minor')::BIGINT, 0),
      COALESCE(_payload->'commission_tiers', '[]'::JSONB), NULLIF(_payload->>'certification_expires_on', '')::DATE
    ) RETURNING id INTO _id;
  ELSE
    UPDATE public.gym_trainers SET
      display_name = trim(_payload->>'display_name'),
      commission_kind = COALESCE(_payload->>'commission_kind', commission_kind),
      commission_bps = COALESCE((_payload->>'commission_bps')::INTEGER, commission_bps),
      commission_fixed_minor = COALESCE((_payload->>'commission_fixed_minor')::BIGINT, commission_fixed_minor),
      certification_expires_on = NULLIF(_payload->>'certification_expires_on', '')::DATE
    WHERE id = _id AND company_id = _company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Trainer is not in this organisation'; END IF;
  END IF;
  RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_sell_package(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _journal UUID;
  _member UUID := (_payload->>'member_id')::UUID;
  _sessions INTEGER := (_payload->>'sessions')::INTEGER;
  _price BIGINT := (_payload->>'price_minor')::BIGINT;
  _currency CHAR(3);
  _fx NUMERIC := COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.billing.manage');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  SELECT id, journal_id INTO _id, _journal FROM public.gym_packages
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF _id IS NOT NULL THEN
    RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'open', 'replayed', true);
  END IF;
  IF _sessions IS NULL OR _sessions < 1 OR _price IS NULL OR _price < 1 THEN
    RAISE EXCEPTION 'Package price and sessions must be positive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gym_members WHERE id = _member AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Member is not in this organisation';
  END IF;
  _currency := upper(COALESCE(NULLIF(_payload->>'currency_code', ''), (SELECT currency_code FROM public.gym_settings WHERE company_id = _company_id)));
  _id := gen_random_uuid();
  _journal := public.gym_post_balanced(
    _company_id, 'gym_session', _id, CURRENT_DATE, 'Prepaid sessions invoiced', _currency, _fx,
    'gym-package-' || _id::TEXT,
    jsonb_build_array(
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'accounts_receivable'), 'debit_minor', _price, 'credit_minor', 0, 'description', 'Prepaid sessions'),
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'prepaid_session_liability'), 'debit_minor', 0, 'credit_minor', _price, 'description', 'Prepaid session obligation')
    )
  );
  INSERT INTO public.gym_packages (
    id, company_id, member_id, trainer_id, sessions_purchased, sessions_remaining, price_minor,
    liability_minor, status, journal_id, idempotency_key
  ) VALUES (
    _id, _company_id, _member, NULLIF(_payload->>'trainer_id', '')::UUID, _sessions, _sessions, _price,
    _price, 'open', _journal, _payload->>'idempotency_key'
  );
  INSERT INTO public.gym_charges (
    company_id, member_id, charge_number, kind, amount_minor, charged_on, journal_id, idempotency_key
  ) VALUES (
    _company_id, _member, public.gym_next_number(_company_id, 'charge', 'GCH-'), 'session', _price,
    CURRENT_DATE, _journal, 'gym-package-charge-' || _id::TEXT
  );
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'open', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_consume_session(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _package public.gym_packages%ROWTYPE;
  _count INTEGER := COALESCE((_payload->>'count')::INTEGER, 1);
  _recognised BIGINT;
  _journal UUID;
  _trainer public.gym_trainers%ROWTYPE;
  _commission BIGINT := 0;
  _bps INTEGER;
  _tier JSONB;
  _currency CHAR(3);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.billing.manage');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.journals
    WHERE company_id = _company_id AND idempotency_key = 'gym-consume-' || (_payload->>'idempotency_key')
  ) THEN
    RETURN jsonb_build_object('id', (_payload->>'package_id')::UUID, 'status', 'saved', 'replayed', true);
  END IF;
  SELECT * INTO _package FROM public.gym_packages
  WHERE id = (_payload->>'package_id')::UUID AND company_id = _company_id
  FOR UPDATE;
  IF _package.id IS NULL THEN RAISE EXCEPTION 'Package is not in this organisation'; END IF;
  IF _count < 1 OR _count > _package.sessions_remaining THEN
    RAISE EXCEPTION 'Not enough sessions remaining';
  END IF;
  _recognised := CASE
    WHEN _count = _package.sessions_remaining THEN _package.liability_minor
    ELSE (_package.liability_minor / _package.sessions_remaining) * _count
  END;
  SELECT currency_code INTO _currency FROM public.gym_settings WHERE company_id = _company_id;
  _journal := public.gym_post_balanced(
    _company_id, 'gym_session', _package.id, CURRENT_DATE, 'Session delivered', _currency, 1,
    'gym-consume-' || (_payload->>'idempotency_key'),
    jsonb_build_array(
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'prepaid_session_liability'), 'debit_minor', _recognised, 'credit_minor', 0, 'description', 'Session delivered'),
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'session_revenue'), 'debit_minor', 0, 'credit_minor', _recognised, 'description', 'Session revenue')
    )
  );
  UPDATE public.gym_packages SET
    sessions_remaining = sessions_remaining - _count,
    liability_minor = liability_minor - _recognised,
    status = CASE WHEN sessions_remaining - _count = 0 THEN 'exhausted' ELSE 'open' END
  WHERE id = _package.id;
  IF _package.trainer_id IS NOT NULL THEN
    SELECT * INTO _trainer FROM public.gym_trainers WHERE id = _package.trainer_id;
    IF _trainer.commission_kind = 'fixed' THEN
      _commission := _trainer.commission_fixed_minor * _count;
    ELSIF _trainer.commission_kind = 'percent' THEN
      _commission := (_recognised * _trainer.commission_bps) / 10000;
    ELSE
      FOR _tier IN SELECT value FROM jsonb_array_elements(_trainer.commission_tiers)
      LOOP
        IF _tier->>'up_to_minor' IS NULL OR _recognised <= (_tier->>'up_to_minor')::BIGINT THEN
          _bps := COALESCE((_tier->>'bps')::INTEGER, 0);
          EXIT;
        END IF;
      END LOOP;
      _commission := COALESCE((_recognised * _bps) / 10000, 0);
    END IF;
    IF _commission > 0 THEN
      INSERT INTO public.gym_commissions (company_id, trainer_id, package_id, amount_minor, status, idempotency_key)
      VALUES (_company_id, _trainer.id, _package.id, _commission, 'pending', 'gym-commission-' || (_payload->>'idempotency_key'));
    END IF;
  END IF;
  RETURN jsonb_build_object('id', _package.id, 'journal_id', _journal, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_approve_commission(_company_id UUID, _commission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.gym_commissions%ROWTYPE;
  _journal UUID;
  _currency CHAR(3);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.approve');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  SELECT * INTO _row FROM public.gym_commissions WHERE id = _commission_id AND company_id = _company_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Commission is not in this organisation'; END IF;
  IF _row.status = 'approved' THEN
    RETURN jsonb_build_object('id', _row.id, 'journal_id', _row.journal_id, 'status', 'approved', 'replayed', true);
  END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'Commission cannot be approved from %', _row.status; END IF;
  SELECT currency_code INTO _currency FROM public.gym_settings WHERE company_id = _company_id;
  _journal := public.gym_post_balanced(
    _company_id, 'gym_commission', _row.id, CURRENT_DATE, 'Trainer commission', _currency, 1,
    'gym-commission-post-' || _row.id::TEXT,
    jsonb_build_array(
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'commission_expense'), 'debit_minor', _row.amount_minor, 'credit_minor', 0, 'description', 'Trainer commission'),
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'commission_payable'), 'debit_minor', 0, 'credit_minor', _row.amount_minor, 'description', 'Trainer commission payable')
    )
  );
  UPDATE public.gym_commissions SET status = 'approved', journal_id = _journal WHERE id = _row.id;
  RETURN jsonb_build_object('id', _row.id, 'journal_id', _journal, 'status', 'approved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_issue_voucher(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing UUID;
  _id UUID;
  _journal UUID;
  _amount BIGINT := (_payload->>'amount_minor')::BIGINT;
  _currency CHAR(3);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.billing.manage');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Voucher must be positive'; END IF;
  SELECT id, journal_id INTO _existing, _journal FROM public.gym_vouchers
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', _existing, 'journal_id', _journal, 'status', 'open', 'replayed', true);
  END IF;
  _id := gen_random_uuid();
  SELECT currency_code INTO _currency FROM public.gym_settings WHERE company_id = _company_id;
  _journal := public.gym_post_balanced(
    _company_id, 'gym_voucher', _id, CURRENT_DATE, 'Customer-funded voucher', _currency, 1,
    'gym-voucher-' || _id::TEXT,
    jsonb_build_array(
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'bank'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Customer-funded voucher'),
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'voucher_liability'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Gift voucher liability')
    )
  );
  INSERT INTO public.gym_vouchers (id, company_id, code, amount_minor, remaining_minor, journal_id, idempotency_key)
  VALUES (
    _id, _company_id, public.gym_next_number(_company_id, 'voucher', 'GV-'), _amount, _amount, _journal,
    _payload->>'idempotency_key'
  );
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'open', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_redeem_voucher(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _voucher public.gym_vouchers%ROWTYPE;
  _member UUID := (_payload->>'member_id')::UUID;
  _amount BIGINT := (_payload->>'amount_minor')::BIGINT;
  _journal UUID;
  _allocated BIGINT;
  _currency CHAR(3);
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.billing.manage');
  PERFORM public.gym_require(_company_id, 'gym.post');
  PERFORM public.gym_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  SELECT * INTO _voucher FROM public.gym_vouchers
  WHERE id = (_payload->>'voucher_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF _voucher.id IS NULL THEN RAISE EXCEPTION 'Voucher is not in this organisation'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > _voucher.remaining_minor THEN
    RAISE EXCEPTION 'Redemption exceeds the voucher balance';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gym_members WHERE id = _member AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Member is not in this organisation';
  END IF;
  SELECT currency_code INTO _currency FROM public.gym_settings WHERE company_id = _company_id;
  _journal := public.gym_post_balanced(
    _company_id, 'gym_voucher', _voucher.id, CURRENT_DATE, 'Voucher applied to receivable', _currency, 1,
    'gym-redeem-' || (_payload->>'idempotency_key'),
    jsonb_build_array(
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'voucher_liability'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Voucher redeemed'),
      jsonb_build_object('account_id', public.gym_mapped_account(_company_id, 'accounts_receivable'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Voucher applied to receivable')
    )
  );
  _allocated := public.gym_allocate(_company_id, _member, _amount, NULL, _voucher.id);
  IF _allocated <> _amount THEN
    RAISE EXCEPTION 'Voucher redemption needs an open member balance for the full amount';
  END IF;
  UPDATE public.gym_vouchers SET
    remaining_minor = remaining_minor - _amount,
    status = CASE WHEN remaining_minor - _amount = 0 THEN 'redeemed' ELSE 'open' END
  WHERE id = _voucher.id;
  RETURN jsonb_build_object('id', _voucher.id, 'journal_id', _journal, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_save_equipment(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _asset UUID := NULLIF(_payload->>'fixed_asset_id', '')::UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.manage');
  IF _asset IS NOT NULL THEN
    IF to_regclass('public.fixed_assets') IS NULL THEN
      RAISE EXCEPTION 'Fixed Assets is not available in this database';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fixed_assets WHERE id = _asset AND company_id = _company_id) THEN
      RAISE EXCEPTION 'Fixed asset is not in this organisation';
    END IF;
  END IF;
  INSERT INTO public.gym_equipment (company_id, branch_id, name, category, fixed_asset_id, maintenance_due_on, status)
  VALUES (
    _company_id, NULLIF(_payload->>'branch_id', '')::UUID, trim(_payload->>'name'),
    COALESCE(NULLIF(_payload->>'category', ''), 'equipment'), _asset,
    NULLIF(_payload->>'maintenance_due_on', '')::DATE, COALESCE(NULLIF(_payload->>'status', ''), 'available')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_save_lead(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.manage');
  INSERT INTO public.gym_leads (company_id, display_name, email, status)
  VALUES (
    _company_id, trim(_payload->>'display_name'), NULLIF(lower(COALESCE(_payload->>'email', '')), ''), 'open'
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'open', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_convert_lead(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead public.gym_leads%ROWTYPE;
  _created JSONB;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.manage');
  PERFORM public.gym_require(_company_id, 'gym.members.manage');
  SELECT * INTO _lead FROM public.gym_leads WHERE id = (_payload->>'lead_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF _lead.id IS NULL THEN RAISE EXCEPTION 'Lead is not in this organisation'; END IF;
  IF _lead.status = 'converted' THEN
    RETURN jsonb_build_object('id', _lead.member_id, 'status', 'converted', 'replayed', true);
  END IF;
  _created := public.gym_create_member(_company_id, jsonb_build_object(
    'display_name', _lead.display_name,
    'email', _lead.email,
    'status', 'prospect'
  ));
  UPDATE public.gym_leads SET status = 'converted', member_id = (_created->>'id')::UUID WHERE id = _lead.id;
  RETURN jsonb_build_object('id', _created->>'id', 'status', 'converted', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_save_budget(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _branch UUID := NULLIF(_payload->>'branch_id', '')::UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.admin');
  INSERT INTO public.gym_budget_lines (company_id, branch_id, budget_year, budget_month, role, amount_minor)
  VALUES (
    _company_id, _branch, (_payload->>'budget_year')::INTEGER, (_payload->>'budget_month')::INTEGER,
    _payload->>'role', (_payload->>'amount_minor')::BIGINT
  )
  ON CONFLICT (
    company_id,
    (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID)),
    budget_year,
    budget_month,
    role
  ) DO UPDATE SET amount_minor = EXCLUDED.amount_minor
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_member_statement(
  _company_id UUID,
  _member_id UUID,
  _from DATE,
  _to DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opening BIGINT;
  _charges BIGINT;
  _receipts BIGINT;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.view');
  IF NOT EXISTS (SELECT 1 FROM public.gym_members WHERE id = _member_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Member is not in this organisation';
  END IF;
  SELECT
    COALESCE((SELECT SUM(amount_minor) FROM public.gym_charges WHERE company_id = _company_id AND member_id = _member_id AND status <> 'void' AND charged_on < _from), 0)
    - COALESCE((SELECT SUM(amount_minor - refunded_minor) FROM public.gym_receipts WHERE company_id = _company_id AND member_id = _member_id AND status = 'posted' AND received_on < _from), 0)
  INTO _opening;
  SELECT COALESCE(SUM(amount_minor), 0) INTO _charges FROM public.gym_charges
  WHERE company_id = _company_id AND member_id = _member_id AND status <> 'void' AND charged_on BETWEEN _from AND _to;
  SELECT COALESCE(SUM(amount_minor - refunded_minor), 0) INTO _receipts FROM public.gym_receipts
  WHERE company_id = _company_id AND member_id = _member_id AND status = 'posted' AND received_on BETWEEN _from AND _to;
  RETURN jsonb_build_object(
    'opening_minor', _opening,
    'charges_minor', _charges,
    'receipts_minor', _receipts,
    'closing_minor', _opening + _charges - _receipts,
    'charges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'charge_number', charge_number, 'kind', kind, 'amount_minor', amount_minor,
        'allocated_minor', allocated_minor, 'status', status, 'charged_on', charged_on, 'journal_id', journal_id
      ) ORDER BY charged_on)
      FROM public.gym_charges
      WHERE company_id = _company_id AND member_id = _member_id AND status <> 'void' AND charged_on BETWEEN _from AND _to
    ), '[]'::JSONB),
    'receipts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'receipt_number', receipt_number, 'amount_minor', amount_minor, 'method', method,
        'status', status, 'received_on', received_on, 'journal_id', journal_id
      ) ORDER BY received_on)
      FROM public.gym_receipts
      WHERE company_id = _company_id AND member_id = _member_id AND received_on BETWEEN _from AND _to
    ), '[]'::JSONB)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_link_portal(_company_id UUID, _member_id UUID, _user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.portal.manage');
  IF EXISTS (
    SELECT 1 FROM public.gym_members WHERE company_id = _company_id AND user_id = _user_id AND id <> _member_id
  ) THEN
    RAISE EXCEPTION 'That sign-in is already linked to another member';
  END IF;
  UPDATE public.gym_members SET user_id = _user_id
  WHERE id = _member_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member is not in this organisation'; END IF;
  RETURN jsonb_build_object('id', _member_id, 'status', 'saved', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_my_portal(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member public.gym_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _member FROM public.gym_members
  WHERE company_id = _company_id AND user_id = auth.uid() AND status <> 'archived';
  IF _member.id IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;
  RETURN jsonb_build_object(
    'linked', true,
    'member_number', _member.member_number,
    'display_name', _member.display_name,
    'status', _member.status,
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'membership_number', membership_number, 'status', status,
        'starts_on', starts_on, 'ends_on', ends_on, 'price_minor', price_minor
      ) ORDER BY starts_on DESC)
      FROM public.gym_memberships WHERE member_id = _member.id
    ), '[]'::JSONB),
    'outstanding_minor', COALESCE((
      SELECT SUM(amount_minor - allocated_minor) FROM public.gym_charges
      WHERE member_id = _member.id AND status = 'open'
    ), 0),
    'sessions_remaining', COALESCE((
      SELECT SUM(sessions_remaining) FROM public.gym_packages
      WHERE member_id = _member.id AND status = 'open'
    ), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gym_workspace(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings JSONB;
  _see_health BOOLEAN;
  _mrr BIGINT := 0;
  _residual BIGINT := 0;
  _gl BIGINT;
  _sub BIGINT;
  _ar UUID;
BEGIN
  PERFORM public.gym_require(_company_id, 'gym.view');
  _see_health := public.has_company_permission(_company_id, 'gym.members.manage');
  SELECT jsonb_build_object(
    'enabled', enabled, 'currency_code', currency_code, 'country_code', country_code,
    'timezone', timezone, 'account_map', account_map, 'version', version
  ) INTO _settings FROM public.gym_settings WHERE company_id = _company_id;
  SELECT COALESCE(SUM(
    CASE billing_interval
      WHEN 'week' THEN (price_minor * 52) / 12
      WHEN 'month' THEN price_minor
      WHEN 'quarter' THEN price_minor / 3
      WHEN 'half_year' THEN price_minor / 6
      WHEN 'year' THEN price_minor / 12
      ELSE 0
    END
  ), 0),
  COALESCE(SUM(
    CASE billing_interval
      WHEN 'week' THEN (price_minor * 52) % 12
      WHEN 'year' THEN price_minor % 12
      WHEN 'quarter' THEN price_minor % 3
      WHEN 'half_year' THEN price_minor % 6
      ELSE 0
    END
  ), 0)
  INTO _mrr, _residual
  FROM public.gym_memberships
  WHERE company_id = _company_id AND status = 'active';
  _ar := NULLIF(_settings #>> '{account_map,accounts_receivable}', '')::UUID;
  IF _ar IS NOT NULL THEN
    SELECT COALESCE(SUM(debit_minor - credit_minor), 0) INTO _gl
    FROM public.journal_lines jl
    JOIN public.journals j ON j.id = jl.journal_id
    WHERE jl.company_id = _company_id AND jl.account_id = _ar AND j.source_type::TEXT LIKE 'gym_%';
  END IF;
  SELECT
    COALESCE((SELECT SUM(amount_minor) FROM public.gym_charges WHERE company_id = _company_id AND status <> 'void'), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM public.gym_receipts WHERE company_id = _company_id AND status = 'posted'), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM public.gym_allocations WHERE company_id = _company_id AND voucher_id IS NOT NULL), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM public.gym_refunds WHERE company_id = _company_id AND destination = 'accounts_receivable'), 0)
  INTO _sub;
  RETURN jsonb_build_object(
    'settings', COALESCE(_settings, jsonb_build_object('enabled', false, 'account_map', '{}'::JSONB, 'currency_code', 'USD')),
    'kpis', jsonb_build_object(
      'members_total', (SELECT count(*) FROM public.gym_members WHERE company_id = _company_id AND status <> 'archived'),
      'memberships_active', (SELECT count(*) FROM public.gym_memberships WHERE company_id = _company_id AND status = 'active'),
      'memberships_frozen', (SELECT count(*) FROM public.gym_memberships WHERE company_id = _company_id AND status = 'frozen'),
      'memberships_cancelled', (SELECT count(*) FROM public.gym_memberships WHERE company_id = _company_id AND status = 'cancelled'),
      'memberships_expired', (SELECT count(*) FROM public.gym_memberships WHERE company_id = _company_id AND status = 'expired'),
      'memberships_trial', (SELECT count(*) FROM public.gym_memberships WHERE company_id = _company_id AND status = 'trial'),
      'mrr_minor', _mrr,
      'arr_minor', _mrr * 12,
      'residual_minor', _residual,
      'deferred_minor', COALESCE((SELECT SUM(amount_minor) FROM public.gym_recognition_lines WHERE company_id = _company_id AND status = 'scheduled'), 0),
      'recognised_minor', COALESCE((SELECT SUM(amount_minor) FROM public.gym_recognition_lines WHERE company_id = _company_id AND status = 'recognised'), 0),
      'invoiced_minor', COALESCE((SELECT SUM(amount_minor) FROM public.gym_charges WHERE company_id = _company_id AND status <> 'void'), 0),
      'collected_minor', COALESCE((SELECT SUM(amount_minor - refunded_minor) FROM public.gym_receipts WHERE company_id = _company_id AND status = 'posted'), 0),
      'outstanding_minor', COALESCE((SELECT SUM(amount_minor - allocated_minor) FROM public.gym_charges WHERE company_id = _company_id AND status = 'open'), 0),
      'unallocated_minor', COALESCE((SELECT SUM(amount_minor - allocated_minor - refunded_minor) FROM public.gym_receipts WHERE company_id = _company_id AND status = 'posted'), 0),
      'checkins_today', (SELECT count(*) FROM public.gym_attendance WHERE company_id = _company_id AND attended_on = CURRENT_DATE),
      'upcoming_appointments', (SELECT count(*) FROM public.gym_appointments WHERE company_id = _company_id AND status IN ('booked', 'confirmed') AND starts_at >= now()),
      'maintenance_due', (SELECT count(*) FROM public.gym_equipment WHERE company_id = _company_id AND maintenance_due_on IS NOT NULL AND maintenance_due_on <= CURRENT_DATE + 14 AND status <> 'retired'),
      'reconciliation_balanced', _ar IS NOT NULL AND _gl IS NOT DISTINCT FROM _sub,
      'ledger_receivable_minor', _gl,
      'subledger_receivable_minor', _sub
    ),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'member_number', member_number, 'display_name', display_name, 'email', email,
        'status', status, 'is_minor', is_minor,
        'health_notes', CASE WHEN _see_health THEN health_notes ELSE NULL END
      ) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.gym_members WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 100) m
    ), '[]'::JSONB),
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status,
        'price_minor', v.price_minor, 'billing_interval', v.billing_interval, 'recognition', v.recognition,
        'cancel_policy', v.cancel_policy, 'version_no', v.version_no
      ) ORDER BY p.code)
      FROM public.gym_plans p
      JOIN LATERAL (
        SELECT * FROM public.gym_plan_versions v WHERE v.plan_id = p.id ORDER BY version_no DESC LIMIT 1
      ) v ON true
      WHERE p.company_id = _company_id
    ), '[]'::JSONB),
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'membership_number', membership_number, 'member_id', member_id, 'status', status,
        'starts_on', starts_on, 'ends_on', ends_on, 'price_minor', price_minor, 'deferred_minor', deferred_minor,
        'journal_id', journal_id
      ) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.gym_memberships WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 100) s
    ), '[]'::JSONB),
    'charges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'charge_number', charge_number, 'member_id', member_id, 'kind', kind,
        'amount_minor', amount_minor, 'allocated_minor', allocated_minor, 'status', status, 'journal_id', journal_id
      ) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.gym_charges WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 100) c
    ), '[]'::JSONB),
    'receipts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'receipt_number', receipt_number, 'member_id', member_id, 'amount_minor', amount_minor,
        'allocated_minor', allocated_minor, 'method', method, 'status', status, 'journal_id', journal_id
      ) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.gym_receipts WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 100) r
    ), '[]'::JSONB),
    'recognition', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'membership_id', membership_id, 'recognise_on', recognise_on, 'amount_minor', amount_minor,
        'status', status, 'journal_id', journal_id
      ) ORDER BY recognise_on)
      FROM (
        SELECT * FROM public.gym_recognition_lines WHERE company_id = _company_id ORDER BY recognise_on LIMIT 200
      ) l
    ), '[]'::JSONB),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'trainer_id', trainer_id, 'member_id', member_id, 'kind', kind, 'starts_at', starts_at,
        'ends_at', ends_at, 'status', status, 'room_code', room_code
      ) ORDER BY starts_at)
      FROM public.gym_appointments WHERE company_id = _company_id AND status <> 'cancelled'
    ), '[]'::JSONB),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', t.name, 'starts_at', s.starts_at, 'capacity', s.capacity, 'status', s.status,
        'registered', (SELECT count(*) FROM public.gym_bookings b WHERE b.session_id = s.id AND b.status = 'registered')
      ) ORDER BY s.starts_at)
      FROM public.gym_class_sessions s
      JOIN public.gym_class_templates t ON t.id = s.template_id
      WHERE s.company_id = _company_id
    ), '[]'::JSONB),
    'trainers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'display_name', display_name, 'kind', kind, 'commission_kind', commission_kind,
        'commission_bps', commission_bps, 'certification_expires_on', certification_expires_on, 'status', status
      ) ORDER BY display_name)
      FROM public.gym_trainers WHERE company_id = _company_id
    ), '[]'::JSONB),
    'packages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'member_id', member_id, 'sessions_remaining', sessions_remaining, 'liability_minor', liability_minor,
        'status', status, 'journal_id', journal_id
      ) ORDER BY created_at DESC)
      FROM public.gym_packages WHERE company_id = _company_id
    ), '[]'::JSONB),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'trainer_id', trainer_id, 'amount_minor', amount_minor, 'status', status, 'journal_id', journal_id
      ) ORDER BY created_at DESC)
      FROM public.gym_commissions WHERE company_id = _company_id
    ), '[]'::JSONB),
    'vouchers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'remaining_minor', remaining_minor, 'status', status
      ) ORDER BY created_at DESC)
      FROM public.gym_vouchers WHERE company_id = _company_id
    ), '[]'::JSONB),
    'equipment', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'status', status, 'maintenance_due_on', maintenance_due_on, 'fixed_asset_id', fixed_asset_id
      ) ORDER BY name)
      FROM public.gym_equipment WHERE company_id = _company_id
    ), '[]'::JSONB),
    'leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'email', email, 'status', status) ORDER BY created_at DESC)
      FROM public.gym_leads WHERE company_id = _company_id
    ), '[]'::JSONB),
    'branches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'kind', kind, 'status', status) ORDER BY code)
      FROM public.gym_branches WHERE company_id = _company_id
    ), '[]'::JSONB),
    'budgets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'budget_year', budget_year, 'budget_month', budget_month, 'role', role, 'amount_minor', amount_minor
      ) ORDER BY budget_year, budget_month)
      FROM public.gym_budget_lines WHERE company_id = _company_id
    ), '[]'::JSONB),
    'actions', COALESCE((
      SELECT jsonb_agg(item) FROM (
        SELECT jsonb_build_object('id', r.id::TEXT, 'title', 'Pending gateway receipt ' || r.receipt_number, 'href', '/gym/payments', 'severity', 'attention') AS item
        FROM public.gym_receipts r WHERE r.company_id = _company_id AND r.status = 'pending'
        UNION ALL
        SELECT jsonb_build_object('id', r.id::TEXT, 'title', 'Unallocated receipt ' || r.receipt_number, 'href', '/gym/payments', 'severity', 'attention')
        FROM public.gym_receipts r
        WHERE r.company_id = _company_id AND r.status = 'posted' AND r.amount_minor > r.allocated_minor + r.refunded_minor
        UNION ALL
        SELECT jsonb_build_object('id', m.id::TEXT, 'title', 'Cancelled membership still has deferred revenue ' || m.membership_number, 'href', '/gym/deferred', 'severity', 'attention')
        FROM public.gym_memberships m
        WHERE m.company_id = _company_id AND m.status = 'cancelled'
          AND EXISTS (SELECT 1 FROM public.gym_recognition_lines l WHERE l.membership_id = m.id AND l.status = 'scheduled')
        UNION ALL
        SELECT jsonb_build_object('id', t.id::TEXT, 'title', 'Trainer certification due: ' || t.display_name, 'href', '/gym/trainers', 'severity', 'attention')
        FROM public.gym_trainers t
        WHERE t.company_id = _company_id AND t.certification_expires_on IS NOT NULL AND t.certification_expires_on <= CURRENT_DATE + 30
        UNION ALL
        SELECT jsonb_build_object('id', e.id::TEXT, 'title', 'Equipment maintenance due: ' || e.name, 'href', '/gym/equipment', 'severity', 'attention')
        FROM public.gym_equipment e
        WHERE e.company_id = _company_id AND e.maintenance_due_on IS NOT NULL AND e.maintenance_due_on <= CURRENT_DATE + 14 AND e.status <> 'retired'
      ) actions
    ), '[]'::JSONB)
  );
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'gym_settings', 'gym_counters', 'gym_branches', 'gym_plans', 'gym_plan_versions', 'gym_members',
    'gym_memberships', 'gym_recognition_lines', 'gym_charges', 'gym_receipts', 'gym_vouchers',
    'gym_allocations', 'gym_refunds', 'gym_trainers', 'gym_appointments', 'gym_class_templates',
    'gym_class_sessions', 'gym_bookings', 'gym_attendance', 'gym_packages', 'gym_commissions',
    'gym_equipment', 'gym_leads', 'gym_budget_lines'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS gym_member_select ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY gym_member_select ON public.%I FOR SELECT TO authenticated USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, %L))',
      t, 'gym.view'
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS gym_portal_self ON public.gym_members;
CREATE POLICY gym_portal_self ON public.gym_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'gym\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
  END LOOP;
END $$;
