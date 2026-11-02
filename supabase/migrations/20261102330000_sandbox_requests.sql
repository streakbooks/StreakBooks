-- READY-TO-APPLY. Not applied. Records a sandbox request. It does not create a company or change posting.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_request_sandbox(text, text);
--   DROP TABLE IF EXISTS public.platform_sandbox_requests;

CREATE TABLE public.platform_sandbox_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_sandbox_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_sandbox_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_request_sandbox(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('businesses.manage');
  IF length(trim(coalesce(_name, ''))) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the sandbox and record a reason';
  END IF;
  INSERT INTO public.platform_sandbox_requests (name, requested_by)
  VALUES (trim(_name), auth.uid()) RETURNING id INTO _id;
  PERFORM private.platform_log('sandbox.request', 'platform_sandbox_request', _id::text, NULL,
    jsonb_build_object('created', false, 'postingDiffers', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_sandbox(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_sandbox(text, text) TO authenticated;
