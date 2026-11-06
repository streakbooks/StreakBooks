-- User-private firm directory preferences; no company records or accounting changes.
create table public.firm_ui_preferences (
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null
    check (preference_key in ('firm.directory.columns.v1','firm.directory.views.v1')),
  preference_value jsonb not null
    check (jsonb_typeof(preference_value) = 'array' and
           octet_length(preference_value::text) <= 12000),
  updated_at timestamptz not null default now(),
  primary key (firm_id,user_id,preference_key)
);

alter table public.firm_ui_preferences enable row level security;
revoke all on public.firm_ui_preferences from public, anon;
grant select, insert, update on public.firm_ui_preferences to authenticated;

create policy firm_preferences_read_self
  on public.firm_ui_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_firm_member(firm_id));

create policy firm_preferences_insert_self
  on public.firm_ui_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_firm_member(firm_id));

create policy firm_preferences_update_self
  on public.firm_ui_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_firm_member(firm_id))
  with check (user_id = (select auth.uid()) and public.is_firm_member(firm_id));

create policy mfa_aal2_required
  on public.firm_ui_preferences as restrictive for all to authenticated
  using ((select private.mfa_requirement_met()))
  with check ((select private.mfa_requirement_met()));

-- Preserve immutable preference identity during upserts/updates.
create function private.firm_preference_identity_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.firm_id is distinct from old.firm_id or
     new.user_id is distinct from old.user_id or
     new.preference_key is distinct from old.preference_key then
    raise exception 'Firm preference identity cannot change' using errcode='42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger firm_preference_identity_guard
before update on public.firm_ui_preferences
for each row execute function private.firm_preference_identity_guard();

revoke all on function private.firm_preference_identity_guard() from public, anon, authenticated;
