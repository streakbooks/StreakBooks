-- Expense Management EM-04b: receipt inbox file link, match to claim, dismiss.
-- Requires 20261107133000. Does not enable inbound email or OCR.

-- ---------------------------------------------------------------------------
-- Attachment map: expense_receipt_inbox
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
      WHEN _entity_type IN ('expense_claim', 'expense_receipt_inbox') THEN (
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
      WHEN _entity_type IN ('expense_claim', 'expense_receipt_inbox') THEN (
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
    WHEN 'expense_receipt_inbox' THEN 'expense_receipt_inbox_entries'
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
    'note', 'Inbound email and OCR are not configured. Upload files here, then match them to a draft claim.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_expense_receipt_inbox_upload(
  _company_id UUID,
  _entry_id UUID,
  _attachment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _entry public.expense_receipt_inbox_entries%ROWTYPE;
  _att RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense receipt inbox write denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _entry
  FROM public.expense_receipt_inbox_entries
  WHERE id = _entry_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt inbox entry not found';
  END IF;
  IF _entry.status NOT IN ('unassigned', 'assigned') THEN
    RAISE EXCEPTION 'Only open inbox entries can receive a file';
  END IF;

  SELECT id, entity_type, entity_id, storage_path, content_type, size_bytes, file_name
  INTO _att
  FROM public.document_attachments
  WHERE id = _attachment_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;
  IF _att.entity_type IS DISTINCT FROM 'expense_receipt_inbox' OR _att.entity_id IS DISTINCT FROM _entry_id THEN
    RAISE EXCEPTION 'Attachment does not belong to this inbox entry';
  END IF;

  UPDATE public.expense_receipt_inbox_entries
  SET
    attachment_id = _att.id,
    storage_path = _att.storage_path,
    content_type = COALESCE(_att.content_type, content_type),
    size_bytes = COALESCE(_att.size_bytes, size_bytes),
    file_name = COALESCE(NULLIF(btrim(_att.file_name), ''), file_name),
    status = CASE WHEN status = 'unassigned' THEN 'assigned' ELSE status END,
    updated_at = now()
  WHERE id = _entry_id
  RETURNING * INTO _entry;

  RETURN to_jsonb(_entry);
END;
$$;

CREATE OR REPLACE FUNCTION public.match_expense_receipt_to_claim(
  _company_id UUID,
  _entry_id UUID,
  _claim_id UUID,
  _claim_line_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _entry public.expense_receipt_inbox_entries%ROWTYPE;
  _claim RECORD;
  _line_ok BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense receipt match denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _entry
  FROM public.expense_receipt_inbox_entries
  WHERE id = _entry_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt inbox entry not found';
  END IF;
  IF _entry.status NOT IN ('unassigned', 'assigned') THEN
    RAISE EXCEPTION 'Receipt is already matched or dismissed';
  END IF;

  SELECT id, company_id, claimant_user_id, approval_status
  INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found';
  END IF;
  IF _claim.approval_status NOT IN ('draft', 'submitted', 'returned') THEN
    RAISE EXCEPTION 'Match only draft, submitted or returned claims';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.admin')
     AND NOT public.has_company_permission(_company_id, 'expenses.view')
     AND _claim.claimant_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only match receipts to your own claims';
  END IF;

  IF _claim_line_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.expense_claim_lines
      WHERE id = _claim_line_id AND claim_id = _claim_id AND company_id = _company_id
    ) INTO _line_ok;
    IF NOT COALESCE(_line_ok, false) THEN
      RAISE EXCEPTION 'Claim line not found on this claim';
    END IF;
  END IF;

  UPDATE public.expense_receipt_inbox_entries
  SET
    matched_claim_id = _claim_id,
    matched_claim_line_id = _claim_line_id,
    status = 'matched',
    updated_at = now()
  WHERE id = _entry_id
  RETURNING * INTO _entry;

  RETURN to_jsonb(_entry);
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_expense_receipt_inbox_entry(
  _company_id UUID,
  _entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _entry public.expense_receipt_inbox_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense receipt dismiss denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.expense_receipt_inbox_entries
  SET status = 'dismissed', updated_at = now()
  WHERE id = _entry_id
    AND company_id = _company_id
    AND status IN ('unassigned', 'assigned')
  RETURNING * INTO _entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open receipt inbox entry not found';
  END IF;

  RETURN to_jsonb(_entry);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_expense_receipt_inbox_upload(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_expense_receipt_to_claim(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_expense_receipt_inbox_entry(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_expense_receipt_inbox_upload(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_expense_receipt_to_claim(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_expense_receipt_inbox_entry(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
