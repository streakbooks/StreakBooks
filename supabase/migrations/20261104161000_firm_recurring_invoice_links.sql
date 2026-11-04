-- Link a practice engagement to the existing recurring sales-invoice engine.
-- This table never posts ledger entries; existing Sales controls remain authoritative.
create table public.firm_engagement_recurring_links (
  engagement_id uuid not null references public.firm_engagements(id) on delete cascade,
  recurring_id uuid not null references public.sales_recurring_invoices(id) on delete restrict,
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  billing_company_id uuid not null references public.companies(id) on delete restrict,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (engagement_id,recurring_id),
  unique (billing_company_id,recurring_id),
  constraint billing_company_is_not_client check (billing_company_id<>company_id)
);
create index firm_engagement_recurring_portfolio_idx
 on public.firm_engagement_recurring_links(firm_id,company_id,engagement_id);
create index firm_engagement_recurring_created_by_idx
 on public.firm_engagement_recurring_links(created_by);
alter table public.firm_engagement_recurring_links enable row level security;
revoke all on public.firm_engagement_recurring_links from public,anon,authenticated;
grant select,insert,delete on public.firm_engagement_recurring_links to authenticated;

create policy firm_engagement_recurring_read
on public.firm_engagement_recurring_links for select to authenticated using (
 public.is_firm_member(firm_id)
 and public.has_company_permission(company_id,'accounting.view')
 and public.has_company_permission(billing_company_id,'sales.view')
 and exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_engagement_recurring_links.firm_id
      and l.company_id=firm_engagement_recurring_links.company_id and l.revoked_at is null)
 and exists(select 1 from public.firm_engagements e
    where e.id=firm_engagement_recurring_links.engagement_id
      and e.firm_id=firm_engagement_recurring_links.firm_id
      and e.company_id=firm_engagement_recurring_links.company_id)
 and exists(select 1 from public.sales_recurring_invoices r
    where r.id=firm_engagement_recurring_links.recurring_id
      and r.company_id=firm_engagement_recurring_links.billing_company_id)
);
create policy firm_engagement_recurring_insert
on public.firm_engagement_recurring_links for insert to authenticated with check (
 public.is_firm_admin(firm_id)
 and public.has_company_permission(company_id,'accounting.view')
 and public.has_company_permission(billing_company_id,'sales.draft')
 and created_by=(select auth.uid())
 and exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_engagement_recurring_links.firm_id
      and l.company_id=firm_engagement_recurring_links.company_id and l.revoked_at is null)
 and exists(select 1 from public.firm_engagements e
    where e.id=firm_engagement_recurring_links.engagement_id
      and e.firm_id=firm_engagement_recurring_links.firm_id
      and e.company_id=firm_engagement_recurring_links.company_id
      and e.status='active')
 and exists(select 1 from public.sales_recurring_invoices r
    where r.id=firm_engagement_recurring_links.recurring_id
      and r.company_id=firm_engagement_recurring_links.billing_company_id
      and r.is_active and not r.auto_authorise)
);
create policy firm_engagement_recurring_delete
on public.firm_engagement_recurring_links for delete to authenticated using (
 public.is_firm_admin(firm_id)
 and public.has_company_permission(company_id,'accounting.view')
 and public.has_company_permission(billing_company_id,'sales.draft')
 and exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_engagement_recurring_links.firm_id
      and l.company_id=firm_engagement_recurring_links.company_id and l.revoked_at is null)
);
create policy mfa_aal2_required on public.firm_engagement_recurring_links
as restrictive for all to authenticated
using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));
