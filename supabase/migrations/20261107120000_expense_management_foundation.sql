-- Expense Management EM-01: foundation schema, permissions and settings RPCs.
--
-- Additive and idempotent. Does not rewrite financial history.
-- Does not replace purchase_expenses or employee_expense_claims (MVP coexistence).
--
-- Explicit non-goals (later batches)
--  * Claim CRUD UI, multi-level approvals, reimbursements, mileage/travel/advances/cards
--  * Journal posting changes, OCR/email providers, report pack
--
-- Rules
--  * Clients SELECT under RLS; mutations use SECURITY DEFINER RPCs with permission checks.
--  * Amounts use integer minor units.
--  * Approval, posting and reimbursement statuses are independent columns.

-- ---------------------------------------------------------------------------
-- Permissions (extend catalogue; preserve expenses.submit / expenses.approve)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'expenses.view'),
  ('admin', 'expenses.view'),
  ('accountant', 'expenses.view'),
  ('bookkeeper', 'expenses.view'),
  ('read_only', 'expenses.view'),

  ('owner', 'expenses.post'),
  ('admin', 'expenses.post'),
  ('accountant', 'expenses.post'),
  ('bookkeeper', 'expenses.post'),

  ('owner', 'expenses.reimburse'),
  ('admin', 'expenses.reimburse'),
  ('accountant', 'expenses.reimburse'),
  ('bookkeeper', 'expenses.reimburse'),

  ('owner', 'expenses.manage_cards'),
  ('admin', 'expenses.manage_cards'),
  ('accountant', 'expenses.manage_cards'),

  ('owner', 'expenses.manage_advances'),
  ('admin', 'expenses.manage_advances'),
  ('accountant', 'expenses.manage_advances'),
  ('bookkeeper', 'expenses.manage_advances'),

  ('owner', 'expenses.manage_policies'),
  ('admin', 'expenses.manage_policies'),
  ('accountant', 'expenses.manage_policies'),

  ('owner', 'expenses.export'),
  ('admin', 'expenses.export'),
  ('accountant', 'expenses.export'),
  ('bookkeeper', 'expenses.export'),
  ('read_only', 'expenses.export'),

  ('owner', 'expenses.audit'),
  ('admin', 'expenses.audit'),
  ('accountant', 'expenses.audit'),
  ('read_only', 'expenses.audit'),

  ('owner', 'expenses.admin'),
  ('admin', 'expenses.admin')
ON CONFLICT (role, permission) DO NOTHING;

-- Ensure legacy keys remain present for every role that already had them.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'expenses.submit'),
  ('admin', 'expenses.submit'),
  ('accountant', 'expenses.submit'),
  ('bookkeeper', 'expenses.submit'),
  ('staff', 'expenses.submit'),
  ('owner', 'expenses.approve'),
  ('admin', 'expenses.approve'),
  ('accountant', 'expenses.approve')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_management_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  claim_number_prefix TEXT NOT NULL DEFAULT 'EXP-'
    CHECK (char_length(trim(claim_number_prefix)) BETWEEN 1 AND 12),
  default_claim_currency CHAR(3),
  employee_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  employee_advance_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  petty_cash_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fx_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fx_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  require_receipt_above_minor BIGINT NOT NULL DEFAULT 0
    CHECK (require_receipt_above_minor >= 0),
  allow_multi_currency_claims BOOLEAN NOT NULL DEFAULT true,
  prevent_self_approval BOOLEAN NOT NULL DEFAULT true,
  default_distance_unit TEXT NOT NULL DEFAULT 'km'
    CHECK (default_distance_unit IN ('km', 'mi')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Categories (account-linked; used by later claim lines)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  tax_code_id UUID,
  is_reimbursable_default BOOLEAN NOT NULL DEFAULT true,
  is_billable_default BOOLEAN NOT NULL DEFAULT false,
  requires_receipt BOOLEAN NOT NULL DEFAULT false,
  is_mileage BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_categories_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT expense_categories_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_company_code_uidx
  ON public.expense_categories (company_id, lower(code));
CREATE INDEX IF NOT EXISTS expense_categories_company_active_idx
  ON public.expense_categories (company_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Claims (multi-line foundation; separate lifecycle columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  claimant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  employment_type TEXT NOT NULL DEFAULT 'employee'
    CHECK (employment_type IN ('employee', 'contractor')),
  claim_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  claim_currency CHAR(3) NOT NULL,
  reimbursement_currency CHAR(3) NOT NULL,
  payment_source TEXT NOT NULL DEFAULT 'employee_paid'
    CHECK (payment_source IN (
      'employee_paid', 'corporate_card', 'cash_advance', 'company_paid'
    )),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  department_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  cost_centre_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  class_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  location_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN (
      'draft', 'submitted', 'in_review', 'approved',
      'returned', 'rejected', 'withdrawn', 'voided'
    )),
  posting_status TEXT NOT NULL DEFAULT 'not_posted'
    CHECK (posting_status IN (
      'not_posted', 'ready', 'posting', 'posted', 'failed', 'reversed'
    )),
  reimbursement_status TEXT NOT NULL DEFAULT 'not_eligible'
    CHECK (reimbursement_status IN (
      'not_eligible', 'eligible', 'awaiting_payment', 'payment_initiated',
      'partially_paid', 'paid', 'payment_failed', 'refunded'
    )),
  subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  reimbursable_minor BIGINT NOT NULL DEFAULT 0 CHECK (reimbursable_minor >= 0),
  non_reimbursable_minor BIGINT NOT NULL DEFAULT 0 CHECK (non_reimbursable_minor >= 0),
  base_currency_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (base_currency_total_minor >= 0),
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  void_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  legacy_employee_claim_id UUID REFERENCES public.employee_expense_claims(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_claims_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  CONSTRAINT expense_claims_totals CHECK (total_minor = subtotal_minor + tax_minor),
  CONSTRAINT expense_claims_reimbursable_parts CHECK (
    reimbursable_minor + non_reimbursable_minor = total_minor
  ),
  CONSTRAINT expense_claims_period CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_claims_company_number_uidx
  ON public.expense_claims (company_id, lower(claim_number));
CREATE INDEX IF NOT EXISTS expense_claims_company_claimant_idx
  ON public.expense_claims (company_id, claimant_user_id, claim_date DESC);
CREATE INDEX IF NOT EXISTS expense_claims_company_approval_idx
  ON public.expense_claims (company_id, approval_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS expense_claims_company_posting_idx
  ON public.expense_claims (company_id, posting_status);
CREATE INDEX IF NOT EXISTS expense_claims_company_reimburse_idx
  ON public.expense_claims (company_id, reimbursement_status);

CREATE TABLE IF NOT EXISTS public.expense_claim_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  expense_date DATE NOT NULL,
  merchant_name TEXT,
  receipt_number TEXT,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  tax_code_id UUID,
  quantity NUMERIC(18, 6) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0),
  net_minor BIGINT NOT NULL DEFAULT 0 CHECK (net_minor >= 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  gross_minor BIGINT NOT NULL DEFAULT 0 CHECK (gross_minor >= 0),
  currency_code CHAR(3) NOT NULL,
  exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  base_currency_gross_minor BIGINT NOT NULL DEFAULT 0 CHECK (base_currency_gross_minor >= 0),
  reimbursable_minor BIGINT NOT NULL DEFAULT 0 CHECK (reimbursable_minor >= 0),
  non_reimbursable_minor BIGINT NOT NULL DEFAULT 0 CHECK (non_reimbursable_minor >= 0),
  employee_paid_minor BIGINT NOT NULL DEFAULT 0 CHECK (employee_paid_minor >= 0),
  company_paid_minor BIGINT NOT NULL DEFAULT 0 CHECK (company_paid_minor >= 0),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  department_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  cost_centre_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  class_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  location_option_id UUID REFERENCES public.tracking_options(id) ON DELETE SET NULL,
  is_billable BOOLEAN NOT NULL DEFAULT false,
  rebilling_method TEXT
    CHECK (rebilling_method IS NULL OR rebilling_method IN ('actual', 'markup', 'agreed_rate')),
  policy_exception TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_claim_lines_unique_no UNIQUE (claim_id, line_no),
  CONSTRAINT expense_claim_lines_desc_len CHECK (char_length(trim(description)) BETWEEN 1 AND 500),
  CONSTRAINT expense_claim_lines_gross CHECK (gross_minor = net_minor + tax_minor),
  CONSTRAINT expense_claim_lines_reimbursable_parts CHECK (
    reimbursable_minor + non_reimbursable_minor = gross_minor
  )
);

CREATE INDEX IF NOT EXISTS expense_claim_lines_claim_idx
  ON public.expense_claim_lines (claim_id, line_no);
CREATE INDEX IF NOT EXISTS expense_claim_lines_company_date_idx
  ON public.expense_claim_lines (company_id, expense_date DESC);

CREATE TABLE IF NOT EXISTS public.expense_claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  approval_status_after TEXT,
  posting_status_after TEXT,
  reimbursement_status_after TEXT,
  note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  acted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT expense_claim_events_type_len CHECK (char_length(trim(event_type)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS expense_claim_events_timeline_idx
  ON public.expense_claim_events (claim_id, acted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS expense_claim_events_company_idx
  ON public.expense_claim_events (company_id, acted_at DESC);

-- ---------------------------------------------------------------------------
-- Document sequences
-- ---------------------------------------------------------------------------
INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'expense_claim', 'EXP-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tracking assignment entity types (expense claim + line)
-- ---------------------------------------------------------------------------
ALTER TABLE public.document_tracking_assignments
  DROP CONSTRAINT IF EXISTS document_tracking_entity_type_check;
ALTER TABLE public.document_tracking_assignments
  ADD CONSTRAINT document_tracking_entity_type_check CHECK (entity_type IN (
    'sales_invoice', 'sales_quote', 'sales_credit_note',
    'purchase_bill', 'purchase_credit_note', 'purchase_order',
    'journal', 'bank_transaction', 'expense',
    'expense_claim'
  ));

ALTER TABLE public.line_tracking_assignments
  DROP CONSTRAINT IF EXISTS line_tracking_entity_type_check;
ALTER TABLE public.line_tracking_assignments
  ADD CONSTRAINT line_tracking_entity_type_check CHECK (entity_type IN (
    'sales_invoice_line', 'purchase_bill_line', 'journal_line', 'bank_transaction_line',
    'expense_claim_line'
  ));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.expense_management_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense settings readable with view or submit" ON public.expense_management_settings;
CREATE POLICY "Expense settings readable with view or submit"
  ON public.expense_management_settings FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.submit')
      OR public.has_company_permission(company_id, 'expenses.manage_policies')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

DROP POLICY IF EXISTS "Expense categories readable with view or submit" ON public.expense_categories;
CREATE POLICY "Expense categories readable with view or submit"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.submit')
      OR public.has_company_permission(company_id, 'expenses.manage_policies')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

DROP POLICY IF EXISTS "Expense claims select scoped" ON public.expense_claims;
CREATE POLICY "Expense claims select scoped"
  ON public.expense_claims FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      (
        claimant_user_id = auth.uid()
        AND public.has_company_permission(company_id, 'expenses.submit')
      )
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.approve')
      OR public.has_company_permission(company_id, 'expenses.audit')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

DROP POLICY IF EXISTS "Expense claim lines select scoped" ON public.expense_claim_lines;
CREATE POLICY "Expense claim lines select scoped"
  ON public.expense_claim_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expense_claims c
      WHERE c.id = expense_claim_lines.claim_id
        AND c.company_id = expense_claim_lines.company_id
        AND public.is_company_member(c.company_id)
        AND (
          (
            c.claimant_user_id = auth.uid()
            AND public.has_company_permission(c.company_id, 'expenses.submit')
          )
          OR public.has_company_permission(c.company_id, 'expenses.view')
          OR public.has_company_permission(c.company_id, 'expenses.approve')
          OR public.has_company_permission(c.company_id, 'expenses.audit')
          OR public.has_company_permission(c.company_id, 'expenses.admin')
        )
    )
  );

DROP POLICY IF EXISTS "Expense claim events select scoped" ON public.expense_claim_events;
CREATE POLICY "Expense claim events select scoped"
  ON public.expense_claim_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.expense_claims c
      WHERE c.id = expense_claim_events.claim_id
        AND c.company_id = expense_claim_events.company_id
        AND public.is_company_member(c.company_id)
        AND (
          (
            c.claimant_user_id = auth.uid()
            AND public.has_company_permission(c.company_id, 'expenses.submit')
          )
          OR public.has_company_permission(c.company_id, 'expenses.view')
          OR public.has_company_permission(c.company_id, 'expenses.approve')
          OR public.has_company_permission(c.company_id, 'expenses.audit')
          OR public.has_company_permission(c.company_id, 'expenses.admin')
        )
    )
  );

-- No direct client writes — RPCs only.
REVOKE ALL ON TABLE public.expense_management_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_claim_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_claim_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.expense_management_settings TO authenticated;
GRANT SELECT ON TABLE public.expense_categories TO authenticated;
GRANT SELECT ON TABLE public.expense_claims TO authenticated;
GRANT SELECT ON TABLE public.expense_claim_lines TO authenticated;
GRANT SELECT ON TABLE public.expense_claim_events TO authenticated;

GRANT ALL ON TABLE public.expense_management_settings TO service_role;
GRANT ALL ON TABLE public.expense_categories TO service_role;
GRANT ALL ON TABLE public.expense_claims TO service_role;
GRANT ALL ON TABLE public.expense_claim_lines TO service_role;
GRANT ALL ON TABLE public.expense_claim_events TO service_role;

-- ---------------------------------------------------------------------------
-- Settings RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_expense_management_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_management_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense settings access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_management_settings
  WHERE company_id = _company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'company_id', _company_id,
      'enabled', false,
      'claim_number_prefix', 'EXP-',
      'default_claim_currency', NULL,
      'employee_payable_account_id', NULL,
      'employee_advance_account_id', NULL,
      'petty_cash_account_id', NULL,
      'fx_gain_account_id', NULL,
      'fx_loss_account_id', NULL,
      'require_receipt_above_minor', 0,
      'allow_multi_currency_claims', true,
      'prevent_self_approval', true,
      'default_distance_unit', 'km',
      'version', 0,
      'exists', false
    );
  END IF;

  RETURN jsonb_build_object(
    'company_id', _row.company_id,
    'enabled', _row.enabled,
    'claim_number_prefix', _row.claim_number_prefix,
    'default_claim_currency', _row.default_claim_currency,
    'employee_payable_account_id', _row.employee_payable_account_id,
    'employee_advance_account_id', _row.employee_advance_account_id,
    'petty_cash_account_id', _row.petty_cash_account_id,
    'fx_gain_account_id', _row.fx_gain_account_id,
    'fx_loss_account_id', _row.fx_loss_account_id,
    'require_receipt_above_minor', _row.require_receipt_above_minor,
    'allow_multi_currency_claims', _row.allow_multi_currency_claims,
    'prevent_self_approval', _row.prevent_self_approval,
    'default_distance_unit', _row.default_distance_unit,
    'version', _row.version,
    'updated_at', _row.updated_at,
    'exists', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_management_settings(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _expected_version INTEGER;
  _prefix TEXT;
  _currency TEXT;
  _distance TEXT;
  _row public.expense_management_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense settings edit denied' USING ERRCODE = '42501';
  END IF;

  _expected_version := COALESCE((_payload->>'version')::INTEGER, 0);
  _prefix := NULLIF(btrim(COALESCE(_payload->>'claim_number_prefix', 'EXP-')), '');
  IF _prefix IS NULL OR char_length(_prefix) > 12 THEN
    RAISE EXCEPTION 'Claim number prefix must be 1–12 characters';
  END IF;

  _currency := NULLIF(upper(btrim(COALESCE(_payload->>'default_claim_currency', ''))), '');
  IF _currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Default claim currency must be a 3-letter ISO code';
  END IF;

  _distance := COALESCE(NULLIF(btrim(_payload->>'default_distance_unit'), ''), 'km');
  IF _distance NOT IN ('km', 'mi') THEN
    RAISE EXCEPTION 'Distance unit must be km or mi';
  END IF;

  SELECT * INTO _row
  FROM public.expense_management_settings
  WHERE company_id = _company_id
  FOR UPDATE;

  IF FOUND THEN
    IF _row.version <> _expected_version THEN
      RAISE EXCEPTION 'Expense settings were updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.expense_management_settings SET
      enabled = COALESCE((_payload->>'enabled')::BOOLEAN, enabled),
      claim_number_prefix = _prefix,
      default_claim_currency = _currency,
      employee_payable_account_id = NULLIF(_payload->>'employee_payable_account_id', '')::UUID,
      employee_advance_account_id = NULLIF(_payload->>'employee_advance_account_id', '')::UUID,
      petty_cash_account_id = NULLIF(_payload->>'petty_cash_account_id', '')::UUID,
      fx_gain_account_id = NULLIF(_payload->>'fx_gain_account_id', '')::UUID,
      fx_loss_account_id = NULLIF(_payload->>'fx_loss_account_id', '')::UUID,
      require_receipt_above_minor = GREATEST(
        COALESCE((_payload->>'require_receipt_above_minor')::BIGINT, require_receipt_above_minor),
        0
      ),
      allow_multi_currency_claims = COALESCE(
        (_payload->>'allow_multi_currency_claims')::BOOLEAN,
        allow_multi_currency_claims
      ),
      prevent_self_approval = COALESCE(
        (_payload->>'prevent_self_approval')::BOOLEAN,
        prevent_self_approval
      ),
      default_distance_unit = _distance,
      version = version + 1,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
    WHERE company_id = _company_id
    RETURNING * INTO _row;
  ELSE
    IF _expected_version <> 0 THEN
      RAISE EXCEPTION 'Expense settings were updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.expense_management_settings (
      company_id, enabled, claim_number_prefix, default_claim_currency,
      employee_payable_account_id, employee_advance_account_id, petty_cash_account_id,
      fx_gain_account_id, fx_loss_account_id, require_receipt_above_minor,
      allow_multi_currency_claims, prevent_self_approval, default_distance_unit,
      version, updated_by
    ) VALUES (
      _company_id,
      COALESCE((_payload->>'enabled')::BOOLEAN, false),
      _prefix,
      _currency,
      NULLIF(_payload->>'employee_payable_account_id', '')::UUID,
      NULLIF(_payload->>'employee_advance_account_id', '')::UUID,
      NULLIF(_payload->>'petty_cash_account_id', '')::UUID,
      NULLIF(_payload->>'fx_gain_account_id', '')::UUID,
      NULLIF(_payload->>'fx_loss_account_id', '')::UUID,
      GREATEST(COALESCE((_payload->>'require_receipt_above_minor')::BIGINT, 0), 0),
      COALESCE((_payload->>'allow_multi_currency_claims')::BOOLEAN, true),
      COALESCE((_payload->>'prevent_self_approval')::BOOLEAN, true),
      _distance,
      1,
      auth.uid()
    )
    RETURNING * INTO _row;
  END IF;

  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES (_company_id, 'expense_claim', _prefix, 1, 4)
  ON CONFLICT (company_id, document_type) DO UPDATE
    SET prefix = EXCLUDED.prefix;

  RETURN public.get_expense_management_settings(_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_expense_management_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_management_settings(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expense_management_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_management_settings(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Demo reset: clear EM tables before existing workflow reset
-- ---------------------------------------------------------------------------
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

  DELETE FROM public.expense_claim_events WHERE company_id = _company;
  DELETE FROM public.expense_claim_lines WHERE company_id = _company;
  DELETE FROM public.expense_claims WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);
END;
$$;

NOTIFY pgrst, 'reload schema';
