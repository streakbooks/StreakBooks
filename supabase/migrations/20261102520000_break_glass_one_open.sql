-- READY-TO-APPLY. Not applied. One open break-glass grant per business.
-- An expired active grant does not block a new request. The customer log stays action and time.
-- Reverse: drop index break_glass_one_pending, then reapply public.platform_request_break_glass
-- from 20261102440000_company_exists_guards.sql and public.platform_decide_break_glass
-- from 20261102190000_break_glass.sql.

CREATE UNIQUE INDEX break_glass_one_pending
  ON public.break_glass_grants (company_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.platform_request_break_glass(
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
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.break_glass_grants
    WHERE company_id = _company_id
      AND (status = 'pending' OR (status = 'active' AND expires_at > now()))
  ) THEN
    RAISE EXCEPTION 'That business already has break-glass access';
  END IF;
  BEGIN
    INSERT INTO public.break_glass_grants (id, company_id, requester_id, status, reason, expires_at)
    VALUES (coalesce(_request_id, gen_random_uuid()), _company_id, auth.uid(), 'pending', trim(_reason), _expires_at)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That business already has break-glass access';
  END;
  INSERT INTO public.break_glass_events (grant_id, company_id, action)
  VALUES (_id, _company_id, 'requested');
  PERFORM private.platform_log('break_glass.request', 'company', _company_id::text, NULL,
    jsonb_build_object('grant', _id), trim(_reason));
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_decide_break_glass(_grant_id uuid, _decision text, _reason text)
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
  IF _decision = 'approved' AND EXISTS (
    SELECT 1 FROM public.break_glass_grants
    WHERE company_id = _row.company_id
      AND id <> _grant_id
      AND status = 'active'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'That business already has break-glass access';
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

REVOKE ALL ON FUNCTION public.platform_request_break_glass(uuid, text, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_break_glass(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_break_glass(uuid, text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_decide_break_glass(uuid, text, text) TO authenticated;
