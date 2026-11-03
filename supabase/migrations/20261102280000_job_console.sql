-- READY-TO-APPLY. Not applied. Records a queued job. It does not run SQL from the job name.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_enqueue_job(text, text);
--   DROP TABLE IF EXISTS public.platform_jobs;

CREATE TABLE public.platform_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  status text NOT NULL CHECK (status IN ('queued', 'succeeded', 'failed')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_jobs FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_enqueue_job(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF length(trim(coalesce(_name, ''))) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the job and record a reason';
  END IF;
  INSERT INTO public.platform_jobs (name, status, created_by)
  VALUES (trim(_name), 'queued', auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('job.enqueue', 'platform_job', _id::text, NULL,
    jsonb_build_object('status', 'queued', 'executed', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_enqueue_job(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_enqueue_job(text, text) TO authenticated;
