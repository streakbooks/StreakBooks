-- CRM-08: enforce opportunity.quote_id references Sales quotes (link only; no GL).
ALTER TABLE public.crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_quote_fkey;
ALTER TABLE public.crm_opportunities
  ADD CONSTRAINT crm_opportunities_quote_fkey
  FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_opportunities_quote_idx
  ON public.crm_opportunities (company_id, quote_id)
  WHERE quote_id IS NOT NULL;
