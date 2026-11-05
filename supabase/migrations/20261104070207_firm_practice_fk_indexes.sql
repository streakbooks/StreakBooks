-- FK coverage for cascading company/firm operations on practice tracking data.
create index firm_client_assignments_company_fk_idx
  on public.firm_client_assignments(company_id);
create index firm_client_assignments_updated_by_fk_idx
  on public.firm_client_assignments(updated_by);
create index firm_document_request_tracking_company_fk_idx
  on public.firm_document_request_tracking(company_id);
create index firm_document_request_tracking_created_by_fk_idx
  on public.firm_document_request_tracking(created_by);
create index firm_engagement_invoice_links_company_fk_idx
  on public.firm_engagement_invoice_links(company_id);
create index firm_engagement_invoice_links_created_by_fk_idx
  on public.firm_engagement_invoice_links(created_by);
create index firm_engagement_invoice_links_firm_fk_idx
  on public.firm_engagement_invoice_links(firm_id);
create index firm_engagement_invoice_links_invoice_fk_idx
  on public.firm_engagement_invoice_links(invoice_id);
