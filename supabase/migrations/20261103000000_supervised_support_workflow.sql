-- UNAPPLIED HOSTED. Requires reviewed backup/restore evidence before hosted application.
-- Generated with `supabase migration new supervised_support_workflow`, then ordered after
-- Cursor's published 20261102610000 migration (invalid wall-clock hour; never rewrite history).
-- Existing approval_requests, platform_support_grants and platform_audit remain authoritative.
ALTER TABLE public.break_glass_grants
  ADD COLUMN approval_id uuid UNIQUE REFERENCES public.approval_requests(id),
  ADD COLUMN support_grant_id uuid UNIQUE REFERENCES public.platform_support_grants(id);
ALTER TABLE public.platform_support_grants
  ADD COLUMN approval_request_id uuid REFERENCES public.approval_requests(id);
CREATE UNIQUE INDEX platform_support_one_approval ON public.platform_support_grants(approval_request_id)
  WHERE approval_request_id IS NOT NULL;
ALTER TABLE public.break_glass_events ADD COLUMN actor_id uuid, ADD COLUMN event_reason text;
ALTER TABLE public.break_glass_events DROP CONSTRAINT break_glass_events_action_check;
ALTER TABLE public.break_glass_events ADD CONSTRAINT break_glass_events_action_check
  CHECK(action IN ('requested','approved','rejected','expired','revoked','read'));

-- A direct legacy support.grant call cannot create or reactivate access without approval.
CREATE FUNCTION private.require_support_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.revoked_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.approval_requests a
    JOIN public.break_glass_grants g ON g.approval_id = a.id
    WHERE a.id = NEW.approval_request_id AND a.kind = 'break_glass' AND a.status = 'approved'
      AND a.requester_id = NEW.user_id AND a.decided_by IS DISTINCT FROM a.requester_id
      AND a.decided_by IS NOT NULL AND a.expires_at = NEW.expires_at AND a.expires_at > now()
      AND g.company_id = NEW.company_id AND g.requester_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A separate approved support request is required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.require_support_approval() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER support_approval_required BEFORE INSERT OR UPDATE ON public.platform_support_grants
  FOR EACH ROW EXECUTE FUNCTION private.require_support_approval();

CREATE FUNCTION private.request_supervised_support(_company_id uuid, _reason text, _expires_at timestamptz, _request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE gid uuid := coalesce(_request_id, gen_random_uuid()); aid uuid; old public.break_glass_grants%ROWTYPE;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason, ''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Record a reason of 3 to 1000 characters'; END IF;
  IF _expires_at IS NULL OR _expires_at <= now() OR _expires_at > now() + interval '4 hours' THEN
    RAISE EXCEPTION 'Support access must expire within four hours';
  END IF;
  -- Serialize every state transition for a business, including concurrent request/decision.
  PERFORM 1 FROM public.companies WHERE id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That business was not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_tenant_controls WHERE company_id = _company_id AND status <> 'active') THEN
    RAISE EXCEPTION 'Support access requires an active business';
  END IF;
  SELECT * INTO old FROM public.break_glass_grants WHERE id = gid;
  IF FOUND THEN
    IF old.company_id = _company_id AND old.requester_id = auth.uid() AND old.reason = trim(_reason)
       AND old.expires_at = _expires_at AND old.approval_id IS NOT NULL THEN RETURN gid; END IF;
    RAISE EXCEPTION 'Request identifier already used';
  END IF;
  -- Expired pending requests must not permanently block future requests.
  FOR old IN SELECT * FROM public.break_glass_grants WHERE company_id = _company_id
    AND status IN ('pending','active') AND expires_at <= now() FOR UPDATE LOOP
    UPDATE public.approval_requests SET status = 'expired' WHERE id = old.approval_id AND status = 'pending';
    UPDATE public.platform_support_grants SET revoked_at = now() WHERE id = old.support_grant_id AND revoked_at IS NULL;
    UPDATE public.break_glass_grants SET status = 'expired' WHERE id = old.id;
    INSERT INTO public.break_glass_events(grant_id,company_id,action,actor_id,event_reason) VALUES(old.id,_company_id,'expired',auth.uid(),'Access reached its expiry');
    PERFORM private.platform_log('break_glass.expire','company',_company_id::text,to_jsonb(old),
      jsonb_build_object('status','expired'),'Access reached its expiry');
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.break_glass_grants WHERE company_id = _company_id
    AND status IN ('pending', 'active') AND expires_at > now()) THEN RAISE EXCEPTION 'That business already has break-glass access'; END IF;
  INSERT INTO public.approval_requests(kind, status, requester_id, reason, impact, payload, expires_at)
    VALUES ('break_glass', 'pending', auth.uid(), trim(_reason),
      jsonb_build_object('companyId', _company_id, 'scope', 'journal diagnostic headers', 'readOnly', true),
      jsonb_build_object('grantId', gid, 'companyId', _company_id), _expires_at) RETURNING id INTO aid;
  INSERT INTO public.break_glass_grants(id, company_id, requester_id, status, reason, expires_at, approval_id)
    VALUES(gid, _company_id, auth.uid(), 'pending', trim(_reason), _expires_at, aid);
  INSERT INTO public.break_glass_events(grant_id, company_id, action, actor_id,event_reason) VALUES(gid, _company_id, 'requested', auth.uid(),trim(_reason));
  PERFORM private.platform_log('break_glass.request','company',_company_id::text,NULL,
    jsonb_build_object('grant',gid,'approval',aid,'expiresAt',_expires_at,'scope','journal diagnostic headers'),trim(_reason));
  RETURN gid;
END $$;

-- Preserve entitlement behavior; unsupported kinds fail instead of claiming a successful approval.
CREATE OR REPLACE FUNCTION public.platform_decide_approval(_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.approval_requests%ROWTYPE; g public.break_glass_grants%ROWTYPE; oid uuid; sid uuid; cid uuid;
BEGIN
  PERFORM private.require_platform('approvals.manage');
  IF _decision IS NULL OR _decision NOT IN ('approved','rejected') OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Record an approve or reject decision and a reason'; END IF;
  -- Company lock first, matching request/revoke/expire. Approval rows never lock a company in reverse order.
  SELECT (payload->>'companyId')::uuid INTO cid FROM public.approval_requests WHERE id = _id AND kind = 'break_glass';
  IF cid IS NOT NULL THEN PERFORM 1 FROM public.companies WHERE id = cid FOR UPDATE; END IF;
  SELECT * INTO r FROM public.approval_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' OR r.expires_at <= now() THEN RAISE EXCEPTION 'That approval is no longer pending'; END IF;
  IF r.requester_id = auth.uid() THEN RAISE EXCEPTION 'A second person must decide this request'; END IF;
  IF _decision = 'approved' AND r.kind NOT IN ('entitlement','break_glass') THEN
    RAISE EXCEPTION 'This request type has no executable approval handler'; END IF;
  IF r.kind = 'break_glass' THEN
    SELECT * INTO g FROM public.break_glass_grants WHERE approval_id = r.id FOR UPDATE;
    IF NOT FOUND OR g.status <> 'pending' OR g.expires_at <> r.expires_at OR g.company_id IS DISTINCT FROM cid OR g.requester_id <> r.requester_id THEN
      RAISE EXCEPTION 'That support request is no longer pending'; END IF;
    IF _decision = 'approved' AND (g.expires_at > now() + interval '4 hours' OR EXISTS (
      SELECT 1 FROM public.platform_tenant_controls WHERE company_id = g.company_id AND status <> 'active')) THEN
      RAISE EXCEPTION 'Support access requires an active business and expiry within four hours'; END IF;
    IF _decision = 'approved' AND EXISTS (SELECT 1 FROM public.break_glass_grants
      WHERE company_id = g.company_id AND id <> g.id AND status = 'active' AND expires_at > now()) THEN
      RAISE EXCEPTION 'That business already has break-glass access'; END IF;
  END IF;
  IF _decision = 'approved' AND r.kind = 'entitlement' THEN
    INSERT INTO public.entitlement_overrides(feature_key,scope,scope_id,plan_code,source,effect,starts_at,expires_at,reason,notes,approval_status,created_by)
    VALUES(r.payload->>'feature',r.payload->>'scope',NULLIF(r.payload->>'scopeId','')::uuid,NULLIF(r.payload->>'planCode',''),
      r.payload->>'source',r.payload->>'effect',NULLIF(r.payload->>'startsAt','')::timestamptz,NULLIF(r.payload->>'expiresAt','')::timestamptz,
      r.reason,coalesce(r.payload->>'notes',''),'approved',r.requester_id) RETURNING id INTO oid;
  END IF;
  UPDATE public.approval_requests SET status = _decision, decided_by = auth.uid(), decision_reason = trim(_reason), decided_at = now() WHERE id = r.id;
  IF r.kind = 'break_glass' THEN
    IF _decision = 'approved' THEN
      INSERT INTO public.platform_support_grants(user_id,company_id,expires_at,reason,approval_request_id)
        VALUES(g.requester_id,g.company_id,g.expires_at,g.reason,r.id) RETURNING id INTO sid;
    END IF;
    UPDATE public.break_glass_grants SET status = CASE WHEN _decision = 'approved' THEN 'active' ELSE 'rejected' END,
      approver_id = auth.uid(), support_grant_id = sid WHERE id = g.id;
    INSERT INTO public.break_glass_events(grant_id,company_id,action,actor_id,event_reason) VALUES(g.id,g.company_id,_decision,auth.uid(),trim(_reason));
    PERFORM private.platform_log('break_glass.decide','company',g.company_id::text,to_jsonb(g),
      jsonb_build_object('decision',_decision,'supportGrant',sid),trim(_reason));
  END IF;
  PERFORM private.platform_log('approval.decide','approval',r.id::text,jsonb_build_object('status','pending'),
    jsonb_build_object('status',_decision,'override',oid,'supportGrant',sid),trim(_reason));
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.platform_request_break_glass(_company_id uuid, _reason text, _expires_at timestamptz, _request_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.request_supervised_support(_company_id,_reason,_expires_at,_request_id);
$$;
CREATE OR REPLACE FUNCTION public.platform_decide_break_glass(_grant_id uuid, _decision text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE aid uuid;
BEGIN
  PERFORM private.require_platform('approvals.manage');
  SELECT approval_id INTO aid FROM public.break_glass_grants WHERE id = _grant_id;
  IF aid IS NULL THEN RAISE EXCEPTION 'Legacy request must be replaced with a supervised support request'; END IF;
  PERFORM public.platform_decide_approval(aid,_decision,_reason);
END $$;

CREATE FUNCTION private.close_supervised_support(_grant_id uuid, _reason text, _expire boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.break_glass_grants%ROWTYPE; cid uuid; next_status text;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Record a reason of 3 to 1000 characters'; END IF;
  SELECT company_id INTO cid FROM public.break_glass_grants WHERE id = _grant_id;
  PERFORM 1 FROM public.companies WHERE id = cid FOR UPDATE;
  SELECT * INTO g FROM public.break_glass_grants WHERE id = _grant_id FOR UPDATE;
  IF NOT FOUND OR g.status NOT IN ('active','pending') THEN RAISE EXCEPTION 'That support request is already closed'; END IF;
  IF _expire AND g.expires_at > now() THEN RAISE EXCEPTION 'Support access has not expired'; END IF;
  IF NOT _expire AND auth.uid() IS DISTINCT FROM g.requester_id AND auth.uid() IS DISTINCT FROM g.approver_id
     AND public.platform_role() IS DISTINCT FROM 'platform_owner' THEN RAISE EXCEPTION 'Only the requester, approver or owner can revoke access' USING ERRCODE='42501'; END IF;
  next_status := CASE WHEN _expire THEN 'expired' ELSE 'revoked' END;
  UPDATE public.platform_support_grants SET revoked_at = now() WHERE id = g.support_grant_id AND revoked_at IS NULL;
  UPDATE public.approval_requests SET status = CASE WHEN _expire THEN 'expired' ELSE 'rejected' END,
    decided_by = auth.uid(), decision_reason = trim(_reason), decided_at = now() WHERE id = g.approval_id AND status = 'pending';
  UPDATE public.break_glass_grants SET status = next_status WHERE id = g.id;
  INSERT INTO public.break_glass_events(grant_id,company_id,action,actor_id,event_reason) VALUES(g.id,g.company_id,next_status,auth.uid(),trim(_reason));
  PERFORM private.platform_log('break_glass.'||CASE WHEN _expire THEN 'expire' ELSE 'revoke' END,'company',g.company_id::text,
    to_jsonb(g),jsonb_build_object('status',next_status),trim(_reason));
END $$;
CREATE OR REPLACE FUNCTION public.platform_revoke_break_glass(_grant_id uuid, _reason text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.close_supervised_support(_grant_id,_reason,false); $$;
CREATE OR REPLACE FUNCTION public.platform_expire_break_glass(_grant_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.close_supervised_support(_grant_id,'Access reached its expiry',true); $$;

-- Old direct grants do not retain access after this migration. No ledger policies are broadened.
CREATE OR REPLACE FUNCTION private.platform_support_read(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; gid uuid;
BEGIN
  PERFORM private.require_platform('support.view');
  SELECT g.id INTO gid FROM public.platform_support_grants s
    JOIN public.approval_requests a ON a.id = s.approval_request_id
    JOIN public.break_glass_grants g ON g.support_grant_id = s.id
    WHERE s.user_id = auth.uid() AND s.company_id = _company_id AND s.revoked_at IS NULL AND s.expires_at > now()
      AND a.status = 'approved' AND g.status = 'active' AND g.expires_at > now()
      AND NOT EXISTS (SELECT 1 FROM public.platform_tenant_controls t WHERE t.company_id = _company_id AND t.status <> 'active') LIMIT 1;
  IF gid IS NULL THEN
    RAISE EXCEPTION 'A separate, unexpired support grant is required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) INTO result FROM (
    SELECT id,journal_date,status,source_type FROM public.journals WHERE company_id = _company_id ORDER BY journal_date DESC,id LIMIT 25
  ) j;
  INSERT INTO public.break_glass_events(grant_id,company_id,action,actor_id,event_reason) VALUES(gid,_company_id,'read',auth.uid(),'Read journal diagnostic metadata using support grant');
  PERFORM private.platform_log('support.read','company',_company_id::text,NULL,
    jsonb_build_object('rows',jsonb_array_length(result)),'Read journal diagnostic metadata using support grant');
  RETURN result;
END $$;

CREATE FUNCTION private.supervised_support_list() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('support.view');
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
    SELECT g.id,g.company_id,c.name AS business,g.requester_id,p.full_name AS requester,g.reason,g.expires_at,g.created_at,
      CASE WHEN g.status IN ('pending','active') AND g.expires_at <= now() THEN 'expired'
           WHEN g.status = 'active' AND (s.revoked_at IS NOT NULL OR g.support_grant_id IS NULL) THEN 'revoked' ELSE g.status END AS status,
      g.approval_id,g.approver_id
    FROM public.break_glass_grants g JOIN public.companies c ON c.id=g.company_id
      LEFT JOIN public.profiles p ON p.id=g.requester_id LEFT JOIN public.platform_support_grants s ON s.id=g.support_grant_id
    ORDER BY g.created_at DESC,g.id LIMIT 100
  ) r),'[]'::jsonb);
END $$;
CREATE FUNCTION public.platform_supervised_support_list() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.supervised_support_list(); $$;

CREATE OR REPLACE FUNCTION public.company_break_glass_log(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.platform_session_ok() OR NOT EXISTS (SELECT 1 FROM public.company_members
    WHERE company_id=_company_id AND user_id=auth.uid() AND status='active') THEN
    RAISE EXCEPTION 'Company membership is required' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
    SELECT e.action,e.created_at AS at,e.actor_id,
      coalesce(e.event_reason,CASE WHEN g.approval_id IS NOT NULL THEN g.reason END) AS reason,g.expires_at,
      CASE WHEN g.approval_id IS NOT NULL THEN 'journal diagnostic headers (read only)' ELSE 'legacy request (access not verified)' END AS scope
    FROM public.break_glass_events e JOIN public.break_glass_grants g ON g.id=e.grant_id
    WHERE e.company_id=_company_id ORDER BY e.created_at DESC,e.id LIMIT 100
  ) r),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION private.request_supervised_support(uuid,text,timestamptz,uuid), private.close_supervised_support(uuid,text,boolean), private.supervised_support_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.request_supervised_support(uuid,text,timestamptz,uuid), private.close_supervised_support(uuid,text,boolean), private.supervised_support_list() TO authenticated;
REVOKE ALL ON FUNCTION public.platform_request_break_glass(uuid,text,timestamptz,uuid), public.platform_decide_break_glass(uuid,text,text), public.platform_decide_approval(uuid,text,text), public.platform_revoke_break_glass(uuid,text), public.platform_expire_break_glass(uuid), public.platform_supervised_support_list(), public.company_break_glass_log(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_request_break_glass(uuid,text,timestamptz,uuid), public.platform_decide_break_glass(uuid,text,text), public.platform_decide_approval(uuid,text,text), public.platform_revoke_break_glass(uuid,text), public.platform_expire_break_glass(uuid), public.platform_supervised_support_list(), public.company_break_glass_log(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.platform_support_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.platform_support_read(uuid) TO authenticated;

-- Legacy pending/active rows cannot be approved by this workflow and may have
-- unbounded expiry. Retain them as closed history so they cannot block a replacement.
-- The migration actor is unknown (NULL), never attributed to a customer or staff user.
DO $$ DECLARE g public.break_glass_grants%ROWTYPE;
BEGIN
  FOR g IN SELECT * FROM public.break_glass_grants WHERE approval_id IS NULL AND status IN ('pending','active') FOR UPDATE LOOP
    UPDATE public.break_glass_grants SET status='revoked' WHERE id=g.id;
    INSERT INTO public.break_glass_events(grant_id,company_id,action,event_reason)
      VALUES(g.id,g.company_id,'revoked','Legacy request superseded by supervised approval workflow');
    PERFORM private.platform_log('break_glass.revoke','company',g.company_id::text,to_jsonb(g),
      jsonb_build_object('status','revoked'),'Legacy request superseded by supervised approval workflow');
  END LOOP;
END $$;
