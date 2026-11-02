-- READY-TO-APPLY. Not applied. Break-glass request, second-person approval, expiry, revoke, and a customer-visible log.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.company_break_glass_log(uuid);
--   DROP FUNCTION IF EXISTS public.platform_revoke_break_glass(uuid, text);
--   DROP FUNCTION IF EXISTS public.platform_expire_break_glass(uuid);
--   DROP FUNCTION IF EXISTS public.platform_decide_break_glass(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.platform_request_break_glass(uuid, text, timestamptz, uuid);
--   DROP TABLE IF EXISTS public.break_glass_events;
--   DROP TABLE IF EXISTS public.break_glass_grants;

CREATE TABLE public.break_glass_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  approver_id uuid,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'expired', 'revoked')),
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.break_glass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.break_glass_grants(id),
  company_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('requested', 'approved', 'rejected', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_glass_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.break_glass_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.break_glass_events FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_request_break_glass(
  _company_id uuid, _reason text, _expires_at timestamptz, _request_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF _expires_at <= now() THEN
    RAISE EXCEPTION 'Break-glass access must expire in the future';
  END IF;
  INSERT INTO public.break_glass_grants (id, company_id, requester_id, status, reason, expires_at)
  VALUES (coalesce(_request_id, gen_random_uuid()), _company_id, auth.uid(), 'pending', trim(_reason), _expires_at)
  RETURNING id INTO _id;
  INSERT INTO public.break_glass_events (grant_id, company_id, action) VALUES (_id, _company_id, 'requested');
  PERFORM private.platform_log('break_glass.request', 'company', _company_id::text, NULL,
    jsonb_build_object('grant', _id), trim(_reason));
  RETURN _id;
END;
$$;

CREATE FUNCTION public.platform_decide_break_glass(_grant_id uuid, _decision text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.break_glass_grants%ROWTYPE;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF _decision NOT IN ('approved', 'rejected') OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record an approve or reject decision and a reason';
  END IF;
  SELECT * INTO _row FROM public.break_glass_grants WHERE id = _grant_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'pending' OR _row.expires_at <= now() THEN
    RAISE EXCEPTION 'That break-glass request is no longer pending';
  END IF;
  IF _row.requester_id = auth.uid() THEN
    RAISE EXCEPTION 'A second person must decide this request';
  END IF;
  UPDATE public.break_glass_grants
  SET status = CASE WHEN _decision = 'approved' THEN 'active' ELSE 'rejected' END, approver_id = auth.uid()
  WHERE id = _grant_id;
  INSERT INTO public.break_glass_events (grant_id, company_id, action)
  VALUES (_grant_id, _row.company_id, CASE WHEN _decision = 'approved' THEN 'approved' ELSE 'rejected' END);
  PERFORM private.platform_log('break_glass.decide', 'company', _row.company_id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', _decision), trim(_reason));
END;
$$;

CREATE FUNCTION public.platform_expire_break_glass(_grant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.break_glass_grants%ROWTYPE;
BEGIN
  PERFORM private.require_platform('support.manage');
  SELECT * INTO _row FROM public.break_glass_grants WHERE id = _grant_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'active' OR _row.expires_at > now() THEN
    RAISE EXCEPTION 'Only active break-glass access past expiry can expire';
  END IF;
  UPDATE public.break_glass_grants SET status = 'expired' WHERE id = _grant_id;
  INSERT INTO public.break_glass_events (grant_id, company_id, action)
  VALUES (_grant_id, _row.company_id, 'expired');
END;
$$;

CREATE FUNCTION public.platform_revoke_break_glass(_grant_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.break_glass_grants%ROWTYPE;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  SELECT * INTO _row FROM public.break_glass_grants WHERE id = _grant_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'active' THEN
    RAISE EXCEPTION 'Only active break-glass access can be revoked';
  END IF;
  IF auth.uid() IS DISTINCT FROM _row.requester_id AND auth.uid() IS DISTINCT FROM _row.approver_id THEN
    RAISE EXCEPTION 'Only the requester or approver can revoke break-glass access';
  END IF;
  UPDATE public.break_glass_grants SET status = 'revoked' WHERE id = _grant_id;
  INSERT INTO public.break_glass_events (grant_id, company_id, action)
  VALUES (_grant_id, _row.company_id, 'revoked');
  PERFORM private.platform_log('break_glass.revoke', 'company', _row.company_id::text,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'revoked'), trim(_reason));
END;
$$;

CREATE FUNCTION public.company_break_glass_log(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Company membership is required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('action', action, 'at', created_at) ORDER BY created_at)
    FROM public.break_glass_events WHERE company_id = _company_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_break_glass(uuid, text, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_break_glass(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_expire_break_glass(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_revoke_break_glass(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_break_glass_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_break_glass(uuid, text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_decide_break_glass(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_expire_break_glass(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_revoke_break_glass(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_break_glass_log(uuid) TO authenticated;
