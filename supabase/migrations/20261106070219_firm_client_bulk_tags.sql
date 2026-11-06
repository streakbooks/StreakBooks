-- Extension to practice bulk profile updates: tag array updates and audit history.
-- Applied to Supabase project ipxflpzfcqwtenodbxwc as migration 20261106070219.
CREATE OR REPLACE FUNCTION private.firm_client_profile_audit_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare changed text[];
begin
  if tg_op = 'INSERT' then
    changed := array['status','service_line','next_review_date','tags'];
  else
    changed := array_remove(array[
      case when new.status is distinct from old.status then 'status' end,
      case when new.service_line is distinct from old.service_line then 'service_line' end,
      case when new.next_review_date is distinct from old.next_review_date then 'next_review_date' end,
      case when new.tags is distinct from old.tags then 'tags' end
    ]::text[], null);
    if cardinality(changed) = 0 then return new; end if;
  end if;
  insert into public.firm_client_profile_audit
    (firm_id,company_id,actor_id,action,changed_fields,before_values,after_values)
  values (
    new.firm_id,new.company_id,(select auth.uid()),
    case when tg_op='INSERT' then 'created' else 'updated' end,
    changed,
    case when tg_op='INSERT' then null else pg_catalog.jsonb_build_object(
      'status',old.status,'service_line',old.service_line,
      'next_review_date',old.next_review_date,'tags',old.tags
    ) end,
    pg_catalog.jsonb_build_object(
      'status',new.status,'service_line',new.service_line,
      'next_review_date',new.next_review_date,'tags',new.tags
    )
  );
  return new;
end $function$
REVOKE ALL ON FUNCTION private.firm_client_profile_audit_capture() FROM public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.bulk_update_firm_client_tags(_firm_id uuid, _items jsonb, _operation text, _tags text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  cid uuid;
  expected integer;
  profile_row public.firm_client_profiles%rowtype;
  seen uuid[] := array[]::uuid[];
  normalized text[] := array[]::text[];
  resulting text[];
  tag text;
  entry text;
  changed integer := 0;
  unchanged integer := 0;
  affected integer;
begin
  if (select auth.uid()) is null or not public.is_firm_admin(_firm_id)
     or not private.mfa_requirement_met() then
    raise exception 'Firm admin access and MFA required' using errcode='42501';
  end if;
  if _items is null or pg_catalog.jsonb_typeof(_items)<>'array'
    or pg_catalog.jsonb_array_length(_items) not between 1 and 50 then
    raise exception 'Select 1 to 50 clients' using errcode='22023';
  end if;
  if _operation is null or _operation not in ('add','remove','replace') then
    raise exception 'Invalid tag operation' using errcode='22023';
  end if;
  if _tags is null or cardinality(_tags)>12 or
    (_operation <> 'replace' and cardinality(_tags)=0) then
    raise exception 'Enter 1 to 12 tags, or choose replace to clear all'
      using errcode='22023';
  end if;
  foreach tag in array _tags loop
    if tag is null or pg_catalog.char_length(pg_catalog.btrim(tag)) not between 1 and 40 then
      raise exception 'Each tag must be 1 to 40 characters' using errcode='22023';
    end if;
    tag := pg_catalog.btrim(tag);
    if not tag = any(normalized) then normalized := pg_catalog.array_append(normalized, tag); end if;
  end loop;
  for item in
    select e.value from pg_catalog.jsonb_array_elements(_items) e(value)
    order by e.value->>'companyId'
  loop
    if pg_catalog.jsonb_typeof(item)<>'object' or not item ? 'companyId'
       or not item ? 'expectedVersion'
       or (item - 'companyId' - 'expectedVersion') <> '{}'::jsonb then
      raise exception 'Invalid selection' using errcode='22023';
    end if;
    cid := (item->>'companyId')::uuid;
    expected := (item->>'expectedVersion')::integer;
    if cid is null or expected is null or expected<0 or cid=any(seen) then
      raise exception 'Duplicate or invalid client selection' using errcode='22023';
    end if;
    seen := pg_catalog.array_append(seen,cid);
    if not public.has_company_permission(cid,'accounting.view') or not exists(
      select 1 from public.firm_client_links l where l.firm_id=_firm_id
        and l.company_id=cid and l.revoked_at is null
    ) then
      raise exception 'Client access changed. Refresh selection' using errcode='42501';
    end if;

    select * into profile_row from public.firm_client_profiles p
      where p.firm_id=_firm_id and p.company_id=cid for update;
    if found then
      if profile_row.version<>expected then
        raise exception 'Client profile changed; refresh and retry' using errcode='40001';
      end if;
      resulting := case when _operation='replace' then normalized
        else profile_row.tags end;
      if _operation='add' then
        foreach entry in array normalized loop
          if not entry=any(resulting) then
            resulting := pg_catalog.array_append(resulting,entry);
          end if;
        end loop;
      elsif _operation='remove' then
        resulting := array(select v from pg_catalog.unnest(profile_row.tags) v
          where not v=any(normalized));
      end if;
      if cardinality(resulting)>12 then
        raise exception 'Client tag limit is 12' using errcode='22023';
      end if;
      if profile_row.tags=resulting then
        unchanged:=unchanged+1;
        continue;
      end if;
      update public.firm_client_profiles
      set tags=resulting, updated_by=(select auth.uid())
      where firm_id=_firm_id and company_id=cid and version=expected;
      get diagnostics affected=row_count;
      if affected<>1 then
        raise exception 'Client profile changed; refresh and retry' using errcode='40001';
      end if;
    else
      if expected<>0 then
        raise exception 'Client profile changed; refresh and retry' using errcode='40001';
      end if;
      if _operation='remove' or (_operation='replace' and cardinality(normalized)=0) then
        unchanged:=unchanged+1;
        continue;
      end if;
      insert into public.firm_client_profiles(firm_id,company_id,tags,updated_by)
      values (_firm_id,cid,normalized,(select auth.uid()))
      on conflict (firm_id,company_id) do nothing;
      get diagnostics affected=row_count;
      if affected<>1 then
        raise exception 'Client profile changed; refresh and retry' using errcode='40001';
      end if;
    end if;
    changed:=changed+1;
  end loop;
  return pg_catalog.jsonb_build_object('updated',changed,'unchanged',unchanged,
    'total',pg_catalog.jsonb_array_length(_items));
end $function$
REVOKE ALL ON FUNCTION public.bulk_update_firm_client_tags(uuid,jsonb,text,text[]) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_firm_client_tags(uuid,jsonb,text,text[]) TO authenticated;
