-- Opt-in manager escalation policies. Existing assigned-staff reminders remain unchanged.
create table public.firm_onboarding_escalation_policies (
 firm_id uuid primary key references public.firms(id) on delete cascade,
 enabled boolean not null default false,
 first_overdue_days integer not null default 3 check(first_overdue_days between 1 and 30),
 repeat_every_days integer not null default 7 check(repeat_every_days between 1 and 30),
 version integer not null default 1 check(version>0),
 updated_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.firm_onboarding_escalation_policies enable row level security;
revoke all on public.firm_onboarding_escalation_policies from public,anon,authenticated;
grant select,insert,update on public.firm_onboarding_escalation_policies to authenticated;
create policy firm_escalation_read on public.firm_onboarding_escalation_policies
 for select to authenticated using(public.is_firm_member(firm_id));
create policy firm_escalation_insert on public.firm_onboarding_escalation_policies
 for insert to authenticated with check(public.is_firm_admin(firm_id) and updated_by=(select auth.uid()));
create policy firm_escalation_update on public.firm_onboarding_escalation_policies
 for update to authenticated using(public.is_firm_admin(firm_id))
 with check(public.is_firm_admin(firm_id) and updated_by=(select auth.uid()));
create policy mfa_aal2_required on public.firm_onboarding_escalation_policies
 as restrictive for all to authenticated
 using((select private.mfa_requirement_met()))
 with check((select private.mfa_requirement_met()));

create function private.firm_escalation_version_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.firm_id is distinct from old.firm_id
    or new.created_at is distinct from old.created_at
    or new.version is distinct from old.version
    or new.updated_by is distinct from (select auth.uid()) then
   raise exception 'Escalation policy version or identity cannot be forged' using errcode='42501';
 end if;
 new.version:=old.version+1;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger firm_escalation_version_touch before update
 on public.firm_onboarding_escalation_policies for each row
 execute function private.firm_escalation_version_guard();
revoke all on function private.firm_escalation_version_guard() from public,anon,authenticated;

-- Immutable history is admin-readable only when the client link and independent
-- accounting.view entitlement still exist. Authenticated sessions cannot write this table.
create table public.firm_onboarding_escalation_events (
 id uuid primary key default gen_random_uuid(),
 firm_id uuid not null references public.firms(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 task_key text not null,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 escalated_on date not null,
 overdue_days integer not null check(overdue_days between 1 and 365),
 policy_version integer not null check(policy_version>0),
 created_at timestamptz not null default now(),
 constraint firm_escalation_once unique(firm_id,company_id,task_key,recipient_user_id,escalated_on)
);
create index firm_escalation_history_recent_idx on public.firm_onboarding_escalation_events(firm_id,created_at desc);
alter table public.firm_onboarding_escalation_events enable row level security;
revoke all on public.firm_onboarding_escalation_events from public,anon,authenticated;
grant select on public.firm_onboarding_escalation_events to authenticated;
create policy firm_escalation_history_read on public.firm_onboarding_escalation_events
 for select to authenticated using(
  public.is_firm_admin(firm_id)
  and public.has_company_permission(company_id,'accounting.view')
  and exists(select 1 from public.firm_client_links l
   where l.firm_id=firm_onboarding_escalation_events.firm_id
    and l.company_id=firm_onboarding_escalation_events.company_id and l.revoked_at is null)
 );
create policy mfa_aal2_required on public.firm_onboarding_escalation_events as restrictive
 for all to authenticated using((select private.mfa_requirement_met()))
 with check((select private.mfa_requirement_met()));

-- Manager/lead recipients are required to have active firm+client memberships,
-- a live linked client and effective accounting.view grants (including overrides).
-- The policy is disabled until a firm administrator explicitly enables it.
create function private.firm_onboarding_manager_escalations()
returns integer language plpgsql security definer set search_path='' as $$
declare delivered integer;
begin
 with eligible as materialized (
  select s.firm_id,s.company_id,s.task_key,a.user_id as recipient_user_id,
   current_date-s.due_date as overdue_days,p.version as policy_version,
   'firm-onboard-escalation:'||s.firm_id::text||':'||s.task_key||':'||current_date::text as event_key
  from public.firm_client_onboarding_steps s
  join public.firm_onboarding_escalation_policies p on p.firm_id=s.firm_id and p.enabled
  join public.firm_client_links l on l.firm_id=s.firm_id
   and l.company_id=s.company_id and l.revoked_at is null
  join public.firm_client_assignments a on a.firm_id=s.firm_id
   and a.company_id=s.company_id and a.responsibility in ('lead','manager')
  join public.firm_members fm on fm.firm_id=s.firm_id and fm.user_id=a.user_id
  join public.company_members cm on cm.company_id=s.company_id
   and cm.user_id=a.user_id and cm.status='active'
  where s.completed_at is null and s.due_date is not null
   and current_date-s.due_date between p.first_overdue_days and 365
   and (current_date-s.due_date-p.first_overdue_days)%p.repeat_every_days=0
   and (
    exists(select 1 from public.role_permissions rp
      where rp.role=cm.role and rp.permission='accounting.view')
    or exists(select 1 from public.member_permission_adjustments mp
      where mp.company_id=s.company_id and mp.user_id=a.user_id
        and mp.permission='accounting.view' and mp.effect='grant')
   )
   and (cm.role='owner' or not exists(
    select 1 from public.member_permission_adjustments mp
    where mp.company_id=s.company_id and mp.user_id=a.user_id
     and mp.permission='accounting.view' and mp.effect='deny'))
 ), delivered_notifications as (
  insert into public.action_notifications(
   company_id,recipient_user_id,event_key,category,priority,
   title,body,entity_type,entity_id,target_path,action_kind)
  select e.company_id,e.recipient_user_id,e.event_key,'system','high',
   'Client onboarding overdue — manager review',
   'An overdue client onboarding checklist needs review in Firm & Clients.',
   'firm_onboarding_step',e.company_id,'/firm','open'
  from eligible e
  on conflict(company_id,recipient_user_id,event_key) do nothing
  returning company_id,recipient_user_id,event_key
 ), logged as (
  insert into public.firm_onboarding_escalation_events(
   firm_id,company_id,task_key,recipient_user_id,escalated_on,overdue_days,policy_version)
  select e.firm_id,e.company_id,e.task_key,e.recipient_user_id,
   current_date,e.overdue_days,e.policy_version
  from eligible e
  join delivered_notifications n on n.company_id=e.company_id
   and n.recipient_user_id=e.recipient_user_id and n.event_key=e.event_key
  on conflict(firm_id,company_id,task_key,recipient_user_id,escalated_on) do nothing
  returning 1
 )
 select count(*) into delivered from logged;
 return delivered;
end $$;
revoke all on function private.firm_onboarding_manager_escalations()
 from public,anon,authenticated;

do $$
begin
 if not exists(select 1 from cron.job
  where jobname='linkbooks-firm-onboarding-manager-escalations') then
  perform cron.schedule(
   'linkbooks-firm-onboarding-manager-escalations','35 1 * * *',
   'SELECT private.firm_onboarding_manager_escalations();');
 end if;
end $$;
