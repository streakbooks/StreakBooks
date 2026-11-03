-- Durable source history. No posted journals, paid counters or allocations are rewritten.
CREATE TABLE public.cash_allocation_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 source_table text NOT NULL CHECK (source_table IN ('supplier_payment_allocations','money_document_credit_uses')),
 allocation_id uuid NOT NULL,
 operation text NOT NULL CHECK (operation IN ('UPDATE','DELETE')),
 source_row jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE INDEX cash_allocation_history_company_idx
 ON public.cash_allocation_history(company_id, source_table, allocation_id);
ALTER TABLE public.cash_allocation_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_allocation_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cash_allocation_history TO authenticated;
CREATE POLICY cash_allocation_history_read ON public.cash_allocation_history
 FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- Only table triggers can write the archive. The caller must already be authorised
-- to change the source row; the trigger does not grant source-table write access.
CREATE FUNCTION private.archive_cash_allocation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN
  ('supplier_payment_allocations','money_document_credit_uses') THEN
  RAISE EXCEPTION 'Invalid cash history source';
 END IF;
 IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
 -- Organisation deletion intentionally removes its entire archive as well.
 IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 -- JSON numbers must not lose bigint precision in the Data API.
 snapshot := to_jsonb(OLD) || jsonb_build_object('amount_minor', OLD.amount_minor::text);
 INSERT INTO public.cash_allocation_history(company_id,source_table,allocation_id,operation,source_row)
 VALUES (OLD.company_id,TG_TABLE_NAME,OLD.id,TG_OP,snapshot);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.archive_cash_allocation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER cash_archive_supplier_allocation BEFORE UPDATE OR DELETE
 ON public.supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION private.archive_cash_allocation();
CREATE TRIGGER cash_archive_refund_use BEFORE UPDATE OR DELETE
 ON public.money_document_credit_uses FOR EACH ROW EXECUTE FUNCTION private.archive_cash_allocation();
COMMENT ON TABLE public.cash_allocation_history IS
 'Exact allocation rows archived from installation onward. Previously deleted rows are not reconstructed. UPDATE history requires explicit reallocation recognition before cash reporting.';
