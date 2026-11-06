-- Idempotent onboarding template application at the 100-step client checklist limit.
-- Applied to project ipxflpzfcqwtenodbxwc as migration 20261106071930.
CREATE OR REPLACE FUNCTION public.apply_firm_onboarding_template(_firm_id uuid, _company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare created_count integer;
declare active_count integer;
declare existing_count integer;
declare missing_count integer;
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
  select count(*) into missing_count
    from public.firm_onboarding_template_steps t
    where t.firm_id=_firm_id and t.is_active
      and not exists (
        select 1 from public.firm_client_onboarding_steps s
        where s.firm_id=_firm_id and s.company_id=_company_id
          and s.task_key=t.task_key
      );
  if active_count>50 or existing_count+missing_count>100 then
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
