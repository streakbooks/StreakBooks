-- Performance follow-up to the Firm & Clients practice workflows.
-- Covers reverse FK lookup paths without changing tenant or permission semantics.
create index firm_client_profiles_company_idx
  on public.firm_client_profiles(company_id,firm_id);
create index firm_engagements_company_idx
  on public.firm_engagements(company_id,firm_id);
create index firm_client_onboarding_completed_by_idx
  on public.firm_client_onboarding_steps(completed_by)
  where completed_by is not null;

-- auth.uid() is statement-stable; evaluate it once per statement for bulk operations.
alter policy "Firm admins create authorised client profiles"
on public.firm_client_profiles
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_profiles.firm_id
      and l.company_id=firm_client_profiles.company_id
      and l.revoked_at is null)
);

alter policy "Firm admins update authorised client profiles"
on public.firm_client_profiles
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_profiles.firm_id
      and l.company_id=firm_client_profiles.company_id
      and l.revoked_at is null)
);

alter policy firm_onboarding_insert on public.firm_client_onboarding_steps
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_onboarding_steps.firm_id
      and l.company_id=firm_client_onboarding_steps.company_id
      and l.revoked_at is null)
);

alter policy firm_onboarding_update on public.firm_client_onboarding_steps
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_onboarding_steps.firm_id
      and l.company_id=firm_client_onboarding_steps.company_id
      and l.revoked_at is null)
);

alter policy firm_engagements_insert on public.firm_engagements
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  created_by=(select auth.uid()) and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_engagements.firm_id
      and l.company_id=firm_engagements.company_id
      and l.revoked_at is null)
);

alter policy firm_engagements_update on public.firm_engagements
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_engagements.firm_id
      and l.company_id=firm_engagements.company_id
      and l.revoked_at is null)
);
