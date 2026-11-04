-- Firm practice requests: internal tracking only, not an external message or portal delivery.
create table public.firm_client_requests (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  description text not null default '' check (char_length(description)<=3000),
  status text not null default 'open' check (status in ('open','waiting','received','reviewed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_date date,
  assigned_to uuid,
  last_note text not null default '' check (char_length(last_note)<=1500),
  version integer not null default 1 check (version > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (firm_id,assigned_to) references public.firm_members(firm_id,user_id)
);
create index firm_client_requests_firm_company_idx on public.firm_client_requests (firm_id,company_id,due_date,id);
create index firm_client_requests_company_idx on public.firm_client_requests(company_id,firm_id);
create index firm_client_requests_assignee_idx on public.firm_client_requests(assigned_to) where assigned_to is not null;
create index firm_client_requests_created_by_idx on public.firm_client_requests(created_by);

create function private.firm_request_update_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.firm_id is distinct from old.firm_id
    or new.company_id is distinct from old.company_id or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
   raise exception 'Request identity and creator are immutable' using errcode='42501';
 end if;
 if new.updated_by is distinct from auth.uid() then
   raise exception 'Only the acting user may update a request' using errcode='42501';
 end if;
 new.version := old.version + 1;
 new.updated_at := now();
 return new;
end $$;
create trigger firm_request_touch before update on public.firm_client_requests
for each row execute function private.firm_request_update_guard();
revoke all on function private.firm_request_update_guard() from public,anon,authenticated;
alter table public.firm_client_requests enable row level security;
revoke all on public.firm_client_requests from public,anon;
grant select,insert,update on public.firm_client_requests to authenticated;

create policy firm_request_read on public.firm_client_requests for select to authenticated
using (
 public.is_firm_member(firm_id) and
 public.has_company_permission(company_id,'accounting.view') and
 exists (select 1 from public.firm_client_links l where l.firm_id=firm_client_requests.firm_id and l.company_id=firm_client_requests.company_id and l.revoked_at is null)
);
create policy firm_request_insert on public.firm_client_requests for insert to authenticated
with check (
 public.is_firm_admin(firm_id) and
 public.has_company_permission(company_id,'accounting.view') and
 created_by=(select auth.uid()) and updated_by=(select auth.uid()) and
 exists (select 1 from public.firm_client_links l where l.firm_id=firm_client_requests.firm_id and l.company_id=firm_client_requests.company_id and l.revoked_at is null)
);
create policy firm_request_update on public.firm_client_requests for update to authenticated
using (
 public.is_firm_admin(firm_id) and
 public.has_company_permission(company_id,'accounting.view') and
 exists (select 1 from public.firm_client_links l where l.firm_id=firm_client_requests.firm_id and l.company_id=firm_client_requests.company_id and l.revoked_at is null)
)
with check (
 public.is_firm_admin(firm_id) and
 public.has_company_permission(company_id,'accounting.view') and updated_by=(select auth.uid()) and
 exists (select 1 from public.firm_client_links l where l.firm_id=firm_client_requests.firm_id and l.company_id=firm_client_requests.company_id and l.revoked_at is null)
);
create policy mfa_aal2_required on public.firm_client_requests
as restrictive for all to authenticated
using ((select private.mfa_requirement_met()))
with check ((select private.mfa_requirement_met()));
