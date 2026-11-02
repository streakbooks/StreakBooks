-- READY-TO-APPLY. Not applied. A sandbox name is requested once. The request does not create a company.
-- Reverse: drop index platform_sandbox_requests_name_key, then reapply
-- public.platform_request_sandbox from 20261102330000_sandbox_requests.sql.

CREATE UNIQUE INDEX platform_sandbox_requests_name_key ON public.platform_sandbox_requests (name);

CREATE OR REPLACE FUNCTION public.platform_request_sandbox(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _clean text;
BEGIN
  PERFORM private.require_platform('businesses.manage');
  _clean := trim(coalesce(_name, ''));
  IF length(_clean) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the sandbox and record a reason';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_sandbox_requests WHERE name = _clean) THEN
    RAISE EXCEPTION 'That sandbox has already been requested';
  END IF;
  BEGIN
    INSERT INTO public.platform_sandbox_requests (name, requested_by)
    VALUES (_clean, auth.uid()) RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That sandbox has already been requested';
  END;
  PERFORM private.platform_log('sandbox.request', 'platform_sandbox_request', _id::text, NULL,
    jsonb_build_object('created', false, 'postingDiffers', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_sandbox(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_sandbox(text, text) TO authenticated;
