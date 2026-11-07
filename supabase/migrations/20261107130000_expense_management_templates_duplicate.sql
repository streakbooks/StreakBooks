-- Expense Management EM-03b: claim templates and duplicate-as-draft.
-- Requires 20261107120000 and 20261107123000.

CREATE TABLE IF NOT EXISTS public.expense_claim_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title_template TEXT NOT NULL DEFAULT '',
  description_template TEXT,
  claim_currency CHAR(3),
  payment_source TEXT NOT NULL DEFAULT 'employee_paid'
    CHECK (payment_source IN (
      'employee_paid', 'corporate_card', 'cash_advance', 'company_paid'
    )),
  default_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_claim_templates_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT expense_claim_templates_lines_array CHECK (jsonb_typeof(default_lines) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_claim_templates_company_name_uidx
  ON public.expense_claim_templates (company_id, lower(name));
CREATE INDEX IF NOT EXISTS expense_claim_templates_company_active_idx
  ON public.expense_claim_templates (company_id, is_active, updated_at DESC);

ALTER TABLE public.expense_claim_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense templates select scoped" ON public.expense_claim_templates;
CREATE POLICY "Expense templates select scoped"
  ON public.expense_claim_templates FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'expenses.submit')
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.manage_policies')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

REVOKE ALL ON TABLE public.expense_claim_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_claim_templates TO authenticated;
GRANT ALL ON TABLE public.expense_claim_templates TO service_role;

CREATE OR REPLACE FUNCTION public.list_expense_claim_templates(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense template access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY lower(t.name), t.id), '[]'::jsonb)
  INTO _rows
  FROM public.expense_claim_templates t
  WHERE t.company_id = _company_id AND t.is_active;

  RETURN jsonb_build_object('templates', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_claim_template(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _name TEXT := NULLIF(btrim(COALESCE(_payload->>'name', '')), '');
  _title TEXT := COALESCE(btrim(_payload->>'title_template'), '');
  _description TEXT := NULLIF(btrim(COALESCE(_payload->>'description_template', '')), '');
  _currency TEXT := NULLIF(upper(btrim(COALESCE(_payload->>'claim_currency', ''))), '');
  _payment TEXT := COALESCE(NULLIF(btrim(_payload->>'payment_source'), ''), 'employee_paid');
  _lines JSONB := COALESCE(_payload->'default_lines', '[]'::jsonb);
  _row public.expense_claim_templates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense template edit denied' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'Template name is required';
  END IF;
  IF _currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Template currency must be a 3-letter ISO code';
  END IF;
  IF _payment NOT IN ('employee_paid', 'corporate_card', 'cash_advance', 'company_paid') THEN
    RAISE EXCEPTION 'Invalid payment source';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' THEN
    RAISE EXCEPTION 'Template lines must be an array';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.expense_claim_templates (
      company_id, name, title_template, description_template,
      claim_currency, payment_source, default_lines, created_by, updated_by
    ) VALUES (
      _company_id, _name, _title, _description,
      _currency, _payment, _lines, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.expense_claim_templates SET
      name = _name,
      title_template = _title,
      description_template = _description,
      claim_currency = _currency,
      payment_source = _payment,
      default_lines = _lines,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _id AND company_id = _company_id AND is_active
    RETURNING * INTO _row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Expense template not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_claim_template(
  _company_id UUID,
  _template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.submit')
  ) THEN
    RAISE EXCEPTION 'Expense template delete denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.expense_claim_templates
  SET is_active = false, updated_by = auth.uid(), updated_at = clock_timestamp()
  WHERE id = _template_id AND company_id = _company_id AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense template not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('deleted', true, 'id', _template_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_expense_claim(
  _company_id UUID,
  _claim_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _source public.expense_claims%ROWTYPE;
  _claim_number TEXT;
  _new public.expense_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim duplicate denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _source
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.expense_claim_can_read(_company_id, _source.claimant_user_id) THEN
    RAISE EXCEPTION 'Expense claim access denied' USING ERRCODE = '42501';
  END IF;

  _claim_number := public.allocate_document_number(_company_id, 'expense_claim');

  INSERT INTO public.expense_claims (
    company_id, claim_number, title, description, claimant_user_id, employment_type,
    claim_date, period_start, period_end, claim_currency, reimbursement_currency,
    payment_source, project_id, customer_contact_id,
    department_option_id, cost_centre_option_id, class_option_id, location_option_id,
    approval_status, posting_status, reimbursement_status,
    subtotal_minor, tax_minor, total_minor, reimbursable_minor, non_reimbursable_minor,
    base_currency_total_minor, notes, version, created_by, updated_by
  ) VALUES (
    _company_id, _claim_number, _source.title, _source.description, auth.uid(), _source.employment_type,
    CURRENT_DATE, _source.period_start, _source.period_end, _source.claim_currency, _source.reimbursement_currency,
    _source.payment_source, _source.project_id, _source.customer_contact_id,
    _source.department_option_id, _source.cost_centre_option_id, _source.class_option_id, _source.location_option_id,
    'draft', 'not_posted', 'not_eligible',
    _source.subtotal_minor, _source.tax_minor, _source.total_minor, _source.reimbursable_minor, _source.non_reimbursable_minor,
    _source.base_currency_total_minor, _source.notes, 1, auth.uid(), auth.uid()
  )
  RETURNING * INTO _new;

  INSERT INTO public.expense_claim_lines (
    company_id, claim_id, line_no, expense_date, merchant_name, receipt_number,
    description, category_id, account_id, tax_code_id, quantity, unit_price_minor,
    net_minor, tax_minor, gross_minor, currency_code, exchange_rate,
    base_currency_gross_minor, reimbursable_minor, non_reimbursable_minor,
    employee_paid_minor, company_paid_minor, project_id, customer_contact_id,
    department_option_id, cost_centre_option_id, class_option_id, location_option_id,
    is_billable, rebilling_method, notes
  )
  SELECT
    _company_id, _new.id, l.line_no, CURRENT_DATE, l.merchant_name, l.receipt_number,
    l.description, l.category_id, l.account_id, l.tax_code_id, l.quantity, l.unit_price_minor,
    l.net_minor, l.tax_minor, l.gross_minor, l.currency_code, l.exchange_rate,
    l.base_currency_gross_minor, l.reimbursable_minor, l.non_reimbursable_minor,
    l.employee_paid_minor, l.company_paid_minor, l.project_id, l.customer_contact_id,
    l.department_option_id, l.cost_centre_option_id, l.class_option_id, l.location_option_id,
    l.is_billable, l.rebilling_method, l.notes
  FROM public.expense_claim_lines l
  WHERE l.claim_id = _source.id
  ORDER BY l.line_no;

  PERFORM private.expense_claim_event(
    _company_id, _new.id, 'duplicated',
    _new.approval_status, _new.posting_status, _new.reimbursement_status,
    'Duplicated from ' || _source.claim_number,
    jsonb_build_object('source_claim_id', _source.id)
  );

  RETURN private.expense_claim_json(_new);
END;
$$;

-- Soft-delete cleanup for demo reset
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
  DELETE FROM public.expense_claim_templates WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_claim_templates(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_claim_template(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_expense_claim_template(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duplicate_expense_claim(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_expense_claim_templates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_claim_template(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense_claim_template(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_expense_claim(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
