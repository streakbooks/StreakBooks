-- Purchase-order goods receipt foundation (non-posting).
-- Original LinkBooks workflow: track received quantities and set partially_received.
-- Does not post journals; authorised bills remain the posting path.

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(18, 6) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_qty_received_nonneg'
  ) THEN
    ALTER TABLE public.purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_qty_received_nonneg CHECK (quantity_received >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_qty_received_lte_ordered'
  ) THEN
    ALTER TABLE public.purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_qty_received_lte_ordered CHECK (quantity_received <= quantity);
  END IF;
END $$;

COMMENT ON COLUMN public.purchase_order_lines.quantity_received IS
  'Cumulative goods received against the ordered quantity. Operational only; does not post to the ledger.';

-- Allow bill conversion after goods have been received.
CREATE OR REPLACE FUNCTION private.convert_purchase_order_atomic(_company uuid, _order uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.purchase_orders;
  bill uuid;
  terms integer;
  lines jsonb;
  c jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'purchases.draft') THEN
    RAISE EXCEPTION 'Purchase access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text || ':workflow-reset', 0));
  SELECT * INTO o FROM public.purchase_orders WHERE company_id = _company AND id = _order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF o.billed_bill_id IS NOT NULL THEN RETURN jsonb_build_object('billId', o.billed_bill_id); END IF;
  IF o.status NOT IN ('draft', 'sent', 'partially_received') THEN
    RAISE EXCEPTION 'This order cannot be converted';
  END IF;
  SELECT jsonb_agg(
    jsonb_build_object(
      'description', description,
      'accountId', account_id,
      'quantity', quantity,
      'unitPriceMinor', unit_price_minor,
      'discountMinor', trunc(quantity * unit_price_minor) - net_minor,
      'taxRateBps', tax_rate_bps
    )
    ORDER BY line_no
  )
  INTO lines
  FROM public.purchase_order_lines
  WHERE company_id = _company AND order_id = _order;
  c := private.workflow_order_lines(_company, lines);
  IF (c->>'subtotal_minor')::bigint <> o.subtotal_minor OR (c->>'tax_minor')::bigint <> o.tax_minor THEN
    RAISE EXCEPTION 'Order totals are inconsistent; correct the draft before conversion';
  END IF;
  SELECT greatest(0, coalesce(payment_terms_days, 30)) INTO terms
  FROM public.contacts WHERE company_id = _company AND id = o.contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
  INSERT INTO public.purchase_bills (
    company_id, contact_id, bill_number, bill_date, due_date, payment_terms_days, tax_calculation,
    currency_code, memo, status, subtotal_minor, tax_minor, total_minor, purchase_order_id, created_by
  )
  VALUES (
    _company, o.contact_id, public.allocate_document_number(_company, 'purchase_bill'), o.order_date,
    o.order_date + terms, terms, 'exclusive', o.currency_code,
    coalesce(o.memo, 'From purchase order ' || o.order_number), 'draft',
    o.subtotal_minor, o.tax_minor, o.total_minor, o.id, auth.uid()
  )
  RETURNING id INTO bill;
  INSERT INTO public.purchase_bill_lines (
    company_id, bill_id, line_no, description, account_id, quantity, unit_price_minor,
    discount_minor, tax_rate_bps, net_minor, tax_minor
  )
  SELECT
    _company, bill, n::integer, l->>'description', (l->>'account_id')::uuid, (l->>'quantity')::numeric,
    (l->>'unit_price_minor')::bigint, (l->>'discount_minor')::bigint, (l->>'tax_rate_bps')::integer,
    (l->>'net_minor')::bigint, (l->>'tax_minor')::bigint
  FROM jsonb_array_elements(c->'lines') WITH ORDINALITY x(l, n);
  UPDATE public.purchase_orders
  SET billed_bill_id = bill, status = 'billed', version = version + 1, updated_at = now()
  WHERE company_id = _company AND id = _order;
  PERFORM public.record_audit_event(
    _company, 'purchase_order_converted', 'purchase_order', _order, jsonb_build_object('bill_id', bill)
  );
  RETURN jsonb_build_object('billId', bill);
END $$;

CREATE OR REPLACE FUNCTION public.convert_purchase_order_atomic(_company uuid, _order uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.convert_purchase_order_atomic(_company, _order)
$$;

-- Receive goods against ordered lines (cumulative quantity_received).
CREATE OR REPLACE FUNCTION private.receive_purchase_order_goods(_company uuid, _order uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.purchase_orders;
  item jsonb;
  line_id uuid;
  qty numeric;
  ordered numeric;
  already numeric;
  updated integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'purchases.draft') THEN
    RAISE EXCEPTION 'Purchase access denied' USING ERRCODE = '42501';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload->'lines') <> 'array' OR jsonb_array_length(_payload->'lines') < 1 THEN
    RAISE EXCEPTION 'Add at least one receipt quantity';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text || ':workflow-reset', 0));
  SELECT * INTO o FROM public.purchase_orders WHERE company_id = _company AND id = _order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF o.billed_bill_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order is already billed and cannot receive more goods';
  END IF;
  IF o.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'Receive goods only on sent or partially received purchase orders';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_payload->'lines')
  LOOP
    line_id := nullif(item->>'lineId', '')::uuid;
    qty := nullif(item->>'receiveQuantity', '')::numeric;
    IF line_id IS NULL OR qty IS NULL OR qty <= 0 OR qty <> round(qty, 6) THEN
      RAISE EXCEPTION 'Enter a positive receipt quantity with up to six decimal places';
    END IF;
    SELECT quantity, quantity_received INTO ordered, already
    FROM public.purchase_order_lines
    WHERE company_id = _company AND order_id = _order AND id = line_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line does not belong to this purchase order'; END IF;
    IF already + qty > ordered THEN
      RAISE EXCEPTION 'Cannot receive more than the outstanding ordered quantity';
    END IF;
    UPDATE public.purchase_order_lines
    SET quantity_received = quantity_received + qty
    WHERE company_id = _company AND order_id = _order AND id = line_id;
    updated := updated + 1;
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'partially_received', version = version + 1, updated_at = now()
  WHERE company_id = _company AND id = _order;

  PERFORM public.record_audit_event(
    _company,
    'purchase_order_goods_received',
    'purchase_order',
    _order,
    jsonb_build_object('lines', _payload->'lines', 'updated', updated, 'posts', false)
  );

  RETURN jsonb_build_object('id', _order, 'status', 'partially_received', 'updated', updated);
END $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_goods(_company uuid, _order uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.receive_purchase_order_goods(_company, _order, _payload)
$$;

REVOKE ALL ON FUNCTION private.convert_purchase_order_atomic(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_purchase_order_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.convert_purchase_order_atomic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_purchase_order_atomic(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.receive_purchase_order_goods(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order_goods(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.receive_purchase_order_goods(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid, uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
