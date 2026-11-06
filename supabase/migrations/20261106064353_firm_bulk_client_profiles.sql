-- LinkBooks firm bulk client profile operations. Applied to Supabase as migration 20261106064353.
-- Profile versioning safeguards existing single and new multi-client edits.
ALTER TABLE public.firm_client_profiles
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE public.firm_client_profile_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated')),
  changed_fields text[] NOT NULL,
  before_values jsonb,
  after_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX firm_client_profile_audit_recent_idx
 ON public.firm_client_profile_audit(firm_id,created_at DESC,id DESC);
ALTER TABLE public.firm_client_profile_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_client_profile_audit FROM public,anon,authenticated;
GRANT SELECT ON public.firm_client_profile_audit TO authenticated;

CREATE POLICY firm_client_profile_audit_read
 ON public.firm_client_profile_audit FOR SELECT TO authenticated
 USING (
   public.is_firm_admin(firm_id)
   AND public.has_company_permission(company_id,'accounting.view')
   AND EXISTS (
     SELECT 1 FROM public.firm_client_links l
     WHERE l.firm_id=firm_client_profile_audit.firm_id
       AND l.company_id=firm_client_profile_audit.company_id
       AND l.revoked_at IS NULL
   )
 );
CREATE POLICY mfa_aal2_required ON public.firm_client_profile_audit
 AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT private.mfa_requirement_met()));

CREATE OR REPLACE FUNCTION private.firm_client_profile_version_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.firm_id is distinct from old.firm_id
     or new.company_id is distinct from old.company_id
     or new.created_at is distinct from old.created_at
     or new.version is distinct from old.version then
    raise exception 'Firm client profile identity and version are immutable'
      using errcode='42501';
  end if;
  if new.updated_by is distinct from (select auth.uid()) then
    raise exception 'Only the current actor can update firm client profiles'
      using errcode='42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  return new;
end $function$
CREATE TRIGGER firm_client_profile_version_guard
 BEFORE UPDATE ON public.firm_client_profiles
 FOR EACH ROW EXECUTE FUNCTION private.firm_client_profile_version_guard();
REVOKE ALL ON FUNCTION private.firm_client_profile_version_guard()
 FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.firm_client_profile_audit_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  changed text[];
begin
  if tg_op = 'INSERT' then
    changed := array['status','service_line','next_review_date'];
  else
    changed := array_remove(array[
      case when new.status is distinct from old.status then 'status' end,
      case when new.service_line is distinct from old.service_line then 'service_line' end,
      case when new.next_review_date is distinct from old.next_review_date
        then 'next_review_date' end
    ]::text[], null);
    if cardinality(changed) = 0 then return new; end if;
  end if;

  insert into public.firm_client_profile_audit (
    firm_id,company_id,actor_id,action,changed_fields,before_values,after_values
  ) values (
    new.firm_id, new.company_id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    changed,
    case when tg_op = 'INSERT' then null else
      pg_catalog.jsonb_build_object(
        'status',old.status,
        'service_line',old.service_line,
        'next_review_date',old.next_review_date
      ) end,
    pg_catalog.jsonb_build_object(
      'status',new.status,
      'service_line',new.service_line,
      'next_review_date',new.next_review_date
    )
  );
  return new;
end $function$
CREATE TRIGGER firm_client_profile_audit_capture
 AFTER INSERT OR UPDATE ON public.firm_client_profiles
 FOR EACH ROW EXECUTE FUNCTION private.firm_client_profile_audit_capture();
REVOKE ALL ON FUNCTION private.firm_client_profile_audit_capture()
 FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bulk_update_firm_client_profiles(_firm_id uuid, _items jsonb, _field text, _value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  cid uuid;
  expected integer;
  current_profile public.firm_client_profiles%rowtype;
  seen uuid[] := array[]::uuid[];
  affected integer;
  changed integer := 0;
  unchanged integer := 0;
  date_value date;
begin
  if (select auth.uid()) is null or not public.is_firm_admin(_firm_id) then
    raise exception 'Firm administrator access required' using errcode='42501';
  end if;
  if _items is null or pg_catalog.jsonb_typeof(_items) <> 'array'
     or pg_catalog.jsonb_array_length(_items) not between 1 and 50 then
    raise exception 'Select 1 to 50 clients' using errcode='22023';
  end if;
  if _field not in ('status','service_line','next_review_date') or _field is null then
    raise exception 'Unsupported practice profile field' using errcode='22023';
  end if;
  if _field = 'status' and
     (_value is null or _value not in
       ('onboarding','active','on_hold','offboarding','archived')) then
    raise exception 'Invalid practice status' using errcode='22023';
  end if;
  if _field = 'service_line' and
     (_value is null or pg_catalog.char_length(_value) > 120) then
    raise exception 'Service name must be 0 to 120 characters'
      using errcode='22023';
  end if;
  if _field = 'next_review_date' and _value is not null then
    if _value !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Review date must use YYYY-MM-DD' using errcode='22023';
    end if;
    date_value := _value::date;
    if pg_catalog.to_char(date_value,'YYYY-MM-DD') <> _value then
      raise exception 'Invalid review date' using errcode='22023';
    end if;
  end if;

  -- Lock in deterministic company order; prevent duplicate target IDs.
  for item in
    select e.value from pg_catalog.jsonb_array_elements(_items) e(value)
    order by e.value->>'companyId'
  loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
       or not item ? 'companyId' or not item ? 'expectedVersion'
       or (item - 'companyId' - 'expectedVersion') <> '{}'::jsonb then
      raise exception 'Invalid client selection' using errcode='22023';
    end if;
    cid := (item->>'companyId')::uuid;
    expected := (item->>'expectedVersion')::integer;
    if cid is null or expected is null or expected < 0
       or cid = any(seen) then
      raise exception 'Invalid or duplicate client selection' using errcode='22023';
    end if;
    seen := array_append(seen,cid);

    if not public.has_company_permission(cid,'accounting.view') or not exists (
      select 1 from public.firm_client_links l
       where l.firm_id=_firm_id and l.company_id=cid and l.revoked_at is null
    ) then
      raise exception 'Client access changed; refresh your selection'
        using errcode='42501';
    end if;

    select * into current_profile
      from public.firm_client_profiles p
      where p.firm_id=_firm_id and p.company_id=cid for update;
    if found then
      if current_profile.version <> expected then
        raise exception 'Client profile changed; refresh and retry'
          using errcode='40001';
      end if;
      if (_field='status' and current_profile.status=_value)
         or (_field='service_line' and current_profile.service_line=_value)
         or (_field='next_review_date' and current_profile.next_review_date
               is not distinct from date_value) then
        unchanged := unchanged + 1;
        continue;
      end if;
      update public.firm_client_profiles
      set status=case when _field='status' then _value else status end,
          service_line=case when _field='service_line' then _value else service_line end,
          next_review_date=case when _field='next_review_date'
                            then date_value else next_review_date end,
          updated_by=(select auth.uid())
      where firm_id=_firm_id and company_id=cid and version=expected;
      get diagnostics affected = row_count;
      if affected<>1 then
        raise exception 'Client profile changed; refresh and retry'
          using errcode='40001';
      end if;
    else
      if expected<>0 then
        raise exception 'Client profile changed; refresh and retry'
          using errcode='40001';
      end if;
      insert into public.firm_client_profiles(
        firm_id,company_id,status,service_line,next_review_date,updated_by
      ) values (
        _firm_id,cid,
        case when _field='status' then _value else 'active' end,
        case when _field='service_line' then _value else '' end,
        case when _field='next_review_date' then date_value else null end,
        (select auth.uid())
      ) on conflict (firm_id,company_id) do nothing;
      get diagnostics affected = row_count;
      if affected<>1 then
        raise exception 'Client profile changed; refresh and retry'
          using errcode='40001';
      end if;
    end if;
    changed := changed + 1;
  end loop;
  return pg_catalog.jsonb_build_object(
    'updated',changed,'unchanged',unchanged,'total',pg_catalog.jsonb_array_length(_items)
  );
end $function$
REVOKE ALL ON FUNCTION public.bulk_update_firm_client_profiles(uuid,jsonb,text,text)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_firm_client_profiles(uuid,jsonb,text,text)
 TO authenticated;
