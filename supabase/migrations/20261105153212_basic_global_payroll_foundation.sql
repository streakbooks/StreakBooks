-- Basic Global Payroll Batch 1: foundation schema, security and settings.
--
-- Requires 20261105153211 (journal_source_type 'payroll').
--
-- Scope for this migration
--  * Organisation payroll settings (enablement, country, currency, accounts, rounding, branding).
--  * Multiple pay schedules.
--  * Configurable earning / deduction / employer-contribution component catalogue.
--  * Payroll permissions, RLS (SELECT for members with payroll.view; writes via SECURITY DEFINER).
--  * Document sequences for payroll runs and payslips.
--
-- Explicit non-goals (later batches)
--  * Employee master, salary assignments, pay runs, payslips, payments, statutory engines.
--  * Automatic income tax / social security / government filings.
--
-- Rules
--  * Clients can only SELECT; every write is a SECURITY DEFINER RPC checking auth, membership
--    and permission.
--  * Amounts elsewhere will use integer minor units; settings here store account links and rules.
--  * Basic Payroll is not claimed as legally compliant in every country.
--
-- Additive and idempotent.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'payroll.view'),
  ('admin', 'payroll.view'),
  ('accountant', 'payroll.view'),
  ('bookkeeper', 'payroll.view'),
  ('staff', 'payroll.view'),
  ('read_only', 'payroll.view'),
  ('owner', 'payroll.settings.edit'),
  ('admin', 'payroll.settings.edit'),
  ('accountant', 'payroll.settings.edit'),
  ('owner', 'payroll.employees.manage'),
  ('admin', 'payroll.employees.manage'),
  ('accountant', 'payroll.employees.manage'),
  ('bookkeeper', 'payroll.employees.manage'),
  ('owner', 'payroll.run.prepare'),
  ('admin', 'payroll.run.prepare'),
  ('accountant', 'payroll.run.prepare'),
  ('bookkeeper', 'payroll.run.prepare'),
  ('owner', 'payroll.run.approve'),
  ('admin', 'payroll.run.approve'),
  ('accountant', 'payroll.run.approve'),
  ('owner', 'payroll.run.post'),
  ('admin', 'payroll.run.post'),
  ('accountant', 'payroll.run.post'),
  ('owner', 'payroll.pay'),
  ('admin', 'payroll.pay'),
  ('accountant', 'payroll.pay'),
  ('bookkeeper', 'payroll.pay'),
  ('owner', 'payroll.reports.view'),
  ('admin', 'payroll.reports.view'),
  ('accountant', 'payroll.reports.view'),
  ('bookkeeper', 'payroll.reports.view'),
  ('read_only', 'payroll.reports.view')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  operating_country_code TEXT NOT NULL CHECK (operating_country_code ~ '^[A-Z]{2}$'),
  payroll_currency TEXT NOT NULL CHECK (payroll_currency ~ '^[A-Z]{3}$'),
  payroll_start_date DATE,
  default_working_days_per_week NUMERIC(4,2) NOT NULL DEFAULT 5
    CHECK (default_working_days_per_week > 0 AND default_working_days_per_week <= 7),
  default_working_hours_per_day NUMERIC(5,2) NOT NULL DEFAULT 8
    CHECK (default_working_hours_per_day > 0 AND default_working_hours_per_day <= 24),
  payment_date_offset_days INTEGER NOT NULL DEFAULT 0
    CHECK (payment_date_offset_days BETWEEN -31 AND 62),
  salary_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  net_pay_liability_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  deduction_liability_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  employer_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  employer_liability_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (default_payment_method IN ('bank_transfer', 'cash', 'cheque', 'other')),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  rounding_mode TEXT NOT NULL DEFAULT 'half_up'
    CHECK (rounding_mode IN ('half_up', 'half_even', 'floor', 'ceiling')),
  payslip_show_employer_costs BOOLEAN NOT NULL DEFAULT false,
  payslip_footer_note TEXT,
  payslip_branding_name TEXT,
  employee_number_prefix TEXT NOT NULL DEFAULT 'EMP-'
    CHECK (char_length(trim(employee_number_prefix)) BETWEEN 1 AND 12),
  next_employee_number INTEGER NOT NULL DEFAULT 1 CHECK (next_employee_number >= 1),
  disclaimer_acknowledged BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_settings_footer_len CHECK (
    payslip_footer_note IS NULL OR char_length(payslip_footer_note) <= 2000
  ),
  CONSTRAINT payroll_settings_branding_len CHECK (
    payslip_branding_name IS NULL OR char_length(trim(payslip_branding_name)) BETWEEN 1 AND 160
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_pay_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL
    CHECK (frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  anchor_date DATE NOT NULL,
  payment_offset_days INTEGER NOT NULL DEFAULT 0
    CHECK (payment_offset_days BETWEEN -31 AND 62),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_pay_schedules_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_pay_schedules_company_name_uidx
  ON public.payroll_pay_schedules (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS payroll_pay_schedules_one_default_uidx
  ON public.payroll_pay_schedules (company_id)
  WHERE is_default AND is_active;
CREATE INDEX IF NOT EXISTS payroll_pay_schedules_company_active_idx
  ON public.payroll_pay_schedules (company_id, is_active);

ALTER TABLE public.payroll_settings
  DROP CONSTRAINT IF EXISTS payroll_settings_default_schedule_fk;
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS default_pay_schedule_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_settings_default_schedule_fk'
  ) THEN
    ALTER TABLE public.payroll_settings
      ADD CONSTRAINT payroll_settings_default_schedule_fk
      FOREIGN KEY (default_pay_schedule_id)
      REFERENCES public.payroll_pay_schedules(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.payroll_component_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earning', 'deduction', 'employer_contribution')),
  calculation_method TEXT NOT NULL
    CHECK (calculation_method IN ('fixed', 'percentage', 'hourly', 'unit', 'manual')),
  percentage_base TEXT
    CHECK (percentage_base IS NULL OR percentage_base IN ('gross', 'basic', 'taxable_earnings')),
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  is_recurring_default BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  liability_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_component_types_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT payroll_component_types_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT payroll_component_types_pct_base CHECK (
    calculation_method <> 'percentage' OR percentage_base IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_component_types_company_code_uidx
  ON public.payroll_component_types (company_id, lower(code));
CREATE INDEX IF NOT EXISTS payroll_component_types_company_kind_idx
  ON public.payroll_component_types (company_id, kind, sort_order);

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_pay_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_component_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll viewers can read settings" ON public.payroll_settings;
CREATE POLICY "Payroll viewers can read settings" ON public.payroll_settings
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read schedules" ON public.payroll_pay_schedules;
CREATE POLICY "Payroll viewers can read schedules" ON public.payroll_pay_schedules
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

DROP POLICY IF EXISTS "Payroll viewers can read components" ON public.payroll_component_types;
CREATE POLICY "Payroll viewers can read components" ON public.payroll_component_types
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'payroll.view')
  );

REVOKE ALL ON public.payroll_settings, public.payroll_pay_schedules, public.payroll_component_types
  FROM PUBLIC, anon;
GRANT SELECT ON public.payroll_settings, public.payroll_pay_schedules, public.payroll_component_types
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Document sequences
-- ---------------------------------------------------------------------------
INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, d.document_type, d.prefix, 1, 4
FROM public.companies c
CROSS JOIN (VALUES
  ('payroll_run', 'PR-'),
  ('payslip', 'PS-')
) AS d(document_type, prefix)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.allocate_document_number(_company_id UUID, _document_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix TEXT;
  _next INTEGER;
  _pad INTEGER;
  _default_prefix TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  _default_prefix := CASE _document_type
    WHEN 'purchase_bill' THEN 'BILL-'
    WHEN 'purchase_order' THEN 'PO-'
    WHEN 'purchase_credit_note' THEN 'SCN-'
    WHEN 'payroll_run' THEN 'PR-'
    WHEN 'payslip' THEN 'PS-'
    ELSE UPPER(LEFT(_document_type, 3)) || '-'
  END;

  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES (_company_id, _document_type, _default_prefix, 1, 4)
  ON CONFLICT (company_id, document_type) DO NOTHING;

  UPDATE public.document_sequences
  SET next_number = next_number + 1
  WHERE company_id = _company_id AND document_type = _document_type
  RETURNING prefix, next_number - 1, padding INTO _prefix, _next, _pad;

  IF _next IS NULL THEN RAISE EXCEPTION 'Could not allocate document number'; END IF;
  RETURN _prefix || lpad(_next::TEXT, _pad, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_document_number(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_document_number(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_assert_account(
  _company_id UUID,
  _account_id UUID,
  _types public.account_type[],
  _label TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a RECORD;
BEGIN
  IF _account_id IS NULL THEN RETURN; END IF;
  SELECT id, company_id, account_type, is_active, is_postable
  INTO _a
  FROM public.accounts
  WHERE id = _account_id;
  IF NOT FOUND OR _a.company_id <> _company_id THEN
    RAISE EXCEPTION '% must be an account in this organisation', _label;
  END IF;
  IF NOT _a.is_active OR NOT _a.is_postable THEN
    RAISE EXCEPTION '% must be an active, postable account', _label;
  END IF;
  IF NOT (_a.account_type = ANY (_types)) THEN
    RAISE EXCEPTION '% must be one of: %', _label, array_to_string(_types, ', ');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_assert_account(UUID, UUID, public.account_type[], TEXT)
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.payroll_seed_default_components(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seed RECORD;
BEGIN
  FOR _seed IN
    SELECT * FROM (VALUES
      ('BASIC', 'Basic salary', 'earning', 'fixed', NULL::TEXT, true, true, 10),
      ('HOURLY', 'Hourly wages', 'earning', 'hourly', NULL, true, true, 20),
      ('OVERTIME', 'Overtime', 'earning', 'hourly', NULL, true, false, 30),
      ('BONUS', 'Bonus', 'earning', 'manual', NULL, true, false, 40),
      ('COMMISSION', 'Commission', 'earning', 'manual', NULL, true, false, 50),
      ('ALLOWANCE', 'Allowance', 'earning', 'fixed', NULL, true, true, 60),
      ('REIMBURSEMENT', 'Reimbursement', 'earning', 'manual', NULL, false, false, 70),
      ('MANUAL_TAX', 'Manual tax deduction', 'deduction', 'manual', NULL, false, true, 110),
      ('MANUAL_SOCIAL', 'Manual social contribution', 'deduction', 'manual', NULL, false, true, 120),
      ('FIXED_DED', 'Fixed deduction', 'deduction', 'fixed', NULL, false, true, 130),
      ('PCT_DED', 'Percentage deduction', 'deduction', 'percentage', 'gross', false, true, 140),
      ('LOAN_REPAY', 'Loan repayment', 'deduction', 'fixed', NULL, false, true, 150),
      ('ADVANCE_REPAY', 'Salary advance repayment', 'deduction', 'fixed', NULL, false, false, 160),
      ('ER_CONTRIB', 'Employer contribution', 'employer_contribution', 'manual', NULL, false, true, 210)
    ) AS t(code, name, kind, calculation_method, percentage_base, is_taxable, is_recurring_default, sort_order)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.payroll_component_types
      WHERE company_id = _company_id AND lower(code) = lower(_seed.code)
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.payroll_component_types (
      company_id, code, name, kind, calculation_method, percentage_base,
      is_taxable, is_recurring_default, is_system, sort_order
    ) VALUES (
      _company_id, _seed.code, _seed.name, _seed.kind, _seed.calculation_method, _seed.percentage_base,
      _seed.is_taxable, _seed.is_recurring_default, true, _seed.sort_order
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_seed_default_components(UUID) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payroll_settings_page(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company RECORD;
  _settings public.payroll_settings%ROWTYPE;
  _schedules JSONB;
  _components JSONB;
  _sequences JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payroll';
  END IF;

  SELECT id, name, country_code, base_currency INTO _company
  FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.is_default DESC, lower(s.name)), '[]'::jsonb)
  INTO _schedules
  FROM public.payroll_pay_schedules s
  WHERE s.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, lower(c.code)), '[]'::jsonb)
  INTO _components
  FROM public.payroll_component_types c
  WHERE c.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.document_type), '[]'::jsonb)
  INTO _sequences
  FROM public.document_sequences d
  WHERE d.company_id = _company_id
    AND d.document_type IN ('payroll_run', 'payslip');

  RETURN jsonb_build_object(
    'available', true,
    'company', jsonb_build_object(
      'id', _company.id,
      'name', _company.name,
      'country_code', _company.country_code,
      'base_currency', _company.base_currency
    ),
    'settings', CASE WHEN _settings.company_id IS NULL THEN NULL ELSE to_jsonb(_settings) END,
    'schedules', _schedules,
    'components', _components,
    'sequences', _sequences,
    'disclaimer',
      'Basic Global Payroll calculates pay from configured earnings and deductions. It does not automatically compute statutory income tax, social security or government filings. Enter statutory amounts manually when required. It is not advertised as legally compliant in every country.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_settings_page(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_settings_page(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_settings(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company RECORD;
  _expected_version INTEGER;
  _row public.payroll_settings%ROWTYPE;
  _enabled BOOLEAN;
  _country TEXT;
  _currency TEXT;
  _schedule_id UUID;
  _start_date DATE;
  _days NUMERIC;
  _hours NUMERIC;
  _offset INTEGER;
  _salary UUID;
  _net UUID;
  _ded UUID;
  _er_exp UUID;
  _er_liab UUID;
  _method TEXT;
  _requires_approval BOOLEAN;
  _rounding TEXT;
  _show_er BOOLEAN;
  _footer TEXT;
  _branding TEXT;
  _emp_prefix TEXT;
  _disclaimer BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.settings.edit') THEN
    RAISE EXCEPTION 'You do not have permission to edit payroll settings';
  END IF;

  SELECT id, country_code, base_currency INTO _company
  FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found'; END IF;

  _expected_version := NULLIF(_payload->>'version', '')::INTEGER;
  _enabled := COALESCE((_payload->>'enabled')::BOOLEAN, false);
  _country := upper(trim(COALESCE(_payload->>'operating_country_code', _company.country_code)));
  _currency := upper(trim(COALESCE(_payload->>'payroll_currency', _company.base_currency)));
  _schedule_id := NULLIF(_payload->>'default_pay_schedule_id', '')::UUID;
  _start_date := NULLIF(_payload->>'payroll_start_date', '')::DATE;
  _days := COALESCE((_payload->>'default_working_days_per_week')::NUMERIC, 5);
  _hours := COALESCE((_payload->>'default_working_hours_per_day')::NUMERIC, 8);
  _offset := COALESCE((_payload->>'payment_date_offset_days')::INTEGER, 0);
  _salary := NULLIF(_payload->>'salary_expense_account_id', '')::UUID;
  _net := NULLIF(_payload->>'net_pay_liability_account_id', '')::UUID;
  _ded := NULLIF(_payload->>'deduction_liability_account_id', '')::UUID;
  _er_exp := NULLIF(_payload->>'employer_expense_account_id', '')::UUID;
  _er_liab := NULLIF(_payload->>'employer_liability_account_id', '')::UUID;
  _method := COALESCE(_payload->>'default_payment_method', 'bank_transfer');
  _requires_approval := COALESCE((_payload->>'requires_approval')::BOOLEAN, true);
  _rounding := COALESCE(_payload->>'rounding_mode', 'half_up');
  _show_er := COALESCE((_payload->>'payslip_show_employer_costs')::BOOLEAN, false);
  _footer := NULLIF(trim(COALESCE(_payload->>'payslip_footer_note', '')), '');
  _branding := NULLIF(trim(COALESCE(_payload->>'payslip_branding_name', '')), '');
  _emp_prefix := COALESCE(NULLIF(trim(COALESCE(_payload->>'employee_number_prefix', '')), ''), 'EMP-');
  _disclaimer := COALESCE((_payload->>'disclaimer_acknowledged')::BOOLEAN, false);

  IF _country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Operating country must be a 2-letter code'; END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Payroll currency must be a 3-letter code'; END IF;
  IF _days <= 0 OR _days > 7 THEN RAISE EXCEPTION 'Working days per week must be between 0 and 7'; END IF;
  IF _hours <= 0 OR _hours > 24 THEN RAISE EXCEPTION 'Working hours per day must be between 0 and 24'; END IF;
  IF _offset < -31 OR _offset > 62 THEN RAISE EXCEPTION 'Payment date offset is out of range'; END IF;
  IF _method NOT IN ('bank_transfer', 'cash', 'cheque', 'other') THEN
    RAISE EXCEPTION 'Unsupported default payment method';
  END IF;
  IF _rounding NOT IN ('half_up', 'half_even', 'floor', 'ceiling') THEN
    RAISE EXCEPTION 'Unsupported rounding mode';
  END IF;
  IF char_length(_emp_prefix) > 12 THEN RAISE EXCEPTION 'Employee number prefix is too long'; END IF;
  IF _enabled AND NOT _disclaimer THEN
    RAISE EXCEPTION 'Acknowledge the Basic Payroll compliance disclaimer before enabling payroll';
  END IF;
  IF _enabled AND (_salary IS NULL OR _net IS NULL OR _ded IS NULL) THEN
    RAISE EXCEPTION 'Salary expense, net pay liability and deduction liability accounts are required when payroll is enabled';
  END IF;

  PERFORM public.payroll_assert_account(_company_id, _salary, ARRAY['expense']::public.account_type[], 'Salary expense account');
  PERFORM public.payroll_assert_account(_company_id, _net, ARRAY['liability']::public.account_type[], 'Net pay liability account');
  PERFORM public.payroll_assert_account(_company_id, _ded, ARRAY['liability']::public.account_type[], 'Deduction liability account');
  PERFORM public.payroll_assert_account(_company_id, _er_exp, ARRAY['expense']::public.account_type[], 'Employer contribution expense account');
  PERFORM public.payroll_assert_account(_company_id, _er_liab, ARRAY['liability']::public.account_type[], 'Employer contribution liability account');

  IF _schedule_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payroll_pay_schedules
      WHERE id = _schedule_id AND company_id = _company_id AND is_active
    ) THEN
      RAISE EXCEPTION 'Default pay schedule was not found in this organisation';
    END IF;
  END IF;

  SELECT * INTO _row FROM public.payroll_settings WHERE company_id = _company_id FOR UPDATE;
  IF FOUND THEN
    IF _expected_version IS NOT NULL AND _row.version <> _expected_version THEN
      RAISE EXCEPTION 'Payroll settings changed elsewhere. Reload and try again.';
    END IF;
    UPDATE public.payroll_settings SET
      enabled = _enabled,
      operating_country_code = _country,
      payroll_currency = _currency,
      default_pay_schedule_id = _schedule_id,
      payroll_start_date = _start_date,
      default_working_days_per_week = _days,
      default_working_hours_per_day = _hours,
      payment_date_offset_days = _offset,
      salary_expense_account_id = _salary,
      net_pay_liability_account_id = _net,
      deduction_liability_account_id = _ded,
      employer_expense_account_id = _er_exp,
      employer_liability_account_id = _er_liab,
      default_payment_method = _method,
      requires_approval = _requires_approval,
      rounding_mode = _rounding,
      payslip_show_employer_costs = _show_er,
      payslip_footer_note = _footer,
      payslip_branding_name = _branding,
      employee_number_prefix = _emp_prefix,
      disclaimer_acknowledged = _disclaimer OR _row.disclaimer_acknowledged,
      version = _row.version + 1,
      updated_at = now()
    WHERE company_id = _company_id
    RETURNING * INTO _row;
  ELSE
    INSERT INTO public.payroll_settings (
      company_id, enabled, operating_country_code, payroll_currency, default_pay_schedule_id,
      payroll_start_date, default_working_days_per_week, default_working_hours_per_day,
      payment_date_offset_days, salary_expense_account_id, net_pay_liability_account_id,
      deduction_liability_account_id, employer_expense_account_id, employer_liability_account_id,
      default_payment_method, requires_approval, rounding_mode, payslip_show_employer_costs,
      payslip_footer_note, payslip_branding_name, employee_number_prefix, disclaimer_acknowledged
    ) VALUES (
      _company_id, _enabled, _country, _currency, _schedule_id, _start_date, _days, _hours,
      _offset, _salary, _net, _ded, _er_exp, _er_liab, _method, _requires_approval, _rounding,
      _show_er, _footer, _branding, _emp_prefix, _disclaimer
    )
    RETURNING * INTO _row;
  END IF;

  PERFORM public.payroll_seed_default_components(_company_id);

  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES
    (_company_id, 'payroll_run', 'PR-', 1, 4),
    (_company_id, 'payslip', 'PS-', 1, 4)
  ON CONFLICT DO NOTHING;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.settings.saved',
    'payroll_settings',
    _company_id::TEXT,
    jsonb_build_object(
      'enabled', _row.enabled,
      'operating_country_code', _row.operating_country_code,
      'payroll_currency', _row.payroll_currency,
      'version', _row.version
    )
  );

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_settings(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_settings(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_pay_schedule(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _name TEXT;
  _frequency TEXT;
  _anchor DATE;
  _offset INTEGER;
  _is_default BOOLEAN;
  _is_active BOOLEAN;
  _row public.payroll_pay_schedules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.settings.edit') THEN
    RAISE EXCEPTION 'You do not have permission to edit payroll settings';
  END IF;

  _id := NULLIF(_payload->>'id', '')::UUID;
  _name := trim(COALESCE(_payload->>'name', ''));
  _frequency := COALESCE(_payload->>'frequency', 'monthly');
  _anchor := NULLIF(_payload->>'anchor_date', '')::DATE;
  _offset := COALESCE((_payload->>'payment_offset_days')::INTEGER, 0);
  _is_default := COALESCE((_payload->>'is_default')::BOOLEAN, false);
  _is_active := COALESCE((_payload->>'is_active')::BOOLEAN, true);

  IF char_length(_name) < 1 OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Pay schedule name is required';
  END IF;
  IF _frequency NOT IN ('weekly', 'biweekly', 'semimonthly', 'monthly') THEN
    RAISE EXCEPTION 'Unsupported pay schedule frequency';
  END IF;
  IF _anchor IS NULL THEN RAISE EXCEPTION 'Pay schedule anchor date is required'; END IF;
  IF _offset < -31 OR _offset > 62 THEN RAISE EXCEPTION 'Payment offset is out of range'; END IF;

  IF _is_default AND _is_active THEN
    UPDATE public.payroll_pay_schedules
    SET is_default = false, updated_at = now()
    WHERE company_id = _company_id AND is_default AND (_id IS NULL OR id <> _id);
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.payroll_pay_schedules (
      company_id, name, frequency, anchor_date, payment_offset_days, is_default, is_active
    ) VALUES (
      _company_id, _name, _frequency, _anchor, _offset, _is_default AND _is_active, _is_active
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.payroll_pay_schedules SET
      name = _name,
      frequency = _frequency,
      anchor_date = _anchor,
      payment_offset_days = _offset,
      is_default = _is_default AND _is_active,
      is_active = _is_active,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pay schedule not found'; END IF;
  END IF;

  IF _row.is_default THEN
    UPDATE public.payroll_settings
    SET default_pay_schedule_id = _row.id, updated_at = now()
    WHERE company_id = _company_id;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.pay_schedule.saved',
    'payroll_pay_schedule',
    _row.id::TEXT,
    jsonb_build_object('name', _row.name, 'frequency', _row.frequency, 'is_default', _row.is_default)
  );

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_pay_schedule(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_pay_schedule(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_component_type(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _code TEXT;
  _name TEXT;
  _kind TEXT;
  _method TEXT;
  _base TEXT;
  _taxable BOOLEAN;
  _recurring BOOLEAN;
  _active BOOLEAN;
  _sort INTEGER;
  _expense UUID;
  _liability UUID;
  _existing public.payroll_component_types%ROWTYPE;
  _row public.payroll_component_types%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.settings.edit') THEN
    RAISE EXCEPTION 'You do not have permission to edit payroll settings';
  END IF;

  _id := NULLIF(_payload->>'id', '')::UUID;
  _code := upper(trim(COALESCE(_payload->>'code', '')));
  _name := trim(COALESCE(_payload->>'name', ''));
  _kind := COALESCE(_payload->>'kind', 'earning');
  _method := COALESCE(_payload->>'calculation_method', 'fixed');
  _base := NULLIF(_payload->>'percentage_base', '');
  _taxable := COALESCE((_payload->>'is_taxable')::BOOLEAN, true);
  _recurring := COALESCE((_payload->>'is_recurring_default')::BOOLEAN, true);
  _active := COALESCE((_payload->>'is_active')::BOOLEAN, true);
  _sort := COALESCE((_payload->>'sort_order')::INTEGER, 100);
  _expense := NULLIF(_payload->>'expense_account_id', '')::UUID;
  _liability := NULLIF(_payload->>'liability_account_id', '')::UUID;

  IF char_length(_code) < 1 OR char_length(_code) > 40 THEN
    RAISE EXCEPTION 'Component code is required';
  END IF;
  IF char_length(_name) < 1 OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Component name is required';
  END IF;
  IF _kind NOT IN ('earning', 'deduction', 'employer_contribution') THEN
    RAISE EXCEPTION 'Unsupported component kind';
  END IF;
  IF _method NOT IN ('fixed', 'percentage', 'hourly', 'unit', 'manual') THEN
    RAISE EXCEPTION 'Unsupported calculation method';
  END IF;
  IF _method = 'percentage' AND (_base IS NULL OR _base NOT IN ('gross', 'basic', 'taxable_earnings')) THEN
    RAISE EXCEPTION 'Percentage components require a percentage base';
  END IF;
  IF _method <> 'percentage' THEN _base := NULL; END IF;
  IF _sort < 0 OR _sort > 100000 THEN RAISE EXCEPTION 'Sort order is out of range'; END IF;

  PERFORM public.payroll_assert_account(_company_id, _expense, ARRAY['expense']::public.account_type[], 'Component expense account');
  PERFORM public.payroll_assert_account(_company_id, _liability, ARRAY['liability']::public.account_type[], 'Component liability account');

  IF _id IS NULL THEN
    INSERT INTO public.payroll_component_types (
      company_id, code, name, kind, calculation_method, percentage_base, is_taxable,
      is_recurring_default, is_system, is_active, sort_order, expense_account_id, liability_account_id
    ) VALUES (
      _company_id, _code, _name, _kind, _method, _base, _taxable, _recurring, false, _active,
      _sort, _expense, _liability
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _existing
    FROM public.payroll_component_types
    WHERE id = _id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Component type not found'; END IF;
    IF _existing.is_system THEN
      -- System codes/kinds stay fixed; labels and accounts may change.
      _code := _existing.code;
      _kind := _existing.kind;
      _method := _existing.calculation_method;
    END IF;
    UPDATE public.payroll_component_types SET
      code = _code,
      name = _name,
      kind = _kind,
      calculation_method = _method,
      percentage_base = _base,
      is_taxable = _taxable,
      is_recurring_default = _recurring,
      is_active = _active,
      sort_order = _sort,
      expense_account_id = _expense,
      liability_account_id = _liability,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.component_type.saved',
    'payroll_component_type',
    _row.id::TEXT,
    jsonb_build_object('code', _row.code, 'kind', _row.kind, 'is_active', _row.is_active)
  );

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_component_type(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_component_type(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_payroll_document_sequences(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run_prefix TEXT;
  _slip_prefix TEXT;
  _run_next INTEGER;
  _slip_next INTEGER;
  _run_pad INTEGER;
  _slip_pad INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.settings.edit') THEN
    RAISE EXCEPTION 'You do not have permission to edit payroll settings';
  END IF;

  _run_prefix := COALESCE(NULLIF(trim(COALESCE(_payload->>'payroll_run_prefix', '')), ''), 'PR-');
  _slip_prefix := COALESCE(NULLIF(trim(COALESCE(_payload->>'payslip_prefix', '')), ''), 'PS-');
  _run_next := COALESCE((_payload->>'payroll_run_next')::INTEGER, 1);
  _slip_next := COALESCE((_payload->>'payslip_next')::INTEGER, 1);
  _run_pad := COALESCE((_payload->>'payroll_run_padding')::INTEGER, 4);
  _slip_pad := COALESCE((_payload->>'payslip_padding')::INTEGER, 4);

  IF char_length(_run_prefix) > 12 OR char_length(_slip_prefix) > 12 THEN
    RAISE EXCEPTION 'Document prefixes must be 12 characters or fewer';
  END IF;
  IF _run_next < 1 OR _slip_next < 1 THEN RAISE EXCEPTION 'Next numbers must be at least 1'; END IF;
  IF _run_pad < 1 OR _run_pad > 10 OR _slip_pad < 1 OR _slip_pad > 10 THEN
    RAISE EXCEPTION 'Padding must be between 1 and 10';
  END IF;

  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES
    (_company_id, 'payroll_run', _run_prefix, _run_next, _run_pad),
    (_company_id, 'payslip', _slip_prefix, _slip_next, _slip_pad)
  ON CONFLICT (company_id, document_type) DO UPDATE
  SET prefix = EXCLUDED.prefix,
      next_number = EXCLUDED.next_number,
      padding = EXCLUDED.padding;

  PERFORM public.record_audit_event(
    _company_id,
    'payroll.document_sequences.saved',
    'document_sequences',
    _company_id::TEXT,
    jsonb_build_object(
      'payroll_run_prefix', _run_prefix,
      'payslip_prefix', _slip_prefix
    )
  );

  RETURN jsonb_build_object(
    'payroll_run', jsonb_build_object('prefix', _run_prefix, 'next_number', _run_next, 'padding', _run_pad),
    'payslip', jsonb_build_object('prefix', _slip_prefix, 'next_number', _slip_next, 'padding', _slip_pad)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_payroll_document_sequences(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payroll_document_sequences(UUID, JSONB) TO authenticated;
