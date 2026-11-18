-- Retain the UUID SQL signature while enforcing the same MFA policy as the app
-- wrapper. Audit rows are append-only to clients, so this existing checked
-- definer remains necessary; use an empty search path and qualified objects.
create or replace function public.record_audit_event(
  _company_id uuid, _action text, _entity_type text,
  _entity_id uuid default null, _details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare _id uuid; _safe jsonb;
begin
  if auth.uid() is null or not private.mfa_requirement_met()
    or not public.is_company_member(_company_id) then
    raise exception 'Audit event permission required' using errcode = '42501';
  end if;
  _safe := coalesce(_details, '{}'::jsonb)
    - 'password' - 'token' - 'secret' - 'api_key' - 'access_token' - 'refresh_token';
  insert into public.audit_events(company_id, actor_user_id, action, entity_type, entity_id, details)
    values(_company_id, auth.uid(), _action, _entity_type, _entity_id, _safe)
    returning id into _id;
  return _id;
end;
$$;
revoke all on function public.record_audit_event(uuid,text,text,uuid,jsonb) from public,anon;
grant execute on function public.record_audit_event(uuid,text,text,uuid,jsonb) to authenticated,service_role;

-- PostgREST cannot resolve the existing text/uuid overloads from JSON strings.
-- Keep both SQL signatures for payroll and other database callers; give app RPCs
-- one explicit signature. This invoker wrapper narrows access with real MFA.
create or replace function public.record_app_audit_event(
  _company_id uuid,
  _action text,
  _entity_type text,
  _entity_id text default null,
  _details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or not private.mfa_requirement_met()
    or not public.is_company_member(_company_id) then
    raise exception 'Audit event permission required' using errcode = '42501';
  end if;
  -- A typed SQL text argument resolves the existing helper unambiguously. It
  -- retains actor identity, secret-key sanitisation and non-UUID entity refs.
  return public.record_audit_event(
    _company_id, _action, _entity_type, _entity_id, coalesce(_details, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.record_app_audit_event(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.record_app_audit_event(uuid,text,text,text,jsonb) to authenticated,service_role;
comment on function public.record_app_audit_event(uuid,text,text,text,jsonb)
  is 'Unambiguous app audit RPC; requires company membership and MFA and delegates to the existing audit helper.';

notify pgrst, 'reload schema';
