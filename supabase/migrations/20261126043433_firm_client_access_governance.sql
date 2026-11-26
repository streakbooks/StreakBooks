-- Firm-client access governance (7A/7B).
-- Delegated firm staff are authorized by per-client grants, never by client seats.
-- Existing firm-managed company memberships are migrated from their provenance ledger where
-- they remain unchanged; unrelated or modified client memberships are preserved.

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE public.firms ADD CONSTRAINT firms_status_check
    CHECK (status IN ('active','suspended','disputed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.firm_client_access_grants (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('read_only','staff','bookkeeper','accountant','admin')),
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firm_id, company_id, user_id)
);
CREATE INDEX IF NOT EXISTS firm_client_access_grants_user_idx
  ON public.firm_client_access_grants(user_id, firm_id, company_id);
CREATE INDEX IF NOT EXISTS firm_client_access_grants_company_idx
  ON public.firm_client_access_grants(company_id, firm_id);
ALTER TABLE public.firm_client_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_client_access_grants FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_client_access_grants TO authenticated;

-- Migrate only firm-created seats whose provenance and current role/version still match.
-- Independent memberships, permission-adjusted memberships, and rows changed by a client
-- administrator are intentionally retained for client review.
INSERT INTO public.firm_client_access_grants
  (firm_id,company_id,user_id,role,granted_by,revoked_at)
SELECT l.firm_id,l.company_id,cm.user_id,g.granted_role::text,
  coalesce(l.linked_by,f.created_by,cm.user_id),NULL
FROM private.firm_access_grants g
JOIN public.firm_client_links l ON l.id=g.link_id AND l.revoked_at IS NULL
JOIN public.firms f ON f.id=l.firm_id
JOIN public.company_members cm ON cm.id=g.member_id AND cm.role=g.granted_role
  AND cm.updated_at=g.member_updated_at
JOIN public.firm_members fm ON fm.firm_id=l.firm_id AND fm.user_id=cm.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.member_permission_adjustments a
  WHERE a.company_id=cm.company_id AND a.user_id=cm.user_id)
ON CONFLICT (firm_id,company_id,user_id) DO NOTHING;

DELETE FROM public.company_members cm
WHERE NOT EXISTS (SELECT 1 FROM public.member_permission_adjustments a
    WHERE a.company_id=cm.company_id AND a.user_id=cm.user_id)
  AND EXISTS (
    SELECT 1 FROM private.firm_access_grants g
    JOIN public.firm_client_links l ON l.id=g.link_id AND l.revoked_at IS NULL
    JOIN public.firm_members fm ON fm.firm_id=l.firm_id AND fm.user_id=cm.user_id
    JOIN public.firm_client_access_grants scoped ON scoped.firm_id=l.firm_id
      AND scoped.company_id=l.company_id AND scoped.user_id=cm.user_id
      AND scoped.revoked_at IS NULL
    WHERE g.member_id=cm.id AND l.company_id=cm.company_id
      AND cm.role=g.granted_role AND cm.updated_at=g.member_updated_at
  );

CREATE TABLE IF NOT EXISTS public.firm_client_permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_keys text[] NOT NULL CHECK (cardinality(permission_keys) BETWEEN 1 AND 20),
  request_reason text NOT NULL CHECK (length(btrim(request_reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_reason text CHECK (review_reason IS NULL OR length(btrim(review_reason)) BETWEEN 3 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id, company_id, user_id)
    REFERENCES public.firm_client_access_grants(firm_id, company_id, user_id) ON DELETE CASCADE,
  CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS firm_client_permission_requests_scope_idx
  ON public.firm_client_permission_requests(company_id, firm_id, created_at DESC);
ALTER TABLE public.firm_client_permission_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_client_permission_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.firm_client_permission_requests TO authenticated;

CREATE TABLE IF NOT EXISTS public.firm_client_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firm_id uuid NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  module_key text NOT NULL CHECK (module_key ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  accessed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id, company_id, user_id)
    REFERENCES public.firm_client_access_grants(firm_id, company_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS firm_client_access_events_client_recent_idx
  ON public.firm_client_access_events(company_id, accessed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS firm_client_access_events_firm_recent_idx
  ON public.firm_client_access_events(firm_id, company_id, accessed_at DESC);
ALTER TABLE public.firm_client_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_client_access_events FROM PUBLIC, anon;
GRANT SELECT ON public.firm_client_access_events TO authenticated;

CREATE OR REPLACE FUNCTION private.firm_client_staff_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND private.customer_access_ok()
    AND EXISTS (
      SELECT 1
      FROM public.firm_client_access_grants g
      JOIN public.firm_client_links l ON l.firm_id = g.firm_id AND l.company_id = g.company_id
      JOIN public.firms f ON f.id = g.firm_id AND f.status = 'active'
      JOIN public.firm_members fm ON fm.firm_id = g.firm_id AND fm.user_id = g.user_id
      JOIN public.role_permissions rp ON rp.role::text = g.role AND rp.permission = _permission
      WHERE g.company_id = _company_id AND g.user_id = auth.uid() AND l.revoked_at IS NULL
        AND g.revoked_at IS NULL
        AND (
          _permission NOT IN ('accounting.post','sales.draft','purchases.draft','expenses.submit',
            'banking.feeds.manage','banking.reconcile','members.manage','company.settings.edit',
            'billing.manage','tax.settings')
          OR EXISTS (
            SELECT 1 FROM public.firm_client_permission_requests r
            WHERE r.firm_id = g.firm_id AND r.company_id = g.company_id AND r.user_id = g.user_id
              AND r.status = 'approved' AND _permission = ANY(r.permission_keys)
          )
        )
    );
$$;
REVOKE ALL ON FUNCTION private.firm_client_staff_permission(uuid,text) FROM PUBLIC, anon, authenticated;

-- Firm-scoped custom platform roles used to grant access across every linked client are
-- narrowed to company scope. Per-client access comes only from the grants above.
CREATE OR REPLACE FUNCTION private.scoped_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_role_assignments a
    JOIN public.platform_custom_roles r ON r.id = a.role_id
    WHERE a.user_id = auth.uid() AND _permission = ANY(r.permissions)
      AND r.scope = 'company' AND a.scope_id = _company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.customer_access_ok() AND (
    EXISTS (SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id AND m.user_id = auth.uid() AND m.status = 'active')
    OR private.firm_client_staff_permission(_company_id, 'company.view')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_company_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.customer_access_ok() AND (
    EXISTS (
      SELECT 1 FROM public.company_members m
      JOIN public.role_permissions rp ON rp.role = m.role
      WHERE m.company_id = _company_id AND m.user_id = auth.uid()
        AND m.status = 'active' AND rp.permission = _permission
    )
    OR private.scoped_permission(_company_id, _permission)
    OR private.firm_client_staff_permission(_company_id, _permission)
  ) AND (
    _permission ~ '\.(view|export)$'
    OR private.platform_write_allowed(_company_id,
      CASE split_part(_permission,'.',1)
        WHEN 'purchases' THEN 'purchases' WHEN 'sales' THEN 'sales'
        WHEN 'banking' THEN 'banking' WHEN 'budgets' THEN 'budgets'
        WHEN 'projects' THEN 'projects' WHEN 'fixed_assets' THEN 'fixed_assets'
        WHEN 'documents' THEN 'documents' ELSE 'accounting' END)
  );
$$;
REVOKE ALL ON FUNCTION public.is_company_member(uuid), public.has_company_permission(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid), public.has_company_permission(uuid,text) TO authenticated;

-- Company switcher candidates include only explicit client grants for firm staff.
-- Existing company memberships and company-scoped platform roles remain supported.
CREATE OR REPLACE FUNCTION private.platform_company_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.customer_access_ok() THEN RETURN '[]'::jsonb; END IF;
  RETURN (
    WITH candidate AS (
      SELECT company_id AS id FROM public.company_members
      WHERE user_id=auth.uid() AND status='active'
      UNION
      SELECT a.scope_id FROM public.platform_role_assignments a
      JOIN public.platform_custom_roles r ON r.id=a.role_id
      WHERE a.user_id=auth.uid() AND r.scope='company'
      UNION
      SELECT l.company_id FROM public.platform_role_assignments a
      JOIN public.platform_custom_roles r ON r.id=a.role_id
      JOIN public.firm_client_links l ON l.firm_id=a.scope_id
      JOIN public.firm_members m ON m.firm_id=l.firm_id AND m.user_id=a.user_id
      WHERE a.user_id=auth.uid() AND r.scope='firm' AND l.revoked_at IS NULL
      UNION
      SELECT g.company_id FROM public.firm_client_access_grants g
      JOIN public.firm_client_links l ON l.firm_id=g.firm_id AND l.company_id=g.company_id
      JOIN public.firms f ON f.id=g.firm_id AND f.status='active'
      JOIN public.firm_members m ON m.firm_id=g.firm_id AND m.user_id=g.user_id
      WHERE g.user_id=auth.uid() AND g.revoked_at IS NULL AND l.revoked_at IS NULL
    ), rows AS (
      SELECT c.id,c.name,c.legal_name,c.country_code,c.base_currency,
        c.fiscal_year_end_month,c.fiscal_year_end_day,c.timezone,c.is_demo,c.archived_at,
        c.locale,c.date_format,
        EXISTS (SELECT 1 FROM public.firm_client_access_grants fg
          JOIN public.firm_client_links fl ON fl.firm_id=fg.firm_id AND fl.company_id=fg.company_id
          JOIN public.firms ff ON ff.id=fg.firm_id AND ff.status='active'
          WHERE fg.company_id=c.id AND fg.user_id=auth.uid() AND fg.revoked_at IS NULL
            AND fl.revoked_at IS NULL) AS firm_access,
        coalesce(
          (SELECT cm.role::text FROM public.company_members cm
            WHERE cm.company_id=c.id AND cm.user_id=auth.uid() AND cm.status='active'),
          (SELECT g.role FROM public.firm_client_access_grants g
            WHERE g.company_id=c.id AND g.user_id=auth.uid() AND g.revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM public.firms f WHERE f.id=g.firm_id AND f.status='active')
              AND EXISTS (SELECT 1 FROM public.firm_client_links l
                WHERE l.firm_id=g.firm_id AND l.company_id=g.company_id AND l.revoked_at IS NULL)
            ORDER BY g.created_at,g.firm_id LIMIT 1),
          'read_only'
        ) AS role,
        ARRAY(SELECT DISTINCT p.permission FROM public.role_permissions p
          WHERE public.has_company_permission(c.id,p.permission) ORDER BY p.permission) AS permissions
      FROM public.companies c JOIN candidate x ON x.id=c.id
      WHERE c.archived_at IS NULL AND public.is_company_member(c.id)
      ORDER BY c.is_demo,c.name,c.id
    )
    SELECT coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) FROM rows
  );
END $$;

DROP POLICY IF EXISTS "Firm members view links" ON public.firm_client_links;
DROP POLICY IF EXISTS "Firm members view assigned links" ON public.firm_client_links;
CREATE POLICY "Firm members view assigned links" ON public.firm_client_links FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
      WHERE cm.company_id=firm_client_links.company_id AND cm.user_id=auth.uid() AND cm.status='active')
    OR (public.is_firm_admin(firm_id) AND revoked_at IS NULL
      AND EXISTS (SELECT 1 FROM public.firms f WHERE f.id=firm_id AND f.status='active'))
    OR EXISTS (SELECT 1 FROM public.firm_client_access_grants g
      JOIN public.firms f ON f.id=g.firm_id AND f.status='active'
      WHERE firm_client_links.revoked_at IS NULL
        AND g.firm_id = firm_client_links.firm_id AND g.company_id = firm_client_links.company_id
        AND g.user_id = auth.uid() AND g.revoked_at IS NULL)
  );

DROP POLICY IF EXISTS firm_client_access_grants_read ON public.firm_client_access_grants;
CREATE POLICY firm_client_access_grants_read ON public.firm_client_access_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_firm_admin(firm_id) OR EXISTS (
    SELECT 1 FROM public.company_members cm WHERE cm.company_id=firm_client_access_grants.company_id
      AND cm.user_id=auth.uid() AND cm.status='active'));
DROP POLICY IF EXISTS firm_client_access_grants_manage ON public.firm_client_access_grants;
DROP POLICY IF EXISTS firm_client_access_grants_insert ON public.firm_client_access_grants;
DROP POLICY IF EXISTS firm_client_access_grants_update ON public.firm_client_access_grants;
DROP POLICY IF EXISTS firm_client_access_grants_delete ON public.firm_client_access_grants;
CREATE POLICY firm_client_access_grants_insert ON public.firm_client_access_grants FOR INSERT TO authenticated
  WITH CHECK (public.is_firm_admin(firm_id) AND granted_by=auth.uid() AND revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM public.firm_client_links l
    JOIN public.firms f ON f.id = l.firm_id AND f.status = 'active'
    JOIN public.firm_members target ON target.firm_id = l.firm_id AND target.user_id = firm_client_access_grants.user_id
    WHERE l.firm_id = firm_client_access_grants.firm_id AND l.company_id = firm_client_access_grants.company_id
      AND l.revoked_at IS NULL));
CREATE POLICY firm_client_access_grants_update ON public.firm_client_access_grants FOR UPDATE TO authenticated
  USING (public.is_firm_admin(firm_id) AND EXISTS (SELECT 1 FROM public.firm_client_links l
    JOIN public.firms f ON f.id = l.firm_id AND f.status = 'active'
    JOIN public.firm_members target ON target.firm_id = l.firm_id AND target.user_id = firm_client_access_grants.user_id
    WHERE l.firm_id = firm_client_access_grants.firm_id AND l.company_id = firm_client_access_grants.company_id
      AND l.revoked_at IS NULL))
  WITH CHECK (public.is_firm_admin(firm_id) AND EXISTS (
    SELECT 1 FROM public.firm_client_links l
    JOIN public.firms f ON f.id = l.firm_id AND f.status = 'active'
    JOIN public.firm_members target ON target.firm_id = l.firm_id AND target.user_id = firm_client_access_grants.user_id
    WHERE l.firm_id = firm_client_access_grants.firm_id AND l.company_id = firm_client_access_grants.company_id
      AND l.revoked_at IS NULL));
CREATE POLICY firm_client_access_grants_delete ON public.firm_client_access_grants FOR DELETE TO authenticated
  USING (public.is_firm_admin(firm_id));

DROP POLICY IF EXISTS firm_client_permission_requests_read ON public.firm_client_permission_requests;
CREATE POLICY firm_client_permission_requests_read ON public.firm_client_permission_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id=firm_client_permission_requests.company_id
      AND cm.user_id=auth.uid() AND cm.status='active') OR user_id = auth.uid() OR public.is_firm_admin(firm_id));
DROP POLICY IF EXISTS firm_client_permission_requests_create ON public.firm_client_permission_requests;
CREATE POLICY firm_client_permission_requests_create ON public.firm_client_permission_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_firm_admin(firm_id) AND requested_by = auth.uid() AND status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL
    AND EXISTS (SELECT 1 FROM public.firm_client_access_grants g
      JOIN public.firm_client_links l ON l.firm_id = g.firm_id AND l.company_id = g.company_id
      WHERE g.firm_id = firm_client_permission_requests.firm_id
        AND g.company_id = firm_client_permission_requests.company_id
        AND g.user_id = firm_client_permission_requests.user_id AND l.revoked_at IS NULL));
DROP POLICY IF EXISTS firm_client_permission_requests_review ON public.firm_client_permission_requests;
CREATE POLICY firm_client_permission_requests_review ON public.firm_client_permission_requests FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id,'members.manage'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_company_permission(company_id,'members.manage')
    AND reviewed_by = auth.uid() AND reviewed_at IS NOT NULL AND status IN ('approved','rejected','revoked'));

CREATE OR REPLACE FUNCTION public.manage_practice_client(_firm_id uuid,_company_id uuid,_access text,_revoke boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE link public.firm_client_links; target_role text; grant_count integer;
BEGIN
  _revoke := coalesce(_revoke,false);
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.is_firm_admin(_firm_id) THEN
    RAISE EXCEPTION 'Firm admin access required' USING ERRCODE='42501';
  END IF;
  IF NOT _revoke AND NOT public.has_company_permission(_company_id,'company.settings.edit') THEN
    RAISE EXCEPTION 'Client administrator authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text,17));
  SELECT * INTO link FROM public.firm_client_links
    WHERE firm_id=_firm_id AND company_id=_company_id FOR UPDATE;
  IF _revoke THEN
    IF link.id IS NULL THEN RAISE EXCEPTION 'Client link not found'; END IF;
    IF link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('removed',0,'retained',0); END IF;
    UPDATE public.firm_client_links SET revoked_at=now() WHERE id=link.id;
    UPDATE public.firm_client_access_grants SET revoked_at=now(),updated_at=now()
      WHERE firm_id=_firm_id AND company_id=_company_id AND revoked_at IS NULL;
    UPDATE public.firm_client_permission_requests SET status='revoked',reviewed_by=auth.uid(),reviewed_at=now(),
      review_reason='Client disconnected the firm'
      WHERE firm_id=_firm_id AND company_id=_company_id AND status='pending';
    INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
      VALUES(_company_id,auth.uid(),'firm.client_revoke','firm_client_link',link.id,
        jsonb_build_object('firm_id',_firm_id,'access_revoked_immediately',true));
    RETURN jsonb_build_object('removed',1,'retained',0);
  END IF;
  IF _access IS NULL OR _access NOT IN ('view','bookkeep','full') THEN RAISE EXCEPTION 'Invalid access level'; END IF;
  IF link.id IS NOT NULL AND link.revoked_at IS NULL AND link.access_level::text<>_access THEN
    RAISE EXCEPTION 'Revoke the existing link before changing its access level';
  END IF;
  target_role := CASE _access WHEN 'view' THEN 'read_only' WHEN 'bookkeep' THEN 'bookkeeper' ELSE 'accountant' END;
  INSERT INTO public.firm_client_links(firm_id,company_id,access_level,linked_by,revoked_at)
    VALUES(_firm_id,_company_id,_access::public.firm_access_level,auth.uid(),NULL)
    ON CONFLICT(firm_id,company_id) DO UPDATE
      SET access_level=excluded.access_level,linked_by=excluded.linked_by,revoked_at=NULL
    RETURNING * INTO link;
  INSERT INTO public.firm_client_access_grants(firm_id,company_id,user_id,role,granted_by,revoked_at)
    VALUES(_firm_id,_company_id,auth.uid(),target_role,auth.uid(),NULL)
    ON CONFLICT(firm_id,company_id,user_id) DO UPDATE SET role=excluded.role,
      granted_by=excluded.granted_by,revoked_at=NULL,updated_at=now();
  GET DIAGNOSTICS grant_count = ROW_COUNT;
  PERFORM public.record_audit_event(_company_id,'firm.client_link','firm_client_link',link.id,
    jsonb_build_object('firm_id',_firm_id,'delegated_grants',grant_count,'access_level',_access));
  RETURN jsonb_build_object('id',link.id,'created',grant_count);
END $$;
REVOKE ALL ON FUNCTION public.manage_practice_client(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_practice_client(uuid,uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.firm_client_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE elevated text[] := ARRAY['accounting.post','sales.draft','purchases.draft','expenses.submit',
  'banking.feeds.manage','banking.reconcile','members.manage','company.settings.edit','billing.manage','tax.settings'];
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.firm_id IS DISTINCT FROM OLD.firm_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.permission_keys IS DISTINCT FROM OLD.permission_keys
    OR NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.request_reason IS DISTINCT FROM OLD.request_reason
    OR OLD.status <> 'pending' OR NEW.status NOT IN ('approved','rejected','revoked')
    OR NEW.reviewed_by = NEW.requested_by
  ) THEN RAISE EXCEPTION 'Only a client may review a pending access request' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'INSERT' AND NOT (NEW.permission_keys <@ elevated) THEN
    RAISE EXCEPTION 'Requests may contain only elevated permissions' USING ERRCODE='22023';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.requested_by <> auth.uid() THEN
    RAISE EXCEPTION 'Request actor must match the signed-in user' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS firm_client_request_guard ON public.firm_client_permission_requests;
CREATE TRIGGER firm_client_request_guard BEFORE INSERT OR UPDATE ON public.firm_client_permission_requests
  FOR EACH ROW EXECUTE FUNCTION private.firm_client_request_guard();
REVOKE ALL ON FUNCTION private.firm_client_request_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.firm_client_access_event_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Firm client access logs are append-only' USING ERRCODE='55000'; END $$;
DROP TRIGGER IF EXISTS firm_client_access_events_immutable ON public.firm_client_access_events;
CREATE TRIGGER firm_client_access_events_immutable BEFORE UPDATE OR DELETE ON public.firm_client_access_events
  FOR EACH ROW EXECUTE FUNCTION private.firm_client_access_event_immutable();
REVOKE ALL ON FUNCTION private.firm_client_access_event_immutable() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS firm_client_access_events_read ON public.firm_client_access_events;
CREATE POLICY firm_client_access_events_read ON public.firm_client_access_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id=firm_client_access_events.company_id
      AND cm.user_id=auth.uid() AND cm.status='active') OR public.is_firm_admin(firm_id));

CREATE OR REPLACE FUNCTION public.record_firm_client_access(_company_id uuid, _module_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _module_key !~ '^[a-z][a-z0-9_.-]{0,63}$' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Invalid access event' USING ERRCODE='22023';
  END IF;
  IF NOT private.firm_client_staff_permission(_company_id,'company.view') THEN RETURN false; END IF;
  INSERT INTO public.firm_client_access_events(firm_id,company_id,user_id,module_key)
  SELECT g.firm_id,g.company_id,auth.uid(),_module_key
  FROM public.firm_client_access_grants g
  JOIN public.firm_client_links l ON l.firm_id=g.firm_id AND l.company_id=g.company_id AND l.revoked_at IS NULL
  JOIN public.firms f ON f.id=g.firm_id AND f.status='active'
  WHERE g.company_id=_company_id AND g.user_id=auth.uid() AND g.revoked_at IS NULL;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.record_firm_client_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_firm_client_access(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.firm_client_access_log(_company_id uuid)
RETURNS TABLE(user_id uuid,user_name text,module_key text,accessed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.user_id,coalesce(nullif(p.full_name,''),'Firm staff'),e.module_key,e.accessed_at
  FROM public.firm_client_access_events e
  LEFT JOIN public.profiles p ON p.id=e.user_id
  WHERE e.company_id=_company_id AND EXISTS (SELECT 1 FROM public.company_members cm
    WHERE cm.company_id=_company_id AND cm.user_id=auth.uid() AND cm.status='active')
  ORDER BY e.accessed_at DESC,e.id DESC LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.firm_client_access_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firm_client_access_log(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.firm_client_pending_requests(_company_id uuid)
RETURNS TABLE(id uuid,firm_name text,staff_name text,permission_keys text[],request_reason text,requested_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.id,f.name,coalesce(nullif(p.full_name,''),'Firm staff'),r.permission_keys,r.request_reason,r.created_at
  FROM public.firm_client_permission_requests r
  JOIN public.firms f ON f.id=r.firm_id
  LEFT JOIN public.profiles p ON p.id=r.user_id
  WHERE r.company_id=_company_id AND r.status='pending'
    AND public.has_company_permission(_company_id,'members.manage')
  ORDER BY r.created_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.firm_client_pending_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firm_client_pending_requests(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.firm_client_connections(_company_id uuid)
RETURNS TABLE(firm_id uuid,firm_name text,linked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.firm_id,f.name,l.created_at
  FROM public.firm_client_links l JOIN public.firms f ON f.id=l.firm_id
  WHERE l.company_id=_company_id AND l.revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id=_company_id
      AND cm.user_id=auth.uid() AND cm.status='active')
  ORDER BY f.name;
$$;
REVOKE ALL ON FUNCTION public.firm_client_connections(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firm_client_connections(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.disconnect_firm_client(_firm_id uuid,_company_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.firm_client_links;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.company_members cm
      WHERE cm.company_id=_company_id AND cm.user_id=auth.uid() AND cm.status='active')
    OR NOT public.has_company_permission(_company_id,'company.settings.edit') THEN
    RAISE EXCEPTION 'Client administrator authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text,17));
  UPDATE public.firm_client_links SET revoked_at=now()
    WHERE firm_id=_firm_id AND company_id=_company_id AND revoked_at IS NULL
    RETURNING * INTO target;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.firm_client_access_grants SET revoked_at=now(),updated_at=now()
    WHERE firm_id=_firm_id AND company_id=_company_id AND revoked_at IS NULL;
  UPDATE public.firm_client_permission_requests SET status='revoked',reviewed_by=auth.uid(),reviewed_at=now(),
    review_reason='Client disconnected the firm'
    WHERE firm_id=_firm_id AND company_id=_company_id AND status='pending';
  INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
    VALUES(_company_id,auth.uid(),'firm.client_disconnect','firm_client_link',target.id,
      jsonb_build_object('firm_id',_firm_id,'access_revoked_immediately',true));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.disconnect_firm_client(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_firm_client(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.firm_client_portfolio(_firm_id uuid)
RETURNS TABLE(company_id uuid, company_name text, access_level text, role text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT l.company_id, c.name, l.access_level::text, g.role
  FROM public.firm_client_links l
  JOIN public.companies c ON c.id = l.company_id
  LEFT JOIN public.firm_client_access_grants g
    ON g.firm_id = l.firm_id AND g.company_id = l.company_id AND g.user_id = auth.uid()
      AND g.revoked_at IS NULL
  WHERE l.firm_id = _firm_id AND l.revoked_at IS NULL AND public.is_firm_member(_firm_id)
    AND (public.is_firm_admin(_firm_id) OR g.user_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.firms f WHERE f.id = _firm_id AND f.status = 'active')
  ORDER BY c.name;
$$;
REVOKE ALL ON FUNCTION public.firm_client_portfolio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firm_client_portfolio(uuid) TO authenticated;

-- Explicitly track who pays for each subscription. A firm cannot become payer until
-- the client administrator records consent; access checks do not depend on payer.
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS payer_kind text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS payer_firm_id uuid REFERENCES public.firms(id) ON DELETE RESTRICT;
DO $$ BEGIN
  ALTER TABLE public.company_subscriptions ADD CONSTRAINT company_subscriptions_payer_shape
    CHECK ((payer_kind = 'client' AND payer_firm_id IS NULL)
        OR (payer_kind = 'firm' AND payer_firm_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.firm_subscription_payer_consents (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  accepted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  PRIMARY KEY (firm_id, company_id),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
ALTER TABLE public.firm_subscription_payer_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_subscription_payer_consents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.firm_subscription_payer_consents TO authenticated;
DROP POLICY IF EXISTS firm_subscription_payer_consents_client_read ON public.firm_subscription_payer_consents;
CREATE POLICY firm_subscription_payer_consents_client_read ON public.firm_subscription_payer_consents FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) OR public.is_firm_admin(firm_id));
DROP POLICY IF EXISTS firm_subscription_payer_consents_client_manage ON public.firm_subscription_payer_consents;
CREATE POLICY firm_subscription_payer_consents_client_manage ON public.firm_subscription_payer_consents FOR ALL TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id,'company.settings.edit'))
  WITH CHECK (public.is_company_member(company_id) AND public.has_company_permission(company_id,'company.settings.edit')
    AND accepted_by = auth.uid());

CREATE OR REPLACE FUNCTION private.guard_subscription_payer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.payer_kind = 'firm' AND NOT EXISTS (
    SELECT 1 FROM public.firm_subscription_payer_consents c
    JOIN public.firm_client_links l ON l.firm_id = c.firm_id AND l.company_id = c.company_id
    JOIN public.firms f ON f.id = c.firm_id AND f.status = 'active'
    WHERE c.company_id = NEW.company_id AND c.firm_id = NEW.payer_firm_id
      AND c.revoked_at IS NULL AND l.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Client approval and an active firm link are required for firm-paid subscriptions' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.payer_kind, OLD.payer_firm_id) IS DISTINCT FROM (NEW.payer_kind, NEW.payer_firm_id) THEN
    INSERT INTO billing.subscription_events(company_id, event_type, source, actor_user_id, details)
    VALUES(NEW.company_id, 'updated', CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'customer' END,
      auth.uid(), jsonb_build_object('payerFrom', OLD.payer_kind, 'payerTo', NEW.payer_kind,
        'firmFrom', OLD.payer_firm_id, 'firmTo', NEW.payer_firm_id, 'accessPreserved', true));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_subscription_payer_guard ON public.company_subscriptions;
CREATE TRIGGER company_subscription_payer_guard BEFORE INSERT OR UPDATE OF payer_kind, payer_firm_id
  ON public.company_subscriptions FOR EACH ROW EXECUTE FUNCTION private.guard_subscription_payer();
REVOKE ALL ON FUNCTION private.guard_subscription_payer() FROM PUBLIC, anon, authenticated;

-- Firm pricing tiers remain owner-configured; no discount is assumed or seeded.
CREATE TABLE IF NOT EXISTS billing.firm_partner_tiers (
  tier_code text PRIMARY KEY CHECK (tier_code ~ '^[a-z][a-z0-9_-]{1,31}$'),
  minimum_active_paid_clients integer NOT NULL UNIQUE CHECK (minimum_active_paid_clients >= 0),
  discount_bps integer NOT NULL CHECK (discount_bps BETWEEN 0 AND 10000),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing.firm_partner_tiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.firm_partner_tiers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_firm_partner_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  NEW.updated_at := now();
  IF NEW.updated_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'updated_by must be the current owner' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS firm_partner_tiers_guard ON billing.firm_partner_tiers;
CREATE TRIGGER firm_partner_tiers_guard BEFORE INSERT OR UPDATE ON billing.firm_partner_tiers
  FOR EACH ROW EXECUTE FUNCTION private.guard_firm_partner_tier();
REVOKE ALL ON FUNCTION private.guard_firm_partner_tier() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION billing.set_firm_partner_tier(
  _tier_code text, _minimum_active_paid_clients integer, _discount_bps integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  INSERT INTO billing.firm_partner_tiers(tier_code,minimum_active_paid_clients,discount_bps,updated_by)
  VALUES(_tier_code,_minimum_active_paid_clients,_discount_bps,auth.uid())
  ON CONFLICT(tier_code) DO UPDATE SET
    minimum_active_paid_clients=excluded.minimum_active_paid_clients,
    discount_bps=excluded.discount_bps,updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION billing.set_firm_partner_tier(text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION billing.set_firm_partner_tier(text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION billing.firm_partner_tier_admin_list()
RETURNS TABLE(tier_code text,minimum_active_paid_clients integer,discount_bps integer,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  RETURN QUERY SELECT t.tier_code,t.minimum_active_paid_clients,t.discount_bps,t.updated_at
    FROM billing.firm_partner_tiers t ORDER BY t.minimum_active_paid_clients,t.tier_code;
END $$;
REVOKE ALL ON FUNCTION billing.firm_partner_tier_admin_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION billing.firm_partner_tier_admin_list() TO authenticated;

-- Public-schema RPC wrappers are required because the billing schema is intentionally not exposed
-- through the Supabase Data API.
CREATE OR REPLACE FUNCTION public.firm_partner_tier_admin_list()
RETURNS TABLE(tier_code text,minimum_active_paid_clients integer,discount_bps integer,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM billing.firm_partner_tier_admin_list();
$$;
REVOKE ALL ON FUNCTION public.firm_partner_tier_admin_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firm_partner_tier_admin_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_firm_partner_tier(
  _tier_code text, _minimum_active_paid_clients integer, _discount_bps integer
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT billing.set_firm_partner_tier(_tier_code,_minimum_active_paid_clients,_discount_bps);
$$;
REVOKE ALL ON FUNCTION public.set_firm_partner_tier(text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_firm_partner_tier(text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION billing.firm_partner_tier_summary(_firm_id uuid)
RETURNS TABLE(active_paid_clients bigint, tier_code text, discount_bps integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH active_clients AS (
    SELECT DISTINCT l.company_id
    FROM public.firm_client_links l
    JOIN public.firms f ON f.id = l.firm_id AND f.status = 'active'
    JOIN public.company_subscriptions s ON s.company_id = l.company_id AND s.status = 'active'
      AND coalesce(s.unit_amount_minor,0) > 0
    JOIN public.company_members cm ON cm.company_id = l.company_id AND cm.status = 'active'
    JOIN auth.users u ON u.id = cm.user_id AND u.last_sign_in_at >= now() - interval '120 days'
    WHERE l.firm_id = _firm_id AND l.revoked_at IS NULL
      -- Activity by the bookkeeping firm itself must not keep a dormant client active.
      AND NOT EXISTS (SELECT 1 FROM public.firm_members fm
        WHERE fm.firm_id = l.firm_id AND fm.user_id = cm.user_id)
  ), count_clients AS (SELECT count(*) AS n FROM active_clients), tier AS (
    SELECT t.tier_code, t.discount_bps FROM billing.firm_partner_tiers t, count_clients c
    WHERE t.minimum_active_paid_clients <= c.n ORDER BY t.minimum_active_paid_clients DESC LIMIT 1
  )
  SELECT c.n, t.tier_code, t.discount_bps FROM count_clients c LEFT JOIN tier t ON true
  WHERE auth.uid() IS NOT NULL AND private.customer_access_ok() AND public.is_firm_admin(_firm_id);
$$;
REVOKE ALL ON FUNCTION billing.firm_partner_tier_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION billing.firm_partner_tier_summary(uuid) TO authenticated;
