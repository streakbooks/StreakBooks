-- Firm & Clients: reuse existing action_document_requests, document_attachments, and
-- sales_invoices. No new ledger, document store, invitation token, or payment gateway.
create table public.firm_client_assignments (
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  responsibility text not null check (responsibility in ('lead','manager','bookkeeper','reviewer')),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (firm_id, company_id, user_id)
);
create index firm_client_assignments_member_idx
  on public.firm_client_assignments(user_id,firm_id,company_id);

create table public.firm_document_request_tracking (
  request_id uuid primary key references public.action_document_requests(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  due_date date not null,
  reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint firm_request_due_window check (due_date >= created_at::date - 30)
);
create index firm_document_request_tracking_scope_idx
  on public.firm_document_request_tracking(firm_id,company_id,due_date);
create index firm_document_request_tracking_due_idx
  on public.firm_document_request_tracking(due_date)
  where reminders_enabled;

create table public.firm_engagement_invoice_links (
  engagement_id uuid not null references public.firm_engagements(id) on delete cascade,
  invoice_id uuid not null references public.sales_invoices(id) on delete restrict,
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  billing_company_id uuid not null references public.companies(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (engagement_id,invoice_id),
  constraint billing_company_distinct_from_client check (billing_company_id <> company_id)
);
create index firm_engagement_invoice_links_billing_idx
  on public.firm_engagement_invoice_links(billing_company_id,invoice_id);

alter table public.firm_client_assignments enable row level security;
alter table public.firm_document_request_tracking enable row level security;
alter table public.firm_engagement_invoice_links enable row level security;
revoke all on public.firm_client_assignments,public.firm_document_request_tracking,
  public.firm_engagement_invoice_links from public,anon;
grant select,insert,update,delete on public.firm_client_assignments to authenticated;
grant select,insert on public.firm_document_request_tracking,
  public.firm_engagement_invoice_links to authenticated;
grant delete on public.firm_engagement_invoice_links to authenticated;

-- Shared firm/client boundary, always require BOTH memberships and effective company access.
create policy firm_assignments_read on public.firm_client_assignments
for select to authenticated using (
  public.is_firm_member(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_client_assignments.firm_id
      and l.company_id=firm_client_assignments.company_id and l.revoked_at is null)
);
create policy firm_assignments_insert on public.firm_client_assignments
for insert to authenticated with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists(select 1 from public.firm_members fm
    where fm.firm_id=firm_client_assignments.firm_id and fm.user_id=firm_client_assignments.user_id) and
  exists(select 1 from public.company_members cm
    where cm.company_id=firm_client_assignments.company_id
      and cm.user_id=firm_client_assignments.user_id and cm.status='active') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_client_assignments.firm_id
      and l.company_id=firm_client_assignments.company_id and l.revoked_at is null)
);
create policy firm_assignments_update on public.firm_client_assignments
for update to authenticated using (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_client_assignments.firm_id
      and l.company_id=firm_client_assignments.company_id and l.revoked_at is null)
)
with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  updated_by=(select auth.uid()) and
  exists(select 1 from public.firm_members fm
    where fm.firm_id=firm_client_assignments.firm_id and fm.user_id=firm_client_assignments.user_id) and
  exists(select 1 from public.company_members cm
    where cm.company_id=firm_client_assignments.company_id
      and cm.user_id=firm_client_assignments.user_id and cm.status='active') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_client_assignments.firm_id
      and l.company_id=firm_client_assignments.company_id and l.revoked_at is null)
);
create policy firm_assignments_delete on public.firm_client_assignments
for delete to authenticated using (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_client_assignments.firm_id
      and l.company_id=firm_client_assignments.company_id and l.revoked_at is null)
);

create policy firm_request_tracking_read on public.firm_document_request_tracking
for select to authenticated using (
  public.is_firm_member(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_document_request_tracking.firm_id
      and l.company_id=firm_document_request_tracking.company_id and l.revoked_at is null) and
  exists(select 1 from public.action_document_requests d
    where d.id=firm_document_request_tracking.request_id
      and d.company_id=firm_document_request_tracking.company_id)
);
create policy firm_request_tracking_insert on public.firm_document_request_tracking
for insert to authenticated with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  created_by=(select auth.uid()) and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_document_request_tracking.firm_id
      and l.company_id=firm_document_request_tracking.company_id and l.revoked_at is null) and
  exists(select 1 from public.action_document_requests d
    where d.id=firm_document_request_tracking.request_id
      and d.company_id=firm_document_request_tracking.company_id
      and d.requested_by=(select auth.uid()))
);

create policy firm_engagement_invoice_read on public.firm_engagement_invoice_links
for select to authenticated using (
  public.is_firm_member(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  public.has_company_permission(billing_company_id,'sales.view') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_engagement_invoice_links.firm_id
      and l.company_id=firm_engagement_invoice_links.company_id and l.revoked_at is null)
);
create policy firm_engagement_invoice_insert on public.firm_engagement_invoice_links
for insert to authenticated with check (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  public.has_company_permission(billing_company_id,'sales.draft') and
  created_by=(select auth.uid()) and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_engagement_invoice_links.firm_id
      and l.company_id=firm_engagement_invoice_links.company_id and l.revoked_at is null) and
  exists(select 1 from public.firm_engagements e
    where e.id=firm_engagement_invoice_links.engagement_id
      and e.firm_id=firm_engagement_invoice_links.firm_id
      and e.company_id=firm_engagement_invoice_links.company_id) and
  exists(select 1 from public.sales_invoices i
    where i.id=firm_engagement_invoice_links.invoice_id
      and i.company_id=firm_engagement_invoice_links.billing_company_id)
);
create policy firm_engagement_invoice_delete on public.firm_engagement_invoice_links
for delete to authenticated using (
  public.is_firm_admin(firm_id) and
  public.has_company_permission(company_id,'accounting.view') and
  public.has_company_permission(billing_company_id,'sales.draft') and
  exists(select 1 from public.firm_client_links l
    where l.firm_id=firm_engagement_invoice_links.firm_id
      and l.company_id=firm_engagement_invoice_links.company_id and l.revoked_at is null)
);

-- Sensitive operational data is protected by the same MFA policy as related practice work.
create policy mfa_aal2_required on public.firm_client_assignments as restrictive
for all to authenticated using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));
create policy mfa_aal2_required on public.firm_document_request_tracking as restrictive
for all to authenticated using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));
create policy mfa_aal2_required on public.firm_engagement_invoice_links as restrictive
for all to authenticated using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));

-- Create tracking and the existing document request atomically, using the established
-- rate-limited, permission-checked document-request function. No duplicate request engine.
create function public.create_firm_document_request(
 _firm_id uuid, _company_id uuid, _requested_from uuid,
 _subject text, _instructions text, _due_date date
) returns uuid language plpgsql security invoker set search_path='' as $$
declare new_id uuid;
begin
 if auth.uid() is null or not public.is_firm_admin(_firm_id) or
    not public.has_company_permission(_company_id,'accounting.view') or
    not exists(select 1 from public.firm_client_links
      where firm_id=_firm_id and company_id=_company_id and revoked_at is null) then
   raise exception 'Firm admin with active client access required' using errcode='42501';
 end if;
 if _due_date is null or _due_date < current_date - 30 or
    _due_date > current_date + 365 then
   raise exception 'Due date must be within the allowed planning window';
 end if;
 new_id:=public.create_action_document_request(
   _company_id,_requested_from,_subject,_instructions
 );
 insert into public.firm_document_request_tracking(
   request_id,firm_id,company_id,due_date,created_by
 ) values(new_id,_firm_id,_company_id,_due_date,auth.uid());
 return new_id;
end $$;
revoke all on function public.create_firm_document_request(uuid,uuid,uuid,text,text,date)
  from public,anon;
grant execute on function public.create_firm_document_request(uuid,uuid,uuid,text,text,date)
  to authenticated;

-- Internal, idempotent, in-app-only reminders. No email or client-portal delivery.
-- Cron runs this database function daily. Existing action_notifications powers the UI bell.
create function private.firm_request_due_notifications()
returns integer language plpgsql security definer set search_path='' as $$
declare sent integer;
begin
 with candidate as (
   select t.request_id,t.company_id,d.requested_from,t.due_date,
     (t.due_date - current_date) as days_until
   from public.firm_document_request_tracking t
   join public.action_document_requests d on d.id=t.request_id
   join public.firm_client_links l on l.firm_id=t.firm_id
     and l.company_id=t.company_id and l.revoked_at is null
   join public.company_members cm on cm.company_id=d.company_id
     and cm.user_id=d.requested_from and cm.status='active'
   where t.reminders_enabled and d.completed_at is null and d.cancelled_at is null
     and t.due_date between current_date - 28 and current_date + 3
     and ((t.due_date - current_date) in (3,0)
       or (current_date > t.due_date
         and (current_date-t.due_date) % 7 = 0))
 )
 insert into public.action_notifications(
   company_id,recipient_user_id,event_key,category,priority,
   title,body,entity_type,entity_id,target_path,action_kind
 )
 select c.company_id,c.requested_from,
   'firm-document-due:'||c.request_id::text||':'||current_date::text,
   'document_request',
   case when c.days_until < 0 then 'high' else 'medium' end,
   'Client document request '||
     case when c.days_until < 0 then 'overdue'
       when c.days_until=0 then 'due today' else 'due in 3 days' end,
   'Open your LinkBooks document request to upload the required client file.',
   'action_document_request',c.request_id,'/firm','open'
 from candidate c
 on conflict (company_id,recipient_user_id,event_key) do nothing;
 get diagnostics sent=row_count;
 return sent;
end $$;
revoke all on function private.firm_request_due_notifications() from public,anon,authenticated;

-- Immutable assignment identity and immutable request/invoice linkage prevent
-- reparenting records into another firm or company.
create function private.firm_assignment_identity_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.firm_id is distinct from old.firm_id
     or new.company_id is distinct from old.company_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Practice assignment identity is immutable' using errcode='42501';
  end if;
  if new.updated_by is distinct from auth.uid() then
    raise exception 'Updated-by must be current user' using errcode='42501';
  end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger firm_assignment_identity_guard before update on public.firm_client_assignments
  for each row execute function private.firm_assignment_identity_guard();
revoke all on function private.firm_assignment_identity_guard() from public,anon,authenticated;

-- Idempotent daily scheduling. All delivery stays in LinkBooks' notification centre.
do $$
begin
  if not exists(select 1 from cron.job where jobname='linkbooks-firm-document-reminders') then
    perform cron.schedule(
      'linkbooks-firm-document-reminders',
      '15 1 * * *',
      'SELECT private.firm_request_due_notifications();'
    );
  end if;
end $$;
