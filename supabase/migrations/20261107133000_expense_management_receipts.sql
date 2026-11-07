-- Expense Management EM-04a: claim attachments + receipt inbox foundation.
-- Requires EM-01/EM-03 claim tables. Does not enable inbound email OCR providers.

-- ---------------------------------------------------------------------------
-- Attachment permission / existence map (mirrors ATTACHMENT_ENTITIES)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_attachment(
  _company_id UUID,
  _entity_type TEXT,
  _action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_company_member(_company_id) THEN RETURN false; END IF;

  IF _action = 'view' THEN
    RETURN CASE
      WHEN _entity_type IN ('sales_invoice', 'sales_quote', 'sales_credit_note', 'sales_receipt',
                            'money_sales_receipt', 'money_customer_refund')
        THEN public.has_company_permission(_company_id, 'sales.view')
      WHEN _entity_type IN ('purchase_bill', 'purchase_order', 'purchase_credit_note',
                            'purchase_expense', 'recurring_bill', 'inbox_document',
                            'money_supplier_refund')
        THEN public.has_company_permission(_company_id, 'purchases.view')
      WHEN _entity_type = 'expense_claim' THEN (
        public.has_company_permission(_company_id, 'expenses.submit')
        OR public.has_company_permission(_company_id, 'expenses.view')
        OR public.has_company_permission(_company_id, 'expenses.approve')
        OR public.has_company_permission(_company_id, 'expenses.audit')
        OR public.has_company_permission(_company_id, 'expenses.admin')
      )
      WHEN _entity_type IN ('journal', 'recurring_journal')
        THEN public.has_company_permission(_company_id, 'accounting.view')
      WHEN _entity_type = 'project' THEN (
        public.has_company_permission(_company_id, 'accounting.view')
        OR public.has_company_permission(_company_id, 'accounts.manage')
      )
      WHEN _entity_type IN ('money_receive', 'money_deposit', 'money_card_payment',
                            'money_adjustment', 'bank_transfer')
        THEN public.has_company_permission(_company_id, 'banking.view')
      WHEN _entity_type = 'product' THEN (
        public.has_company_permission(_company_id, 'products.manage')
        OR public.has_company_permission(_company_id, 'sales.view')
        OR public.has_company_permission(_company_id, 'purchases.view')
      )
      WHEN _entity_type IN ('contact', 'company') THEN true
      ELSE false
    END;
  ELSIF _action = 'manage' THEN
    RETURN CASE
      WHEN _entity_type IN ('sales_invoice', 'sales_quote', 'sales_credit_note', 'sales_receipt')
        THEN public.has_company_permission(_company_id, 'sales.draft')
      WHEN _entity_type IN ('money_sales_receipt', 'money_customer_refund')
        THEN public.has_company_permission(_company_id, 'sales.payment')
      WHEN _entity_type IN ('purchase_bill', 'purchase_order', 'purchase_credit_note',
                            'purchase_expense', 'recurring_bill', 'inbox_document')
        THEN public.has_company_permission(_company_id, 'purchases.draft')
      WHEN _entity_type = 'expense_claim' THEN (
        public.has_company_permission(_company_id, 'expenses.submit')
        OR public.has_company_permission(_company_id, 'expenses.admin')
      )
      WHEN _entity_type = 'money_supplier_refund'
        THEN public.has_company_permission(_company_id, 'purchases.payment')
      WHEN _entity_type = 'contact'
        THEN public.has_company_permission(_company_id, 'contacts.manage')
      WHEN _entity_type = 'journal'
        THEN public.has_company_permission(_company_id, 'accounting.post')
      WHEN _entity_type = 'recurring_journal'
        THEN public.has_company_permission(_company_id, 'journals.manual')
      WHEN _entity_type = 'project'
        THEN public.has_company_permission(_company_id, 'accounts.manage')
      WHEN _entity_type = 'product'
        THEN public.has_company_permission(_company_id, 'products.manage')
      WHEN _entity_type IN ('money_receive', 'money_deposit', 'money_card_payment',
                            'money_adjustment', 'bank_transfer')
        THEN public.has_company_permission(_company_id, 'banking.categorise')
      WHEN _entity_type = 'company' THEN (
        public.has_company_permission(_company_id, 'sales.draft')
        OR public.has_company_permission(_company_id, 'purchases.draft')
        OR public.has_company_permission(_company_id, 'accounting.post')
      )
      ELSE false
    END;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_entity_exists(
  _company_id UUID,
  _entity_type TEXT,
  _entity_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _table TEXT;
  _kind TEXT;
  _ok BOOLEAN;
BEGIN
  IF _company_id IS NULL OR _entity_id IS NULL OR _entity_type IS NULL THEN
    RETURN false;
  END IF;
  IF _entity_type = 'company' THEN
    RETURN _entity_id = _company_id;
  END IF;

  _table := CASE _entity_type
    WHEN 'sales_invoice' THEN 'sales_invoices'
    WHEN 'sales_quote' THEN 'sales_quotes'
    WHEN 'sales_credit_note' THEN 'sales_credit_notes'
    WHEN 'sales_receipt' THEN 'sales_receipts'
    WHEN 'purchase_bill' THEN 'purchase_bills'
    WHEN 'purchase_order' THEN 'purchase_orders'
    WHEN 'purchase_credit_note' THEN 'purchase_credit_notes'
    WHEN 'purchase_expense' THEN 'purchase_expenses'
    WHEN 'expense_claim' THEN 'expense_claims'
    WHEN 'recurring_bill' THEN 'recurring_bills'
    WHEN 'inbox_document' THEN 'inbox_documents'
    WHEN 'contact' THEN 'contacts'
    WHEN 'journal' THEN 'journals'
    WHEN 'recurring_journal' THEN 'recurring_journal_templates'
    WHEN 'product' THEN 'products'
    WHEN 'project' THEN 'projects'
    WHEN 'bank_transfer' THEN 'bank_transfers'
    WHEN 'money_sales_receipt' THEN 'money_documents'
    WHEN 'money_customer_refund' THEN 'money_documents'
    WHEN 'money_supplier_refund' THEN 'money_documents'
    WHEN 'money_receive' THEN 'money_documents'
    WHEN 'money_deposit' THEN 'money_documents'
    WHEN 'money_card_payment' THEN 'money_documents'
    WHEN 'money_adjustment' THEN 'money_documents'
    ELSE NULL
  END;
  IF _table IS NULL THEN
    RETURN false;
  END IF;

  IF _table = 'money_documents' THEN
    _kind := CASE _entity_type
      WHEN 'money_sales_receipt' THEN 'sales_receipt'
      WHEN 'money_customer_refund' THEN 'customer_refund'
      WHEN 'money_supplier_refund' THEN 'supplier_refund'
      WHEN 'money_receive' THEN 'receive_money'
      WHEN 'money_deposit' THEN 'bank_deposit'
      WHEN 'money_card_payment' THEN 'card_payment'
      WHEN 'money_adjustment' THEN 'bank_adjustment'
      ELSE NULL
    END;
    SELECT EXISTS (
      SELECT 1 FROM public.money_documents
      WHERE id = _entity_id AND company_id = _company_id AND kind = _kind
    ) INTO _ok;
    RETURN COALESCE(_ok, false);
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND company_id = $2)',
    _table
  ) INTO _ok USING _entity_id, _company_id;
  RETURN COALESCE(_ok, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- Receipt inbox (manual / future email). Not claimed as inbound-email live.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_receipt_inbox_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'email', 'mobile', 'import')),
  status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'assigned', 'matched', 'dismissed')),
  file_name TEXT NOT NULL,
  storage_path TEXT,
  content_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_claim_id UUID REFERENCES public.expense_claims(id) ON DELETE SET NULL,
  matched_claim_line_id UUID REFERENCES public.expense_claim_lines(id) ON DELETE SET NULL,
  attachment_id UUID REFERENCES public.document_attachments(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_receipt_inbox_file_name_len CHECK (char_length(trim(file_name)) BETWEEN 1 AND 260)
);

CREATE INDEX IF NOT EXISTS expense_receipt_inbox_company_status_idx
  ON public.expense_receipt_inbox_entries (company_id, status, created_at DESC);

ALTER TABLE public.expense_receipt_inbox_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense receipt inbox select scoped" ON public.expense_receipt_inbox_entries;
CREATE POLICY "Expense receipt inbox select scoped"
  ON public.expense_receipt_inbox_entries FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'expenses.submit')
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.approve')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

REVOKE ALL ON TABLE public.expense_receipt_inbox_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_receipt_inbox_entries TO authenticated;
GRANT ALL ON TABLE public.expense_receipt_inbox_entries TO service_role;

CREATE OR REPLACE FUNCTION public.list_expense_receipt_inbox(_company_id UUID)
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
    OR public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense receipt inbox access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC, e.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_receipt_inbox_entries e
  WHERE e.company_id = _company_id
    AND e.status IN ('unassigned', 'assigned');

  RETURN jsonb_build_object(
    'entries', _rows,
    'inbound_email_enabled', false,
    'note', 'Inbound email receipt routing is not configured. Upload receipts on a claim detail page.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_expense_receipt_inbox_entry(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _file_name TEXT := NULLIF(btrim(COALESCE(_payload->>'file_name', '')), '');
  _source TEXT := COALESCE(NULLIF(btrim(_payload->>'source'), ''), 'upload');
  _row public.expense_receipt_inbox_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense receipt inbox write denied' USING ERRCODE = '42501';
  END IF;
  IF _file_name IS NULL THEN
    RAISE EXCEPTION 'File name is required';
  END IF;
  IF _source NOT IN ('upload', 'email', 'mobile', 'import') THEN
    RAISE EXCEPTION 'Invalid receipt source';
  END IF;

  INSERT INTO public.expense_receipt_inbox_entries (
    company_id, source, status, file_name, content_type, size_bytes, notes, created_by
  ) VALUES (
    _company_id,
    _source,
    'unassigned',
    _file_name,
    NULLIF(btrim(COALESCE(_payload->>'content_type', '')), ''),
    NULLIF(_payload->>'size_bytes', '')::INTEGER,
    NULLIF(btrim(COALESCE(_payload->>'notes', '')), ''),
    auth.uid()
  )
  RETURNING * INTO _row;

  RETURN to_jsonb(_row);
END;
$$;

-- Demo reset
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

  DELETE FROM public.expense_receipt_inbox_entries WHERE company_id = _company;
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

REVOKE ALL ON FUNCTION public.list_expense_receipt_inbox(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_expense_receipt_inbox_entry(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_receipt_inbox(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_expense_receipt_inbox_entry(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
