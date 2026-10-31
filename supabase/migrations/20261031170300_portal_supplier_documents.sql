-- Supplier submissions, documents, messages, reminders, and staff alerts.
-- Accepting a submission creates an unposted purchase document. It does not authorise it.

CREATE OR REPLACE FUNCTION public.portal_file_is_valid(_bytes BYTEA, _mime TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _bytes IS NULL OR octet_length(_bytes) < 4 THEN RETURN false; END IF;
  IF _mime = 'application/pdf' THEN
    RETURN get_byte(_bytes, 0) = 37 AND get_byte(_bytes, 1) = 80
      AND get_byte(_bytes, 2) = 68 AND get_byte(_bytes, 3) = 70;
  ELSIF _mime = 'image/png' THEN
    RETURN get_byte(_bytes, 0) = 137 AND get_byte(_bytes, 1) = 80
      AND get_byte(_bytes, 2) = 78 AND get_byte(_bytes, 3) = 71;
  ELSIF _mime = 'image/jpeg' THEN
    RETURN get_byte(_bytes, 0) = 255 AND get_byte(_bytes, 1) = 216 AND get_byte(_bytes, 2) = 255;
  ELSIF _mime = 'image/webp' AND octet_length(_bytes) >= 12 THEN
    RETURN get_byte(_bytes, 0) = 82 AND get_byte(_bytes, 1) = 73
      AND get_byte(_bytes, 2) = 70 AND get_byte(_bytes, 3) = 70
      AND get_byte(_bytes, 8) = 87 AND get_byte(_bytes, 9) = 69
      AND get_byte(_bytes, 10) = 66 AND get_byte(_bytes, 11) = 80;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_submit_supplier_document(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _kind TEXT := payload->>'kind';
  _ref TEXT := left(btrim(COALESCE(payload->>'supplier_reference', '')), 80);
  _date DATE := NULLIF(payload->>'document_date', '')::DATE;
  _due DATE := NULLIF(payload->>'due_date', '')::DATE;
  _currency CHAR(3) := upper(COALESCE(payload->>'currency_code', ''));
  _po UUID := NULLIF(payload->>'purchase_order_id', '')::UUID;
  _memo TEXT := NULLIF(left(btrim(COALESCE(payload->>'memo', '')), 500), '');
  _lines JSONB := payload->'lines';
  _line JSONB;
  _net BIGINT;
  _tax BIGINT;
  _subtotal BIGINT := 0;
  _tax_total BIGINT := 0;
  _stored JSONB := '[]'::JSONB;
  _n INTEGER := 0;
  _id UUID;
  _email TEXT;
  _demo BOOLEAN;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'supplier' THEN RAISE EXCEPTION 'Only a supplier can submit a bill or credit note'; END IF;
  PERFORM public.portal_rate_limit('submit:' || auth.uid()::TEXT, 20, INTERVAL '15 minutes');
  IF _kind NOT IN ('bill', 'credit_note') THEN RAISE EXCEPTION 'Choose a bill or a credit note'; END IF;
  IF _ref = '' THEN RAISE EXCEPTION 'Enter your invoice or credit number'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Enter the document date'; END IF;
  IF _kind = 'bill' AND (_due IS NULL OR _due < _date) THEN
    RAISE EXCEPTION 'Enter a due date on or after the bill date';
  END IF;
  IF length(_currency) <> 3 OR NOT EXISTS (SELECT 1 FROM public.currency_decimals WHERE code = _currency) THEN
    RAISE EXCEPTION 'Choose a supported currency';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Add between 1 and 40 lines';
  END IF;
  IF _po IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders
    WHERE id = _po AND company_id = _m.company_id AND contact_id = _m.contact_id
      AND status IN ('sent', 'partially_received', 'billed')
  ) THEN
    RAISE EXCEPTION 'That purchase order is not open for this supplier';
  END IF;
  IF _kind = 'bill' AND (
    EXISTS (
      SELECT 1 FROM public.portal_supplier_submissions
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND kind = 'bill'
        AND lower(supplier_reference) = lower(_ref) AND status IN ('submitted', 'approved')
    ) OR EXISTS (
      SELECT 1 FROM public.purchase_bills
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id
        AND lower(supplier_invoice_number) = lower(_ref) AND status <> 'void'
    )
  ) THEN
    RAISE EXCEPTION 'That supplier invoice number is already in use';
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    _n := _n + 1;
    IF length(btrim(COALESCE(_line->>'description', ''))) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Line % needs a description', _n;
    END IF;
    SELECT a.net_minor, a.tax_minor INTO _net, _tax
    FROM public.portal_line_amounts(
      (_line->>'quantity')::NUMERIC,
      (_line->>'unit_price_minor')::BIGINT,
      COALESCE((_line->>'tax_rate_bps')::INTEGER, 0)
    ) a;
    _subtotal := _subtotal + _net;
    _tax_total := _tax_total + _tax;
    _stored := _stored || jsonb_build_array(jsonb_build_object(
      'description', btrim(_line->>'description'),
      'quantity', (_line->>'quantity')::NUMERIC,
      'unit_price_minor', (_line->>'unit_price_minor')::BIGINT,
      'tax_rate_bps', COALESCE((_line->>'tax_rate_bps')::INTEGER, 0),
      'net_minor', _net,
      'tax_minor', _tax
    ));
  END LOOP;

  INSERT INTO public.portal_supplier_submissions (
    company_id, contact_id, membership_id, kind, status, supplier_reference,
    document_date, due_date, currency_code, lines, memo, purchase_order_id,
    subtotal_minor, tax_minor, total_minor, submitted_by
  ) VALUES (
    _m.company_id, _m.contact_id, _m.id, _kind, 'submitted', _ref,
    _date, _due, _currency, _stored, _memo, _po,
    _subtotal, _tax_total, _subtotal + _tax_total, auth.uid()
  ) RETURNING id INTO _id;

  PERFORM public.portal_audit(_m.company_id, auth.uid(), 'portal.submission.create', 'portal_submission', _id,
    jsonb_build_object('kind', _kind, 'reference', _ref, 'total_minor', _subtotal + _tax_total));
  SELECT b.invoice_email, c.is_demo INTO _email, _demo
  FROM public.companies c
  LEFT JOIN public.company_branding b ON b.company_id = c.id
  WHERE c.id = _m.company_id;
  RETURN jsonb_build_object(
    'submission_id', _id, 'total_minor', _subtotal + _tax_total, 'currency', _currency,
    'company_email', _email, 'is_demo', COALESCE(_demo, false),
    'company_name', (SELECT name FROM public.companies WHERE id = _m.company_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_supplier_workspace(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'supplier' THEN RAISE EXCEPTION 'This page is for suppliers'; END IF;
  RETURN jsonb_build_object(
    'submissions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s)) FROM (
        SELECT id, kind, status, supplier_reference, document_date, due_date, currency_code,
          total_minor, rejection_reason, bill_id, credit_note_id, created_at
        FROM public.portal_supplier_submissions
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id
        ORDER BY created_at DESC
        LIMIT 100
      ) s
    ), '[]'::JSONB),
    'bills', COALESCE((
      SELECT jsonb_agg(to_jsonb(b)) FROM (
        SELECT id, bill_number, supplier_invoice_number, bill_date, due_date, currency_code,
          status::TEXT AS status, total_minor, amount_paid_minor, amount_credited_minor, rejection_reason
        FROM public.purchase_bills
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status::TEXT <> 'draft'
        ORDER BY bill_date DESC
        LIMIT 100
      ) b
    ), '[]'::JSONB),
    'orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(o)) FROM (
        SELECT o.id, o.order_number, o.order_date, o.currency_code, o.status::TEXT AS status,
          o.total_minor, o.memo, o.supplier_acknowledged_at,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'description', l.description, 'quantity', l.quantity,
              'unit_price_minor', l.unit_price_minor, 'tax_rate_bps', l.tax_rate_bps,
              'net_minor', l.net_minor, 'tax_minor', l.tax_minor
            ) ORDER BY l.line_no)
            FROM public.purchase_order_lines l WHERE l.order_id = o.id
          ), '[]'::JSONB) AS lines
        FROM public.purchase_orders o
        WHERE o.company_id = _m.company_id AND o.contact_id = _m.contact_id
          AND o.status IN ('sent', 'partially_received', 'billed')
        ORDER BY o.order_date DESC
        LIMIT 50
      ) o
    ), '[]'::JSONB),
    'remittances', COALESCE((
      SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT p.id, p.payment_date, p.currency_code, p.amount_minor, p.reference, p.memo,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'bill_number', b.bill_number,
              'supplier_invoice_number', b.supplier_invoice_number,
              'amount_minor', a.amount_minor
            ))
            FROM public.supplier_payment_allocations a
            JOIN public.purchase_bills b ON b.id = a.bill_id
            WHERE a.payment_id = p.id
          ), '[]'::JSONB) AS allocations
        FROM public.supplier_payments p
        WHERE p.company_id = _m.company_id AND p.contact_id = _m.contact_id AND p.status = 'paid'
        ORDER BY p.payment_date DESC
        LIMIT 50
      ) p
    ), '[]'::JSONB),
    'bank', jsonb_build_object(
      'verified', (
        SELECT jsonb_build_object(
          'account_name', account_name, 'bank_name', bank_name,
          'masked', public.portal_mask_account(account_number),
          'country_code', country_code, 'verified_at', verified_at
        )
        FROM public.contact_payment_details WHERE contact_id = _m.contact_id
      ),
      'pending', (
        SELECT jsonb_build_object(
          'id', id, 'account_name', account_name, 'bank_name', bank_name,
          'masked', public.portal_mask_account(account_number), 'created_at', created_at
        )
        FROM public.portal_bank_change_requests
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_acknowledge_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _order UUID := NULLIF(payload->>'order_id', '')::UUID;
  _note TEXT := NULLIF(left(btrim(COALESCE(payload->>'note', '')), 500), '');
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'supplier' THEN RAISE EXCEPTION 'Only a supplier can acknowledge an order'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_orders
    WHERE id = _order AND company_id = _m.company_id AND contact_id = _m.contact_id
      AND status IN ('sent', 'partially_received', 'billed')
  ) THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  INSERT INTO public.portal_po_acknowledgements (order_id, company_id, membership_id, acknowledged_by, note)
  VALUES (_order, _m.company_id, _m.id, auth.uid(), _note)
  ON CONFLICT (order_id) DO UPDATE
  SET note = EXCLUDED.note, acknowledged_at = now(), acknowledged_by = auth.uid();
  UPDATE public.purchase_orders SET supplier_acknowledged_at = now(), updated_at = now() WHERE id = _order;
  RETURN jsonb_build_object('order_id', _order, 'acknowledged', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_request_bank_change(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _id UUID;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'supplier' THEN RAISE EXCEPTION 'Only a supplier can send bank details'; END IF;
  PERFORM public.portal_rate_limit('bank:' || auth.uid()::TEXT, 5, INTERVAL '1 hour');
  IF upper(COALESCE(payload->>'country_code', '')) !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Choose a country';
  END IF;
  INSERT INTO public.portal_bank_change_requests (
    company_id, contact_id, membership_id, account_name, bank_name, account_number,
    routing_code, country_code, status, requested_by
  ) VALUES (
    _m.company_id, _m.contact_id, _m.id,
    btrim(payload->>'account_name'), btrim(payload->>'bank_name'), btrim(payload->>'account_number'),
    NULLIF(btrim(COALESCE(payload->>'routing_code', '')), ''),
    upper(payload->>'country_code'), 'pending', auth.uid()
  ) RETURNING id INTO _id;
  PERFORM public.portal_audit(_m.company_id, auth.uid(), 'portal.bank.request', 'contact', _m.contact_id,
    jsonb_build_object('request_id', _id));
  RETURN jsonb_build_object('request_id', _id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_portal_submissions(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'purchases.view') THEN
    RAISE EXCEPTION 'You do not have permission to view supplier submissions';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(s)) FROM (
      SELECT sub.id, sub.kind, sub.status, sub.supplier_reference, sub.document_date, sub.due_date,
        sub.currency_code, sub.total_minor, sub.tax_minor, sub.subtotal_minor, sub.memo, sub.lines,
        sub.purchase_order_id, sub.rejection_reason, sub.bill_id, sub.credit_note_id, sub.created_at,
        c.name AS contact_name, po.order_number
      FROM public.portal_supplier_submissions sub
      JOIN public.contacts c ON c.id = sub.contact_id
      LEFT JOIN public.purchase_orders po ON po.id = sub.purchase_order_id
      WHERE sub.company_id = _company
      ORDER BY sub.created_at DESC
      LIMIT 200
    ) s
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_decide_portal_submission(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _id UUID := NULLIF(payload->>'submission_id', '')::UUID;
  _decision TEXT := payload->>'decision';
  _reason TEXT := NULLIF(left(btrim(COALESCE(payload->>'reason', '')), 500), '');
  _sub public.portal_supplier_submissions%ROWTYPE;
  _account UUID;
  _doc UUID;
  _line JSONB;
  _n INTEGER := 0;
  _email TEXT;
BEGIN
  IF _uid IS NULL OR NOT public.has_company_permission(_company, 'purchases.draft') THEN
    RAISE EXCEPTION 'You do not have permission to review supplier submissions';
  END IF;
  PERFORM public.portal_assert_writable(_company);
  SELECT * INTO _sub FROM public.portal_supplier_submissions
  WHERE id = _id AND company_id = _company AND status = 'submitted'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission is not waiting for review'; END IF;

  IF _decision = 'reject' THEN
    IF _reason IS NULL THEN RAISE EXCEPTION 'Enter a reason for the rejection'; END IF;
    UPDATE public.portal_supplier_submissions
    SET status = 'rejected', rejection_reason = _reason, decided_by = _uid, decided_at = now()
    WHERE id = _id;
    PERFORM public.portal_notify(_company, _sub.contact_id, 'Submission was not accepted', _reason);
    RETURN jsonb_build_object('status', 'rejected');
  END IF;
  IF _decision IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;

  SELECT COALESCE(c.default_purchase_account_id, s.default_purchase_account_id) INTO _account
  FROM public.contacts c
  LEFT JOIN public.portal_settings s ON s.company_id = c.company_id
  WHERE c.id = _sub.contact_id AND c.company_id = _company;
  IF _account IS NULL THEN
    RAISE EXCEPTION 'Set a default purchase account on the supplier or in Settings → Portals before accepting';
  END IF;

  IF _sub.kind = 'bill' THEN
    INSERT INTO public.purchase_bills (
      company_id, contact_id, supplier_invoice_number, bill_date, due_date, currency_code,
      status, subtotal_minor, tax_minor, total_minor, memo, purchase_order_id, created_by,
      submitted_for_approval_at, submitted_for_approval_by
    ) VALUES (
      _company, _sub.contact_id, _sub.supplier_reference, _sub.document_date, COALESCE(_sub.due_date, _sub.document_date),
      _sub.currency_code, 'awaiting_approval', _sub.subtotal_minor, _sub.tax_minor, _sub.total_minor,
      _sub.memo, _sub.purchase_order_id, _uid, now(), _uid
    ) RETURNING id INTO _doc;
    FOR _line IN SELECT value FROM jsonb_array_elements(_sub.lines) LOOP
      _n := _n + 1;
      INSERT INTO public.purchase_bill_lines (
        company_id, bill_id, line_no, description, account_id, quantity, unit_price_minor,
        discount_minor, tax_rate_bps, net_minor, tax_minor
      ) VALUES (
        _company, _doc, _n, _line->>'description', _account,
        (_line->>'quantity')::NUMERIC, (_line->>'unit_price_minor')::BIGINT,
        0, COALESCE((_line->>'tax_rate_bps')::INTEGER, 0),
        (_line->>'net_minor')::BIGINT, (_line->>'tax_minor')::BIGINT
      );
    END LOOP;
    UPDATE public.portal_supplier_submissions
    SET status = 'approved', bill_id = _doc, decided_by = _uid, decided_at = now()
    WHERE id = _id;
  ELSE
    INSERT INTO public.purchase_credit_notes (
      company_id, contact_id, credit_number, credit_date, currency_code, status,
      subtotal_minor, tax_minor, total_minor, memo, created_by
    ) VALUES (
      _company, _sub.contact_id, _sub.supplier_reference, _sub.document_date, _sub.currency_code,
      'draft', _sub.subtotal_minor, _sub.tax_minor, _sub.total_minor, _sub.memo, _uid
    ) RETURNING id INTO _doc;
    FOR _line IN SELECT value FROM jsonb_array_elements(_sub.lines) LOOP
      _n := _n + 1;
      INSERT INTO public.purchase_credit_note_lines (
        company_id, credit_note_id, line_no, description, account_id, net_minor, tax_minor
      ) VALUES (
        _company, _doc, _n, _line->>'description', _account,
        (_line->>'net_minor')::BIGINT, (_line->>'tax_minor')::BIGINT
      );
    END LOOP;
    UPDATE public.portal_supplier_submissions
    SET status = 'approved', credit_note_id = _doc, decided_by = _uid, decided_at = now()
    WHERE id = _id;
  END IF;

  SELECT email INTO _email FROM public.portal_memberships WHERE id = _sub.membership_id;
  PERFORM public.portal_notify(
    _company, _sub.contact_id,
    'Submission accepted',
    'The organisation accepted this document. It is not on the ledger until they authorise it.'
  );
  PERFORM public.portal_audit(_company, _uid, 'portal.submission.accept', 'portal_submission', _id,
    jsonb_build_object('document_id', _doc, 'kind', _sub.kind));
  RETURN jsonb_build_object('status', 'approved', 'document_id', _doc, 'kind', _sub.kind, 'email', _email);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_list_bank_requests(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_company_permission(_company, 'purchases.payment')
    OR public.has_company_permission(_company, 'contacts.manage')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to review bank details';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(r)) FROM (
      SELECT req.id, req.contact_id, c.name AS contact_name, req.account_name, req.bank_name,
        req.account_number, req.routing_code, req.country_code, req.status, req.created_at, req.decision_note
      FROM public.portal_bank_change_requests req
      JOIN public.contacts c ON c.id = req.contact_id
      WHERE req.company_id = _company AND req.status = 'pending'
      ORDER BY req.created_at
    ) r
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_decide_bank_request(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _id UUID := NULLIF(payload->>'request_id', '')::UUID;
  _decision TEXT := payload->>'decision';
  _note TEXT := NULLIF(left(btrim(COALESCE(payload->>'note', '')), 500), '');
  _req public.portal_bank_change_requests%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT (
    public.has_company_permission(_company, 'purchases.payment')
    OR public.has_company_permission(_company, 'contacts.manage')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to verify bank details';
  END IF;
  SELECT * INTO _req FROM public.portal_bank_change_requests
  WHERE id = _id AND company_id = _company AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank request was not found'; END IF;
  IF _decision = 'reject' THEN
    UPDATE public.portal_bank_change_requests
    SET status = 'rejected', decided_by = _uid, decided_at = now(), decision_note = _note
    WHERE id = _id;
    PERFORM public.portal_notify(_company, _req.contact_id, 'Bank details were not accepted',
      COALESCE(_note, 'The organisation did not accept the new bank details.'));
    RETURN jsonb_build_object('status', 'rejected');
  END IF;
  IF _decision IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
  INSERT INTO public.contact_payment_details (
    contact_id, company_id, account_name, bank_name, account_number, routing_code,
    country_code, verified_at, verified_by
  ) VALUES (
    _req.contact_id, _company, _req.account_name, _req.bank_name, _req.account_number,
    _req.routing_code, _req.country_code, now(), _uid
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    account_name = EXCLUDED.account_name,
    bank_name = EXCLUDED.bank_name,
    account_number = EXCLUDED.account_number,
    routing_code = EXCLUDED.routing_code,
    country_code = EXCLUDED.country_code,
    verified_at = now(),
    verified_by = _uid;
  UPDATE public.portal_bank_change_requests
  SET status = 'approved', decided_by = _uid, decided_at = now(), decision_note = _note
  WHERE id = _id;
  PERFORM public.portal_notify(_company, _req.contact_id, 'Bank details verified',
    'The organisation verified the bank details. They are not used to move money automatically.');
  PERFORM public.portal_audit(_company, _uid, 'portal.bank.approve', 'contact', _req.contact_id,
    jsonb_build_object('request_id', _id));
  RETURN jsonb_build_object('status', 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_files(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
BEGIN
  IF NULLIF(payload->>'membership_id', '') IS NOT NULL THEN
    _m := public.portal_require_member((payload->>'membership_id')::UUID);
    _company := _m.company_id;
    _contact := _m.contact_id;
  ELSIF auth.uid() IS NULL OR NOT (
    public.has_company_permission(_company, 'sales.view')
    OR public.has_company_permission(_company, 'purchases.view')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view these files';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(f)) FROM (
      SELECT id, file_name, mime_type, byte_size, category, uploader_role, created_at, submission_id
      FROM public.portal_files
      WHERE company_id = _company AND contact_id = _contact
      ORDER BY created_at DESC
      LIMIT 100
    ) f
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_upload_file(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
  _role TEXT;
  _mime TEXT := payload->>'mime_type';
  _name TEXT := left(regexp_replace(COALESCE(payload->>'file_name', 'document'), '[\\/]+', '', 'g'), 180);
  _category TEXT := COALESCE(payload->>'category', 'general');
  _bytes BYTEA;
  _id UUID;
BEGIN
  IF NULLIF(payload->>'membership_id', '') IS NOT NULL THEN
    _m := public.portal_require_member((payload->>'membership_id')::UUID);
    _company := _m.company_id;
    _contact := _m.contact_id;
    _role := _m.portal_role;
    PERFORM public.portal_rate_limit('file:' || auth.uid()::TEXT, 20, INTERVAL '15 minutes');
  ELSE
    IF auth.uid() IS NULL OR NOT (
      public.has_company_permission(_company, 'sales.draft')
      OR public.has_company_permission(_company, 'purchases.draft')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to add a portal file';
    END IF;
    _role := 'staff';
    PERFORM public.portal_assert_writable(_company);
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts WHERE id = _contact AND company_id = _company
    ) THEN
      RAISE EXCEPTION 'Contact not found';
    END IF;
  END IF;
  IF NULLIF(payload->>'submission_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portal_supplier_submissions
    WHERE id = (payload->>'submission_id')::UUID AND company_id = _company AND contact_id = _contact
  ) THEN
    RAISE EXCEPTION 'That submission was not found';
  END IF;
  IF _category NOT IN ('general', 'tax', 'supporting', 'invoice_query') THEN
    RAISE EXCEPTION 'Choose a file category';
  END IF;
  BEGIN
    _bytes := decode(regexp_replace(COALESCE(payload->>'content_base64', ''), '\s', '', 'g'), 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'The file could not be read';
  END;
  IF octet_length(_bytes) < 1 OR octet_length(_bytes) > 5000000 THEN
    RAISE EXCEPTION 'Files must be between 1 byte and 5 MB';
  END IF;
  IF NOT public.portal_file_is_valid(_bytes, _mime) THEN
    RAISE EXCEPTION 'Upload a PDF, PNG, JPEG, or WebP file';
  END IF;
  INSERT INTO public.portal_files (
    company_id, contact_id, uploaded_by, uploader_role, category, file_name, mime_type,
    byte_size, content, submission_id
  ) VALUES (
    _company, _contact, auth.uid(), _role, _category, COALESCE(NULLIF(_name, ''), 'document'), _mime,
    octet_length(_bytes), _bytes, NULLIF(payload->>'submission_id', '')::UUID
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('file_id', _id, 'byte_size', octet_length(_bytes));
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_download_file(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _file public.portal_files%ROWTYPE;
BEGIN
  SELECT * INTO _file FROM public.portal_files WHERE id = NULLIF(payload->>'file_id', '')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'File not found'; END IF;
  IF NULLIF(payload->>'membership_id', '') IS NOT NULL THEN
    _m := public.portal_require_member((payload->>'membership_id')::UUID);
    IF _file.company_id IS DISTINCT FROM _m.company_id OR _file.contact_id IS DISTINCT FROM _m.contact_id THEN
      RAISE EXCEPTION 'File not found';
    END IF;
  ELSIF auth.uid() IS NULL OR _file.company_id IS DISTINCT FROM _company OR NOT (
    public.has_company_permission(_company, 'sales.view')
    OR public.has_company_permission(_company, 'purchases.view')
  ) THEN
    RAISE EXCEPTION 'File not found';
  END IF;
  RETURN jsonb_build_object(
    'file_name', _file.file_name, 'mime_type', _file.mime_type,
    'content_base64', encode(_file.content, 'base64')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_messages(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
BEGIN
  IF NULLIF(payload->>'membership_id', '') IS NOT NULL THEN
    _m := public.portal_require_member((payload->>'membership_id')::UUID);
    _company := _m.company_id;
    _contact := _m.contact_id;
  ELSIF auth.uid() IS NULL OR NOT (
    public.has_company_permission(_company, 'sales.view')
    OR public.has_company_permission(_company, 'purchases.view')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view these messages';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(msg)) FROM (
      SELECT id, author_role, body, invoice_id, submission_id, created_at
      FROM public.portal_messages
      WHERE company_id = _company AND contact_id = _contact
      ORDER BY created_at
      LIMIT 200
    ) msg
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_post_message(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
  _role TEXT;
  _body TEXT := btrim(COALESCE(payload->>'body', ''));
  _invoice UUID := NULLIF(payload->>'invoice_id', '')::UUID;
  _id UUID;
BEGIN
  IF length(_body) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Enter a message of 1–4000 characters'; END IF;
  IF NULLIF(payload->>'membership_id', '') IS NOT NULL THEN
    _m := public.portal_require_member((payload->>'membership_id')::UUID);
    _company := _m.company_id;
    _contact := _m.contact_id;
    _role := _m.portal_role;
    PERFORM public.portal_rate_limit('msg:' || auth.uid()::TEXT, 30, INTERVAL '15 minutes');
  ELSE
    IF auth.uid() IS NULL OR NOT (
      public.has_company_permission(_company, 'sales.draft')
      OR public.has_company_permission(_company, 'purchases.draft')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to message this contact';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = _contact AND c.company_id = _company
    ) THEN
      RAISE EXCEPTION 'That contact is not in this organisation';
    END IF;
    _role := 'staff';
    PERFORM public.portal_assert_writable(_company);
    PERFORM public.portal_notify(_company, _contact, 'New message', left(_body, 180));
  END IF;
  IF _invoice IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales_invoices i
    WHERE i.id = _invoice AND i.company_id = _company AND i.contact_id = _contact
  ) THEN
    RAISE EXCEPTION 'That invoice does not belong to this contact';
  END IF;
  INSERT INTO public.portal_messages (company_id, contact_id, author_user_id, author_role, body, invoice_id)
  VALUES (_company, _contact, auth.uid(), _role, _body, _invoice)
  RETURNING id INTO _id;
  RETURN jsonb_build_object('message_id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_notifications(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF COALESCE((payload->>'mark_read')::BOOLEAN, false) THEN
    UPDATE public.portal_notifications SET read_at = now()
    WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND read_at IS NULL;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(n)) FROM (
      SELECT id, title, body, read_at, created_at
      FROM public.portal_notifications
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id
      ORDER BY created_at DESC
      LIMIT 50
    ) n
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.deliver_invoice_to_portal(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _invoice UUID := NULLIF(payload->>'invoice_id', '')::UUID;
  _inv public.sales_invoices%ROWTYPE;
  _email TEXT;
  _demo BOOLEAN;
BEGIN
  IF _uid IS NULL OR NOT public.has_company_permission(_company, 'sales.draft') THEN
    RAISE EXCEPTION 'You do not have permission to deliver invoices';
  END IF;
  IF NOT public.portal_enabled(_company) THEN RAISE EXCEPTION 'Turn on Portals before delivering invoices'; END IF;
  SELECT * INTO _inv FROM public.sales_invoices
  WHERE id = _invoice AND company_id = _company AND status::TEXT NOT IN ('draft', 'void');
  IF NOT FOUND THEN RAISE EXCEPTION 'Authorise the invoice before delivering it to the portal'; END IF;
  SELECT m.email INTO _email FROM public.portal_memberships m
  WHERE m.company_id = _company AND m.contact_id = _inv.contact_id
    AND m.portal_role = 'customer' AND m.status = 'active'
  ORDER BY m.accepted_at DESC NULLS LAST
  LIMIT 1;
  IF _email IS NULL THEN RAISE EXCEPTION 'This customer does not have an active portal login'; END IF;
  PERFORM public.portal_notify(
    _company, _inv.contact_id, 'New invoice',
    COALESCE(_inv.invoice_number, 'Invoice') || ' is ready to view in your portal.'
  );
  SELECT is_demo INTO _demo FROM public.companies WHERE id = _company;
  PERFORM public.portal_audit(_company, _uid, 'portal.invoice.deliver', 'sales_invoice', _invoice, '{}'::JSONB);
  RETURN jsonb_build_object(
    'email', _email, 'is_demo', COALESCE(_demo, false),
    'invoice_number', _inv.invoice_number, 'currency', _inv.currency_code,
    'total_minor', _inv.total_minor,
    'due_minor', _inv.total_minor - _inv.amount_paid_minor - _inv.amount_credited_minor,
    'company_name', (SELECT name FROM public.companies WHERE id = _company)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_portal_reminders(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _today DATE;
  _first INTEGER := 7;
  _repeat INTEGER := 14;
  _max INTEGER := 3;
  _inv RECORD;
  _count INTEGER;
  _last DATE;
  _sent JSONB := '[]'::JSONB;
  _demo BOOLEAN;
  _company_name TEXT;
BEGIN
  IF _uid IS NULL OR NOT public.has_company_permission(_company, 'sales.draft') THEN
    RAISE EXCEPTION 'You do not have permission to send reminders';
  END IF;
  IF NOT public.portal_enabled(_company) THEN RAISE EXCEPTION 'Turn on Portals before sending reminders'; END IF;
  _today := public.portal_company_today(_company);
  SELECT first_after_days, repeat_every_days, max_reminders
    INTO _first, _repeat, _max
  FROM public.company_reminder_settings WHERE company_id = _company;
  _first := COALESCE(_first, 7);
  _repeat := COALESCE(_repeat, 14);
  _max := COALESCE(_max, 3);
  SELECT name, is_demo INTO _company_name, _demo FROM public.companies WHERE id = _company;

  FOR _inv IN
    SELECT i.id, i.invoice_number, i.currency_code, i.due_date,
      (i.total_minor - i.amount_paid_minor - i.amount_credited_minor) AS due_minor,
      m.email
    FROM public.sales_invoices i
    JOIN public.portal_memberships m
      ON m.company_id = i.company_id AND m.contact_id = i.contact_id
     AND m.portal_role = 'customer' AND m.status = 'active'
    WHERE i.company_id = _company AND i.status IN ('authorised', 'partly_paid')
      AND i.due_date <= _today - _first
    ORDER BY i.due_date
    LIMIT 50
  LOOP
    SELECT count(*), max(sent_on) INTO _count, _last
    FROM public.portal_reminder_log WHERE invoice_id = _inv.id;
    IF _count >= _max THEN CONTINUE; END IF;
    IF _last IS NOT NULL AND _last > _today - _repeat THEN CONTINUE; END IF;
    INSERT INTO public.portal_reminder_log (company_id, invoice_id, sent_on)
    VALUES (_company, _inv.id, _today)
    ON CONFLICT (invoice_id, sent_on) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM public.portal_notify(
      _company, (
        SELECT contact_id FROM public.sales_invoices WHERE id = _inv.id
      ),
      'Payment reminder',
      COALESCE(_inv.invoice_number, 'Invoice') || ' is overdue.'
    );
    _sent := _sent || jsonb_build_array(jsonb_build_object(
      'invoice_id', _inv.id, 'invoice_number', _inv.invoice_number, 'email', _inv.email,
      'currency', _inv.currency_code, 'due_minor', _inv.due_minor
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'reminders', _sent, 'is_demo', COALESCE(_demo, false), 'company_name', _company_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_alerts(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'sales.view') THEN
    RAISE EXCEPTION 'You do not have permission to view payment alerts';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(a)) FROM (
      SELECT al.id, al.message, al.created_at, al.intent_id, i.amount_minor, i.currency_code, i.status, i.receipt_id
      FROM public.portal_staff_alerts al
      LEFT JOIN public.portal_payment_intents i ON i.id = al.intent_id
      WHERE al.company_id = _company AND al.resolved_at IS NULL
      ORDER BY al.created_at DESC
      LIMIT 100
    ) a
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_resolve_alert(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _id UUID := NULLIF(payload->>'alert_id', '')::UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'sales.payment') THEN
    RAISE EXCEPTION 'You do not have permission to resolve payment alerts';
  END IF;
  UPDATE public.portal_staff_alerts
  SET resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _id AND company_id = _company AND resolved_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert was not found'; END IF;
  RETURN jsonb_build_object('resolved', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_file_is_valid(BYTEA, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_submit_supplier_document(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_supplier_workspace(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_acknowledge_order(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_request_bank_change(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_portal_submissions(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_decide_portal_submission(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_bank_requests(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_decide_bank_request(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_files(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_upload_file(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_download_file(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_messages(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_post_message(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_notifications(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deliver_invoice_to_portal(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_portal_reminders(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_alerts(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_resolve_alert(JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.portal_submit_supplier_document(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_supplier_workspace(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_acknowledge_order(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_request_bank_change(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_portal_submissions(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_decide_portal_submission(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_bank_requests(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_decide_bank_request(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_files(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_upload_file(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_download_file(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_messages(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_post_message(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_notifications(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_invoice_to_portal(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_portal_reminders(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_alerts(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_resolve_alert(JSONB) TO authenticated;
