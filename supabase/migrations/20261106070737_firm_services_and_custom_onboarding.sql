-- Firm-owned service categories and reusable custom onboarding templates.
-- Matches migration 20261106070737 applied to Supabase project ipxflpzfcqwtenodbxwc.
create table public.firm_service_categories (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80 and name=btrim(name)),
  is_active boolean not null default true,
  version integer not null default 1 check (version>0),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index firm_service_categories_unique_name
  on public.firm_service_categories(firm_id,lower(name));
create index firm_service_categories_active on public.firm_service_categories(firm_id,is_active,name);
alter table public.firm_service_categories enable row level security;
revoke all on public.firm_service_categories from public,anon;
grant select,insert,update on public.firm_service_categories to authenticated;
create policy firm_services_read on public.firm_service_categories
 for select to authenticated using(public.is_firm_member(firm_id));
create policy firm_services_insert on public.firm_service_categories
 for insert to authenticated with check(
  public.is_firm_admin(firm_id) and created_by=(select auth.uid())
  and updated_by=(select auth.uid()));
create policy firm_services_update on public.firm_service_categories
 for update to authenticated using(public.is_firm_admin(firm_id))
 with check(public.is_firm_admin(firm_id) and updated_by=(select auth.uid()));
create policy mfa_aal2_required on public.firm_service_categories as restrictive
 for all to authenticated using((select private.mfa_requirement_met()))
 with check((select private.mfa_requirement_met()));

create table public.firm_onboarding_template_steps (
  firm_id uuid not null references public.firms(id) on delete cascade,
  task_key text not null default
    ('custom_' || replace(gen_random_uuid()::text,'-','')),
  title text not null check(length(btrim(title)) between 2 and 180 and title=btrim(title)),
  is_active boolean not null default true,
  sort_order integer not null default 100 check(sort_order between 0 and 10000),
  version integer not null default 1 check(version>0),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(firm_id,task_key),
  constraint custom_template_key check(task_key ~ '^custom_[0-9a-f]{32}$')
);
create index firm_onboarding_templates_active
 on public.firm_onboarding_template_steps(firm_id,is_active,sort_order,task_key);
alter table public.firm_onboarding_template_steps enable row level security;
revoke all on public.firm_onboarding_template_steps from public,anon;
grant select,insert,update on public.firm_onboarding_template_steps to authenticated;
create policy firm_template_read on public.firm_onboarding_template_steps
 for select to authenticated using(public.is_firm_member(firm_id));
create policy firm_template_insert on public.firm_onboarding_template_steps
 for insert to authenticated with check(
  public.is_firm_admin(firm_id) and created_by=(select auth.uid())
  and updated_by=(select auth.uid()));
create policy firm_template_update on public.firm_onboarding_template_steps
 for update to authenticated using(public.is_firm_admin(firm_id))
 with check(public.is_firm_admin(firm_id) and updated_by=(select auth.uid()));
create policy mfa_aal2_required on public.firm_onboarding_template_steps as restrictive
 for all to authenticated using((select private.mfa_requirement_met()))
 with check((select private.mfa_requirement_met()));

CREATE OR REPLACE FUNCTION private.firm_catalogue_version_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.firm_id is distinct from old.firm_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.version is distinct from old.version then
    raise exception 'Practice catalogue identity is immutable' using errcode='42501';
  end if;
  if tg_table_name='firm_service_categories' then
    if new.id is distinct from old.id then
      raise exception 'Service identifier is immutable' using errcode='42501';
    end if;
  elsif new.task_key is distinct from old.task_key then
    raise exception 'Template step identifier is immutable' using errcode='42501';
  end if;
  if new.updated_by is distinct from (select auth.uid()) then
    raise exception 'Current actor must update practice catalogue' using errcode='42501';
  end if;
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end $function$;
create trigger firm_service_category_touch before update on public.firm_service_categories
 for each row execute function private.firm_catalogue_version_guard();
create trigger firm_onboarding_template_touch before update on public.firm_onboarding_template_steps
 for each row execute function private.firm_catalogue_version_guard();
revoke all on function private.firm_catalogue_version_guard() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_firm_onboarding_template(_firm_id uuid, _company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare created_count integer;
declare active_count integer;
declare existing_count integer;
begin
  if (select auth.uid()) is null or not private.mfa_requirement_met()
     or not public.is_firm_admin(_firm_id)
     or not public.has_company_permission(_company_id,'accounting.view')
     or not exists(
       select 1 from public.firm_client_links l where l.firm_id=_firm_id
         and l.company_id=_company_id and l.revoked_at is null
     ) then
    raise exception 'Firm admin and active client access required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    _firm_id::text || ':' || _company_id::text, 29));
  select count(*) into active_count
    from public.firm_onboarding_template_steps
    where firm_id=_firm_id and is_active;
  select count(*) into existing_count
    from public.firm_client_onboarding_steps
    where firm_id=_firm_id and company_id=_company_id;
  if active_count>50 or existing_count+active_count>100 then
    raise exception 'Checklist exceeds 100 steps; archive unused templates'
      using errcode='22023';
  end if;
  insert into public.firm_client_onboarding_steps(
    firm_id,company_id,task_key,title,updated_by
  )
  select _firm_id,_company_id,t.task_key,t.title,(select auth.uid())
    from public.firm_onboarding_template_steps t
    where t.firm_id=_firm_id and t.is_active
    order by t.sort_order,t.task_key
  on conflict(firm_id,company_id,task_key) do nothing;
  get diagnostics created_count=row_count;
  return pg_catalog.jsonb_build_object(
    'added',created_count,'available',active_count
  );
end $function$;
revoke all on function public.apply_firm_onboarding_template(uuid,uuid) from public,anon;
grant execute on function public.apply_firm_onboarding_template(uuid,uuid) to authenticated;
