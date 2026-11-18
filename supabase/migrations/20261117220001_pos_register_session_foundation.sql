-- POS phase 1: reuse HR physical locations; no sale/payment/inventory/GL mutation.
-- CLI-created migration sequenced after existing future-dated main migrations.
INSERT INTO public.role_permissions(role, permission)
SELECT role::public.company_role, permission FROM
  (VALUES ('owner'),('admin')) roles(role)
CROSS JOIN (VALUES ('pos.view'),('pos.settings.manage'),('pos.register.open'),
  ('pos.register.close'),('pos.cash.count'),('pos.audit.view')) permissions(permission)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role, permission) VALUES
  ('accountant','pos.view'),('accountant','pos.audit.view'),
  ('bookkeeper','pos.view'),('bookkeeper','pos.register.open'),
  ('bookkeeper','pos.register.close'),('bookkeeper','pos.cash.count'),
  ('staff','pos.view'),('staff','pos.register.open'),('staff','pos.register.close'),
  ('staff','pos.cash.count'),('read_only','pos.view')
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS pos_location_tenant_identity ON public.hr_locations(company_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS pos_account_tenant_identity ON public.accounts(company_id,id);

CREATE TABLE public.pos_location_access (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  location_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,location_id,user_id),
  FOREIGN KEY(company_id,location_id) REFERENCES public.hr_locations(company_id,id)
);
CREATE INDEX pos_location_access_user ON public.pos_location_access(user_id,company_id);
CREATE TABLE public.pos_registers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  location_id uuid NOT NULL,
  cash_account_id uuid NOT NULL,
  code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9._-]{0,39}$'),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), UNIQUE(company_id,code),
  FOREIGN KEY(company_id,location_id) REFERENCES public.hr_locations(company_id,id),
  FOREIGN KEY(company_id,cash_account_id) REFERENCES public.accounts(company_id,id)
);
CREATE INDEX pos_registers_location ON public.pos_registers(company_id,location_id);
CREATE INDEX pos_registers_account ON public.pos_registers(company_id,cash_account_id);
CREATE TABLE public.pos_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  register_id uuid NOT NULL,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float_minor bigint NOT NULL CHECK(opening_float_minor >= 0),
  currency_code text NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'),
  open_operation_id uuid NOT NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closing_count_minor bigint CHECK(closing_count_minor >= 0),
  close_operation_id uuid,
  UNIQUE(company_id,id), UNIQUE(company_id,open_operation_id), UNIQUE(company_id,close_operation_id),
  FOREIGN KEY(company_id,register_id) REFERENCES public.pos_registers(company_id,id),
  CHECK ((closed_at IS NULL AND closed_by IS NULL AND closing_count_minor IS NULL AND close_operation_id IS NULL)
    OR (closed_at IS NOT NULL AND closing_count_minor IS NOT NULL AND close_operation_id IS NOT NULL)),
  CHECK(closed_at IS NULL OR closed_at >= opened_at),
  -- Until cash movements/checkout are implemented, only an unchanged float can be reconciled.
  CONSTRAINT pos_session_unchanged_float_close CHECK(closing_count_minor IS NULL OR closing_count_minor = opening_float_minor)
);
CREATE UNIQUE INDEX pos_one_open_session ON public.pos_register_sessions(register_id) WHERE closed_at IS NULL;
CREATE INDEX pos_sessions_history ON public.pos_register_sessions(company_id,register_id,opened_at DESC);

CREATE OR REPLACE FUNCTION private.pos_require_permission(_company_id uuid,_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_company_member(_company_id) IS NOT TRUE
    OR public.has_company_permission(_company_id,_permission) IS NOT TRUE THEN
   RAISE EXCEPTION 'POS permission denied' USING ERRCODE='42501';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.pos_can_access_location(_company_id uuid,_location_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.uid() IS NOT NULL AND public.is_company_member(_company_id)
 AND public.has_company_permission(_company_id,'pos.view') AND (
  public.has_company_permission(_company_id,'pos.settings.manage') OR EXISTS(
   SELECT 1 FROM public.pos_location_access a WHERE a.company_id=_company_id
    AND a.location_id=_location_id AND a.user_id=auth.uid())),false)
$$;

ALTER TABLE public.pos_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_register_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_location_access FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.pos_registers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.pos_register_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pos_location_access,public.pos_registers,public.pos_register_sessions TO authenticated;
CREATE POLICY pos_access_read ON public.pos_location_access FOR SELECT TO authenticated
 USING(public.is_company_member(company_id) AND public.has_company_permission(company_id,'pos.view')
  AND (user_id=auth.uid() OR public.has_company_permission(company_id,'pos.settings.manage')));
CREATE POLICY pos_registers_read ON public.pos_registers FOR SELECT TO authenticated
 USING(private.pos_can_access_location(company_id,location_id));
CREATE POLICY pos_sessions_read ON public.pos_register_sessions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.pos_registers r WHERE r.company_id=pos_register_sessions.company_id
  AND r.id=pos_register_sessions.register_id));

CREATE OR REPLACE FUNCTION private.pos_create_register(
 _company_id uuid,_register_id uuid,_location_id uuid,_cash_account_id uuid,_code text,_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _existing public.pos_registers%ROWTYPE;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.settings.manage');
 PERFORM private.pos_require_permission(_company_id,'pos.view');
 IF _register_id IS NULL OR _code IS NULL OR _code !~ '^[A-Z0-9][A-Z0-9._-]{0,39}$'
    OR _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'Invalid register details' USING ERRCODE='22023';
 END IF;
 -- Serialize setup/retries within a company, never across tenants.
 PERFORM 1 FROM public.companies WHERE id=_company_id FOR UPDATE;
 SELECT * INTO _existing FROM public.pos_registers WHERE id=_register_id AND company_id=_company_id;
 IF FOUND THEN
  IF _existing.company_id IS DISTINCT FROM _company_id OR _existing.location_id IS DISTINCT FROM _location_id
    OR _existing.cash_account_id IS DISTINCT FROM _cash_account_id OR _existing.code IS DISTINCT FROM _code
    OR _existing.name IS DISTINCT FROM trim(_name) THEN
   RAISE EXCEPTION 'Register request conflicts with existing operation' USING ERRCODE='22023';
  END IF;
  RETURN _existing.id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hr_locations WHERE company_id=_company_id AND id=_location_id AND is_active) THEN
  RAISE EXCEPTION 'Choose an active company location' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts a JOIN public.companies c ON c.id=a.company_id
   WHERE a.company_id=_company_id AND a.id=_cash_account_id AND a.is_active AND a.is_postable
   AND a.account_type='asset' AND a.account_kind IN ('bank','current_asset')
   AND (a.currency_code IS NULL OR a.currency_code=c.base_currency)) THEN
  RAISE EXCEPTION 'Choose an active postable cash asset account in company currency' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.pos_registers(id,company_id,location_id,cash_account_id,code,name,created_by)
 VALUES(_register_id,_company_id,_location_id,_cash_account_id,_code,trim(_name),auth.uid());
 PERFORM public.record_audit_event(_company_id,'pos.register.created','pos_register',_register_id,
  jsonb_build_object('location_id',_location_id,'cash_account_id',_cash_account_id,'code',_code));
 RETURN _register_id;
END $$;

CREATE OR REPLACE FUNCTION private.pos_set_location_access(
 _company_id uuid,_location_id uuid,_user_id uuid,_allowed boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _changed integer;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.settings.manage');
 IF _allowed IS NULL OR _user_id IS NULL THEN RAISE EXCEPTION 'Invalid access request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hr_locations WHERE company_id=_company_id AND id=_location_id) THEN
  RAISE EXCEPTION 'Location unavailable' USING ERRCODE='22023';
 END IF;
 IF _allowed THEN
  IF NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=_user_id AND status='active') THEN
   RAISE EXCEPTION 'Choose an active company member' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.pos_location_access(company_id,location_id,user_id,granted_by)
   VALUES(_company_id,_location_id,_user_id,auth.uid()) ON CONFLICT DO NOTHING;
 ELSE
  DELETE FROM public.pos_location_access WHERE company_id=_company_id AND location_id=_location_id AND user_id=_user_id;
 END IF;
 GET DIAGNOSTICS _changed=ROW_COUNT;
 IF _changed>0 THEN
  PERFORM public.record_audit_event(_company_id,'pos.location.access_changed','hr_location',_location_id,
   jsonb_build_object('user_id',_user_id,'allowed',_allowed));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION private.pos_open_session(
 _company_id uuid,_register_id uuid,_operation_id uuid,_opening_float_minor bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _r public.pos_registers%ROWTYPE; _s public.pos_register_sessions%ROWTYPE; _currency text;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.register.open');
 IF _operation_id IS NULL OR _opening_float_minor IS NULL OR _opening_float_minor<0 THEN
  RAISE EXCEPTION 'Invalid opening float or operation' USING ERRCODE='22023';
 END IF;
 SELECT * INTO _r FROM public.pos_registers WHERE company_id=_company_id AND id=_register_id FOR UPDATE;
 IF NOT FOUND OR NOT private.pos_can_access_location(_company_id,_r.location_id) THEN
  RAISE EXCEPTION 'Register unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO _s FROM public.pos_register_sessions WHERE company_id=_company_id AND open_operation_id=_operation_id;
 IF FOUND THEN
  IF _s.register_id IS DISTINCT FROM _register_id OR _s.opening_float_minor IS DISTINCT FROM _opening_float_minor
     OR _s.opened_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Opening operation payload differs' USING ERRCODE='22023';
  END IF;
  RETURN _s.id;
 END IF;
 IF NOT _r.is_active OR NOT EXISTS(SELECT 1 FROM public.hr_locations WHERE company_id=_company_id AND id=_r.location_id AND is_active) THEN
  RAISE EXCEPTION 'Register or location is inactive' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts a JOIN public.companies c ON c.id=a.company_id
   WHERE a.company_id=_company_id AND a.id=_r.cash_account_id AND a.is_active AND a.is_postable
   AND a.account_type='asset' AND a.account_kind IN ('bank','current_asset')
   AND (a.currency_code IS NULL OR a.currency_code=c.base_currency)) THEN
  RAISE EXCEPTION 'Register cash mapping is no longer valid' USING ERRCODE='22023';
 END IF;
 SELECT base_currency INTO _currency FROM public.companies WHERE id=_company_id;
 INSERT INTO public.pos_register_sessions(company_id,register_id,opened_by,opening_float_minor,currency_code,open_operation_id)
 VALUES(_company_id,_register_id,auth.uid(),_opening_float_minor,_currency,_operation_id) RETURNING id INTO _s.id;
 PERFORM public.record_audit_event(_company_id,'pos.session.opened','pos_register_session',_s.id,
  jsonb_build_object('register_id',_register_id,'opening_float_minor',_opening_float_minor::text,'currency',_currency));
 RETURN _s.id;
END $$;

CREATE OR REPLACE FUNCTION private.pos_close_session(
 _company_id uuid,_session_id uuid,_operation_id uuid,_closing_count_minor bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _s public.pos_register_sessions%ROWTYPE; _location uuid;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.register.close');
 PERFORM private.pos_require_permission(_company_id,'pos.cash.count');
 IF _operation_id IS NULL OR _closing_count_minor IS NULL OR _closing_count_minor<0 THEN
  RAISE EXCEPTION 'Invalid closing count or operation' USING ERRCODE='22023';
 END IF;
 SELECT * INTO _s FROM public.pos_register_sessions WHERE company_id=_company_id AND id=_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501'; END IF;
 SELECT location_id INTO _location FROM public.pos_registers WHERE company_id=_company_id AND id=_s.register_id;
 IF NOT private.pos_can_access_location(_company_id,_location)
    OR (_s.opened_by IS DISTINCT FROM auth.uid() AND NOT public.has_company_permission(_company_id,'pos.settings.manage')) THEN
  RAISE EXCEPTION 'Session unavailable for this cashier' USING ERRCODE='42501';
 END IF;
 IF _s.closed_at IS NOT NULL THEN
  IF _s.close_operation_id IS DISTINCT FROM _operation_id OR _s.closing_count_minor IS DISTINCT FROM _closing_count_minor THEN
   RAISE EXCEPTION 'Session is locked; closing operation differs' USING ERRCODE='22023';
  END IF;
  RETURN _s.id;
 END IF;
 IF _closing_count_minor<>_s.opening_float_minor THEN
  RAISE EXCEPTION 'Cash variance requires an approved accounting adjustment; session remains open' USING ERRCODE='22023';
 END IF;
 UPDATE public.pos_register_sessions SET closed_at=clock_timestamp(),closed_by=auth.uid(),
  closing_count_minor=_closing_count_minor,close_operation_id=_operation_id WHERE id=_session_id;
 PERFORM public.record_audit_event(_company_id,'pos.session.closed','pos_register_session',_session_id,
  jsonb_build_object('count_minor',_closing_count_minor::text,'variance_minor','0'));
 RETURN _session_id;
END $$;

-- Only private guarded commands elevate. Public API wrappers use the caller's rights.
CREATE FUNCTION public.pos_create_register(_company_id uuid,_register_id uuid,_location_id uuid,_cash_account_id uuid,_code text,_name text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_create_register(_company_id,_register_id,_location_id,_cash_account_id,_code,_name)
$$;
CREATE FUNCTION public.pos_set_location_access(_company_id uuid,_location_id uuid,_user_id uuid,_allowed boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_set_location_access(_company_id,_location_id,_user_id,_allowed)
$$;
CREATE FUNCTION public.pos_open_session(_company_id uuid,_register_id uuid,_operation_id uuid,_opening_float_minor bigint)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_open_session(_company_id,_register_id,_operation_id,_opening_float_minor)
$$;
CREATE FUNCTION public.pos_close_session(_company_id uuid,_session_id uuid,_operation_id uuid,_closing_count_minor bigint)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_close_session(_company_id,_session_id,_operation_id,_closing_count_minor)
$$;

REVOKE ALL ON FUNCTION private.pos_require_permission(uuid,text),private.pos_can_access_location(uuid,uuid),
 private.pos_create_register(uuid,uuid,uuid,uuid,text,text),private.pos_set_location_access(uuid,uuid,uuid,boolean),
 private.pos_open_session(uuid,uuid,uuid,bigint),private.pos_close_session(uuid,uuid,uuid,bigint),
 public.pos_create_register(uuid,uuid,uuid,uuid,text,text),public.pos_set_location_access(uuid,uuid,uuid,boolean),
 public.pos_open_session(uuid,uuid,uuid,bigint),public.pos_close_session(uuid,uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.pos_require_permission(uuid,text),private.pos_can_access_location(uuid,uuid),
 private.pos_create_register(uuid,uuid,uuid,uuid,text,text),private.pos_set_location_access(uuid,uuid,uuid,boolean),
 private.pos_open_session(uuid,uuid,uuid,bigint),private.pos_close_session(uuid,uuid,uuid,bigint),
 public.pos_create_register(uuid,uuid,uuid,uuid,text,text),public.pos_set_location_access(uuid,uuid,uuid,boolean),
 public.pos_open_session(uuid,uuid,uuid,bigint),public.pos_close_session(uuid,uuid,uuid,bigint) TO authenticated;

CREATE FUNCTION private.pos_get_workspace(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE _registers jsonb; _open jsonb; _history jsonb; _locations jsonb; _accounts jsonb;
 _currency text; _manage boolean; _ids uuid[]; _members jsonb; _access jsonb;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.view');
 SELECT base_currency INTO _currency FROM public.companies WHERE id=_company_id;
 _manage:=coalesce(public.has_company_permission(_company_id,'pos.settings.manage'),false);
 SELECT coalesce(array_agg(r.id),ARRAY[]::uuid[]) INTO _ids FROM (
  SELECT id FROM public.pos_registers WHERE company_id=_company_id
    AND private.pos_can_access_location(_company_id,location_id) ORDER BY code,id LIMIT 100
 ) r;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.code,r.id),'[]') INTO _registers FROM (
  SELECT r.id,r.code,r.name,r.location_id,r.cash_account_id,r.is_active,l.name AS location_name
  FROM public.pos_registers r JOIN public.hr_locations l ON l.company_id=r.company_id AND l.id=r.location_id
  WHERE r.company_id=_company_id AND r.id=ANY(_ids)
 ) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'register_id',s.register_id,'opened_by',s.opened_by,
  'opened_at',s.opened_at,'opening_float_minor',s.opening_float_minor::text,'currency_code',s.currency_code,
  'closed_at',s.closed_at,'closing_count_minor',s.closing_count_minor::text) ORDER BY s.opened_at DESC,s.id),'[]')
 INTO _open FROM public.pos_register_sessions s WHERE s.company_id=_company_id AND s.register_id=ANY(_ids) AND s.closed_at IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.closed_at DESC,s.id),'[]') INTO _history FROM (
  SELECT id,register_id,opened_by,opened_at,opening_float_minor::text,currency_code,closed_at,closing_count_minor::text
  FROM public.pos_register_sessions WHERE company_id=_company_id AND register_id=ANY(_ids) AND closed_at IS NOT NULL
  ORDER BY closed_at DESC,id LIMIT 50
 ) s;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.name,l.id),'[]') INTO _locations FROM (
  SELECT id,name,code FROM public.hr_locations WHERE company_id=_company_id AND is_active
   AND (_manage OR private.pos_can_access_location(_company_id,id)) ORDER BY name,id LIMIT 100
 ) l;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.code,a.id),'[]') INTO _accounts FROM (
  SELECT a.id,a.code,a.name FROM public.accounts a WHERE _manage AND a.company_id=_company_id
   AND a.is_active AND a.is_postable AND a.account_type='asset' AND a.account_kind IN ('bank','current_asset')
   AND (a.currency_code IS NULL OR a.currency_code=_currency) ORDER BY a.code,a.id LIMIT 500
 ) a;
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.name,m.id),'[]') INTO _members FROM (
  SELECT m.user_id AS id,coalesce(nullif(p.full_name,''),p.email,'Unnamed member') AS name,p.email
  FROM public.company_members m LEFT JOIN public.profiles p ON p.id=m.user_id
  WHERE _manage AND public.has_company_permission(_company_id,'members.view')
   AND m.company_id=_company_id AND m.status='active' ORDER BY name,m.user_id LIMIT 100
 ) m;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.location_id,a.user_id),'[]') INTO _access FROM (
  SELECT location_id,user_id FROM public.pos_location_access WHERE company_id=_company_id AND _manage
  ORDER BY location_id,user_id LIMIT 1000
 ) a;
 RETURN jsonb_build_object('members',_members,'locationAccess',_access,'userId',auth.uid(),'currency',_currency,'registers',_registers,'openSessions',_open,'recentSessions',_history,
  'locations',_locations,'cashAccounts',_accounts,
  'canManage',_manage,'canOpen',public.has_company_permission(_company_id,'pos.register.open'),
  'canClose',public.has_company_permission(_company_id,'pos.register.close') AND public.has_company_permission(_company_id,'pos.cash.count'));
END $$;
CREATE FUNCTION public.pos_get_workspace(_company_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.pos_get_workspace(_company_id) $$;
REVOKE ALL ON FUNCTION public.pos_get_workspace(uuid),private.pos_get_workspace(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_get_workspace(uuid),private.pos_get_workspace(uuid) TO authenticated;
