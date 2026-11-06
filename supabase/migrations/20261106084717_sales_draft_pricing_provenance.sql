-- Batch 9: atomic pricing provenance for user-saved invoice and quote drafts.
-- Does not reprice, recompute amounts, modify posted accounting, or change existing save RPC.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS price_list_id uuid,
  ADD COLUMN IF NOT EXISTS price_list_name_snapshot text;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS price_list_id uuid,
  ADD COLUMN IF NOT EXISTS price_list_name_snapshot text;
ALTER TABLE public.sales_invoice_lines
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb;
ALTER TABLE public.sales_quote_lines
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb;

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT sales_invoices_price_list_company_fk
  FOREIGN KEY (company_id, price_list_id)
  REFERENCES public.product_price_lists(company_id, id);
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT sales_quotes_price_list_company_fk
  FOREIGN KEY (company_id, price_list_id)
  REFERENCES public.product_price_lists(company_id, id);

ALTER TABLE public.sales_invoice_lines
  ADD CONSTRAINT sales_invoice_lines_pricing_object_ck
  CHECK (pricing_snapshot IS NULL OR jsonb_typeof(pricing_snapshot) = 'object');
ALTER TABLE public.sales_quote_lines
  ADD CONSTRAINT sales_quote_lines_pricing_object_ck
  CHECK (pricing_snapshot IS NULL OR jsonb_typeof(pricing_snapshot) = 'object');

COMMENT ON COLUMN public.sales_invoice_lines.pricing_snapshot IS
  'Immutable source-at-application metadata; amount itself is stored in unit_price_minor.';
COMMENT ON COLUMN public.sales_quote_lines.pricing_snapshot IS
  'Source-at-application metadata; changing a quote draft replaces its line snapshots.';

-- All legacy saves update memo/date/totals and replace lines; clear the header label when
-- those paths are used. Status-only transitions (authorise, send, accept) preserve history.
CREATE OR REPLACE FUNCTION public.clear_sales_pricing_on_content_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.price_list_id := NULL;
  NEW.price_list_name_snapshot := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_invoice_clear_old_pricing ON public.sales_invoices;
CREATE TRIGGER sales_invoice_clear_old_pricing
  BEFORE UPDATE OF contact_id, memo, invoice_date, due_date,
    subtotal_minor, tax_minor, total_minor, currency_code
  ON public.sales_invoices
  FOR EACH ROW WHEN (OLD.status = 'draft')
  EXECUTE FUNCTION public.clear_sales_pricing_on_content_update();

DROP TRIGGER IF EXISTS sales_quote_clear_old_pricing ON public.sales_quotes;
CREATE TRIGGER sales_quote_clear_old_pricing
  BEFORE UPDATE OF contact_id, memo, quote_date, expiry_date,
    subtotal_minor, tax_minor, total_minor, currency_code
  ON public.sales_quotes
  FOR EACH ROW WHEN (OLD.status NOT IN ('converted', 'void'))
  EXECUTE FUNCTION public.clear_sales_pricing_on_content_update();

-- The existing save RPC validates accounting lines, records numbers and writes
-- headers/lines in a single transaction. Calling it inside this wrapper retains
-- that transaction boundary. A failed metadata write rolls back the core save.
CREATE OR REPLACE FUNCTION public.save_sales_document_draft_priced(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _company uuid;
  _kind text;
  _currency text;
  _pricing jsonb;
  _snapshots jsonb;
  _line jsonb;
  _trace jsonb;
  _list_id uuid;
  _list_name text;
  _list_currency text;
  _list_active boolean;
  _saved jsonb;
  _saved_id uuid;
  _i integer := 0;
  _n integer;
  _rows integer;
  _source text;
  _discount integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  _kind := payload->>'kind';
  IF _kind NOT IN ('invoice', 'quote') OR _kind IS NULL THEN
    RAISE EXCEPTION 'Pricing provenance is supported only for invoices and quotes';
  END IF;
  _company := NULLIF(payload->>'company_id', '')::uuid;
  IF _company IS NULL OR NOT public.has_company_permission(_company, 'sales.draft') THEN
    RAISE EXCEPTION 'Missing permission to save sales drafts';
  END IF;
  _pricing := payload->'pricing';
  IF _pricing IS NULL OR jsonb_typeof(_pricing) <> 'object' THEN
    RAISE EXCEPTION 'Pricing metadata object is required for priced draft saves';
  END IF;
  _snapshots := _pricing->'lines';
  IF _snapshots IS NULL OR jsonb_typeof(_snapshots) <> 'array'
    OR jsonb_array_length(_snapshots) <> jsonb_array_length(payload->'lines') THEN
    RAISE EXCEPTION 'Pricing snapshots must match document line count';
  END IF;
  _currency := upper(COALESCE(NULLIF(payload->>'currency_code', ''), ''));
  _list_id := NULLIF(_pricing->>'price_list_id', '')::uuid;
  IF _list_id IS NOT NULL THEN
    SELECT pl.name, pl.currency_code, pl.is_active
      INTO _list_name, _list_currency, _list_active
    FROM public.product_price_lists pl
    WHERE pl.id = _list_id AND pl.company_id = _company;
    IF NOT FOUND OR NOT _list_active OR _list_currency <> _currency THEN
      RAISE EXCEPTION 'Selected price list is not active in the document currency and organisation';
    END IF;
  END IF;

  FOR _trace, _line IN
    SELECT t.value, l.value
    FROM jsonb_array_elements(_snapshots) WITH ORDINALITY t(value, pos)
    JOIN jsonb_array_elements(payload->'lines') WITH ORDINALITY l(value, pos)
      ON t.pos = l.pos
    ORDER BY t.pos
  LOOP
    IF jsonb_typeof(_trace) = 'null' THEN CONTINUE; END IF;
    IF jsonb_typeof(_trace) <> 'object' THEN
      RAISE EXCEPTION 'Pricing line snapshot must be an object or null';
    END IF;
    _source := _trace->>'source';
    IF _source <> 'price_list' OR _source IS NULL OR _list_id IS NULL OR
      NULLIF(_trace->>'price_list_id', '')::uuid IS DISTINCT FROM _list_id OR
      NULLIF(_line->>'product_id', '')::uuid IS DISTINCT FROM
        NULLIF(_trace->>'product_id', '')::uuid OR
      (_trace->>'unit_price_minor')::bigint IS DISTINCT FROM
        (_line->>'unit_price_minor')::bigint OR
      _trace->>'currency_code' IS DISTINCT FROM _currency OR
      _trace->>'quantity' IS DISTINCT FROM _line->>'quantity' OR
      _trace->>'basis' NOT IN ('tier', 'fixed', 'catalogue') OR
      _trace->>'basis' IS NULL
    THEN
      RAISE EXCEPTION 'Pricing snapshot does not match the saved line/list';
    END IF;
    _discount := (_trace->>'discount_bps')::integer;
    IF _discount IS NULL OR _discount < 0 OR _discount > 10000 THEN
      RAISE EXCEPTION 'Pricing snapshot discount basis points are invalid';
    END IF;
    IF (_trace->>'pricing_date') IS NULL OR
      (_trace->>'pricing_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Pricing snapshot date is invalid';
    END IF;
  END LOOP;

  _saved := public.save_sales_document_draft(payload - 'pricing');
  _saved_id := (_saved->>'id')::uuid;
  IF _saved_id IS NULL THEN RAISE EXCEPTION 'Draft save did not return an ID'; END IF;

  IF _kind = 'invoice' THEN
    UPDATE public.sales_invoices
    SET price_list_id = _list_id, price_list_name_snapshot = _list_name
    WHERE company_id = _company AND id = _saved_id;
  ELSE
    UPDATE public.sales_quotes
    SET price_list_id = _list_id, price_list_name_snapshot = _list_name
    WHERE company_id = _company AND id = _saved_id;
  END IF;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN RAISE EXCEPTION 'Pricing header snapshot could not be recorded'; END IF;

  FOR _trace IN SELECT value FROM jsonb_array_elements(_snapshots)
  LOOP
    _i := _i + 1;
    IF _kind = 'invoice' THEN
      UPDATE public.sales_invoice_lines
      SET pricing_snapshot = CASE WHEN jsonb_typeof(_trace) = 'null' THEN NULL ELSE _trace END
      WHERE company_id = _company AND invoice_id = _saved_id AND line_order = _i;
    ELSE
      UPDATE public.sales_quote_lines
      SET pricing_snapshot = CASE WHEN jsonb_typeof(_trace) = 'null' THEN NULL ELSE _trace END
      WHERE company_id = _company AND quote_id = _saved_id AND line_order = _i;
    END IF;
    GET DIAGNOSTICS _rows = ROW_COUNT;
    IF _rows <> 1 THEN
      RAISE EXCEPTION 'Pricing snapshot missing for saved line %', _i;
    END IF;
  END LOOP;
  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_sales_document_draft_priced(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_document_draft_priced(jsonb) TO authenticated;
