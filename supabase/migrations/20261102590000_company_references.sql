-- READY-TO-APPLY. Not applied. Stored platform rows must name a business that exists.
-- Removing a business does not cascade into these rows.
-- Reverse:
--   ALTER TABLE public.break_glass_events DROP CONSTRAINT break_glass_events_company_fk;
--   ALTER TABLE public.company_closure_requests DROP CONSTRAINT company_closure_requests_company_fk;
--   ALTER TABLE public.platform_segment_members DROP CONSTRAINT platform_segment_members_company_fk;
--   ALTER TABLE public.billing_provider_fees DROP CONSTRAINT billing_provider_fees_company_fk;
--   ALTER TABLE public.billing_lifetime_payments DROP CONSTRAINT billing_lifetime_payments_company_fk;
--   ALTER TABLE public.billing_usage_drafts DROP CONSTRAINT billing_usage_drafts_company_fk;
--   ALTER TABLE public.billing_provider_reconciliations DROP CONSTRAINT billing_provider_reconciliations_company_fk;
--   ALTER TABLE public.billing_prorations DROP CONSTRAINT billing_prorations_company_fk;

ALTER TABLE public.billing_prorations
  ADD CONSTRAINT billing_prorations_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.billing_provider_reconciliations
  ADD CONSTRAINT billing_provider_reconciliations_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.billing_usage_drafts
  ADD CONSTRAINT billing_usage_drafts_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.billing_lifetime_payments
  ADD CONSTRAINT billing_lifetime_payments_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.billing_provider_fees
  ADD CONSTRAINT billing_provider_fees_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.platform_segment_members
  ADD CONSTRAINT platform_segment_members_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.company_closure_requests
  ADD CONSTRAINT company_closure_requests_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE public.break_glass_events
  ADD CONSTRAINT break_glass_events_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
