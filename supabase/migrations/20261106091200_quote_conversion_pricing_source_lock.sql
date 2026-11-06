-- Guard against a quote changing between source metadata read and atomic conversion.
-- Re-entrant row lock: the existing conversion RPC locks the same quote in this txn.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.save_sales_document_from_quote_priced(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _company_id uuid;
  _quote_id uuid;
  _invoice_id uuid;
  _quote record;
  _saved jsonb;
  _currency text;
  _copied integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  _company_id := NULLIF(payload->>'company_id', '')::uuid;
  IF _company_id IS NULL OR NOT public.has_company_permission(_company_id, 'sales.draft') THEN
    RAISE EXCEPTION 'Missing permission to convert quote';
  END IF;
  IF payload->>'kind' IS DISTINCT FROM 'invoice'
    OR NULLIF(payload->>'id','') IS NOT NULL
    OR NULLIF(payload->>'quote_id','') IS NULL
    OR payload ? 'pricing'
  THEN
    RAISE EXCEPTION 'This save is only for new invoices converted from quotes';
  END IF;
  _quote_id := (payload->>'quote_id')::uuid;
  SELECT q.price_list_id, q.price_list_name_snapshot, q.currency_code,
         q.contact_id
    INTO _quote
    FROM public.sales_quotes q
   WHERE q.company_id = _company_id AND q.id = _quote_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source quote not found in organisation'; END IF;

  -- Original core RPC locks/validates the quote, saves the invoice, and marks the
  -- source converted. Any error below rolls back that transaction as well.
  _saved := public.save_sales_document_draft(payload);
  _invoice_id := (_saved->>'id')::uuid;
  IF _invoice_id IS NULL THEN
    RAISE EXCEPTION 'Quote conversion did not return an invoice';
  END IF;
  _currency := upper(payload->>'currency_code');

  -- Historical name is copied from the quote snapshot, not looked up from a
  -- subsequently renamed, archived or repriced catalogue entry.
  IF _quote.price_list_id IS NOT NULL
    AND _quote.currency_code = _currency
    AND _quote.contact_id = (payload->>'contact_id')::uuid
  THEN
    UPDATE public.sales_invoices
       SET price_list_id = _quote.price_list_id,
           price_list_name_snapshot = _quote.price_list_name_snapshot
     WHERE id = _invoice_id AND company_id = _company_id
       AND quote_id = _quote_id AND status = 'draft';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice source price list was not saved'; END IF;

    -- Exact-line compatibility is a hard precondition for copying a source claim.
    -- This does not invent discounts or change unit prices, tax, totals or journals.
    UPDATE public.sales_invoice_lines il
       SET pricing_snapshot = ql.pricing_snapshot
      FROM public.sales_quote_lines ql
     WHERE il.company_id = _company_id
       AND il.invoice_id = _invoice_id
       AND ql.company_id = _company_id
       AND ql.quote_id = _quote_id
       AND ql.line_order = il.line_order
       AND ql.product_id IS NOT NULL
       AND ql.product_id = il.product_id
       AND ql.quantity = il.quantity
       AND ql.unit_price_minor = il.unit_price_minor
       AND ql.pricing_snapshot IS NOT NULL
       AND ql.pricing_snapshot->>'source' = 'price_list'
       AND ql.pricing_snapshot->>'price_list_id' = _quote.price_list_id::text
       AND ql.pricing_snapshot->>'product_id' = il.product_id::text
       AND ql.pricing_snapshot->>'currency_code' = _currency
       AND (ql.pricing_snapshot->>'unit_price_minor')::bigint = il.unit_price_minor;
    GET DIAGNOSTICS _copied = ROW_COUNT;
  END IF;

  RETURN _saved || jsonb_build_object('pricing_snapshots_copied', _copied);
END;
$$;


