-- Firm-owned client portfolio metadata. Does not modify company books or access grants.
create table public.firm_client_profiles (
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'active'
    check (status in ('onboarding','active','on_hold','offboarding','archived')),
  primary_contact_name text not null default '' check (char_length(primary_contact_name) <= 120),
  primary_contact_email text not null default '' check (char_length(primary_contact_email) <= 254),
  industry text not null default '' check (char_length(industry) <= 100),
  service_line text not null default '' check (char_length(service_line) <= 120),
  notes text not null default '' check (char_length(notes) <= 3000),
  tags text[] not null default '{}'::text[]
    check (cardinality(tags) <= 12),
  next_review_date date,
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (firm_id,company_id)
);

create index firm_client_profiles_status_idx
  on public.firm_client_profiles (firm_id,status,company_id);

alter table public.firm_client_profiles enable row level security;
revoke all on public.firm_client_profiles from public,anon;
grant select,insert,update on public.firm_client_profiles to authenticated;

-- Profile content belongs to the practice but may be seen only by members
-- who also retain effective accounting.view access to the linked company.
create policy "Firm portfolio readable by authorised client members"
on public.firm_client_profiles for select to authenticated
using (
  public.is_firm_member(firm_id)
  and public.has_company_permission(company_id,'accounting.view')
  and exists (
    select 1 from public.firm_client_links l
    where l.firm_id=firm_client_profiles.firm_id
      and l.company_id=firm_client_profiles.company_id
      and l.revoked_at is null
  )
);

create policy "Firm admins create authorised client profiles"
on public.firm_client_profiles for insert to authenticated
with check (
  public.is_firm_admin(firm_id)
  and public.has_company_permission(company_id,'accounting.view')
  and updated_by=auth.uid()
  and exists (
    select 1 from public.firm_client_links l
    where l.firm_id=firm_client_profiles.firm_id
      and l.company_id=firm_client_profiles.company_id
      and l.revoked_at is null
  )
);

create policy "Firm admins update authorised client profiles"
on public.firm_client_profiles for update to authenticated
using (
  public.is_firm_admin(firm_id)
  and public.has_company_permission(company_id,'accounting.view')
  and exists (
    select 1 from public.firm_client_links l
    where l.firm_id=firm_client_profiles.firm_id
      and l.company_id=firm_client_profiles.company_id
      and l.revoked_at is null
  )
)
with check (
  public.is_firm_admin(firm_id)
  and public.has_company_permission(company_id,'accounting.view')
  and updated_by=auth.uid()
  and exists (
    select 1 from public.firm_client_links l
    where l.firm_id=firm_client_profiles.firm_id
      and l.company_id=firm_client_profiles.company_id
      and l.revoked_at is null
  )
);

-- Deliberately no DELETE grant/policy: practice archival is a status, and
-- revoking a client link does not destroy historical practice metadata.
