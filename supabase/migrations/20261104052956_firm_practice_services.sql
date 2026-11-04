-- Firm-owned operational work. Never posts to the accounting ledger.
-- All reads require effective company permission in addition to firm membership.
-- Profile hardening: align with other practice tables' MFA policy.
create policy mfa_aal2_required on public.firm_client_profiles
  as restrictive for all to authenticated
  using ((select private.mfa_requirement_met()))
  with check ((select private.mfa_requirement_met()));

create table public.firm_client_onboarding_steps (
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  task_key text not null check (char_length(task_key) between 2 and 48),
  title text not null check (char_length(title) between 2 and 180),
  note text not null default '' check (char_length(note) <= 1000),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (firm_id,company_id,task_key),
  constraint completion_actor_coherent
    check ((completed_at is null and completed_by is null) or
           (completed_at is not null and completed_by is not null))
);
create index firm_client_onboarding_steps_company_idx
  on public.firm_client_onboarding_steps (company_id,firm_id);

create table public.firm_engagements (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 150),
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','cancelled')),
  frequency text not null default 'monthly'
    check (frequency in ('one_off','monthly','quarterly','annual')),
  start_date date not null,
  end_date date,
  agreed_fee numeric(14,2) check (agreed_fee is null or agreed_fee >= 0),
  currency_code text not null default ''
    check (currency_code ~ '^[A-Z]{3}$' or currency_code = ''),
  notes text not null default '' check (char_length(notes) <= 3000),
  version integer not null default 1 check (version > 0),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_date_order check (end_date is null or end_date >= start_date),
  constraint engagement_fee_currency check (
    (agreed_fee is null and currency_code = '') or
    (agreed_fee is not null and currency_code ~ '^[A-Z]{3}$')
  )
);
create index firm_engagements_portfolio_idx
  on public.firm_engagements (firm_id,company_id,status,start_date desc);

-- Keep stable identifiers and concurrency versions immutable to callers.
create function private.firm_practice_touch_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name = 'firm_engagements' then
    if new.id is distinct from old.id or new.firm_id is distinct from old.firm_id
       or new.company_id is distinct from old.company_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Engagement identity and creator are immutable' using errcode='42501';
    end if;
  else
    if new.firm_id is distinct from old.firm_id
       or new.company_id is distinct from old.company_id
       or new.task_key is distinct from old.task_key
       or new.created_at is distinct from old.created_at then
      raise exception 'Checklist identity is immutable' using errcode='42501';
    end if;
  end if;
  if new.updated_by is distinct from auth.uid() then
    raise exception 'Only the current actor can update practice records' using errcode='42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create trigger firm_client_onboarding_touch
before update on public.firm_client_onboarding_steps
for each row execute function private.firm_practice_touch_guard();

create trigger firm_engagements_touch
before update on public.firm_engagements
for each row execute function private.firm_practice_touch_guard();

revoke all on function private.firm_practice_touch_guard() from public, anon, authenticated;

alter table public.firm_client_onboarding_steps enable row level security;
alter table public.firm_engagements enable row level security;

revoke all on public.firm_client_onboarding_steps,public.firm_engagements from public,anon;
grant select,insert,update on public.firm_client_onboarding_steps,public.firm_engagements to authenticated;

-- SELECT: firm membership is not permission to access the company ledger.
create policy firm_onboarding_read on public.firm_client_onboarding_steps
for select to authenticated using (
  public.is_firm_member(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_onboarding_steps.firm_id
      and l.company_id=firm_client_onboarding_steps.company_id
      and l.revoked_at is null)
);
create policy firm_engagements_read on public.firm_engagements
for select to authenticated using (
  public.is_firm_member(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_engagements.firm_id
      and l.company_id=firm_engagements.company_id
      and l.revoked_at is null)
);

-- Operational writes: only firm administrators with authorized active client links.
create policy firm_onboarding_insert on public.firm_client_onboarding_steps
for insert to authenticated with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=auth.uid() and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_onboarding_steps.firm_id
      and l.company_id=firm_client_onboarding_steps.company_id
      and l.revoked_at is null)
);
create policy firm_engagements_insert on public.firm_engagements
for insert to authenticated with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=auth.uid() and
  created_by=auth.uid() and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_engagements.firm_id
      and l.company_id=firm_engagements.company_id
      and l.revoked_at is null)
);

create policy firm_onboarding_update on public.firm_client_onboarding_steps
for update to authenticated
using (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_onboarding_steps.firm_id
      and l.company_id=firm_client_onboarding_steps.company_id
      and l.revoked_at is null)
)
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=auth.uid() and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_client_onboarding_steps.firm_id
      and l.company_id=firm_client_onboarding_steps.company_id
      and l.revoked_at is null)
);
create policy firm_engagements_update on public.firm_engagements
for update to authenticated
using (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_engagements.firm_id
      and l.company_id=firm_engagements.company_id
      and l.revoked_at is null)
)
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=auth.uid() and
  exists (select 1 from public.firm_client_links l
    where l.firm_id=firm_engagements.firm_id
      and l.company_id=firm_engagements.company_id
      and l.revoked_at is null)
);

create policy mfa_aal2_required on public.firm_client_onboarding_steps
as restrictive for all to authenticated
using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));

create policy mfa_aal2_required on public.firm_engagements
as restrictive for all to authenticated
using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));
