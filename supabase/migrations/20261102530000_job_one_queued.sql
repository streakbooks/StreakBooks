-- READY-TO-APPLY. Not applied. One queued row per job name. Queueing does not run the job.
-- Reverse: drop index platform_jobs_one_queued, then reapply
-- public.platform_enqueue_job from 20261102280000_job_console.sql.

CREATE UNIQUE INDEX platform_jobs_one_queued
  ON public.platform_jobs (name)
  WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.platform_enqueue_job(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _clean text;
BEGIN
  PERFORM private.require_platform('settings.manage');
  _clean := trim(coalesce(_name, ''));
  IF length(_clean) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the job and record a reason';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_jobs WHERE name = _clean AND status = 'queued'
  ) THEN
    RAISE EXCEPTION 'That job is already queued';
  END IF;
  BEGIN
    INSERT INTO public.platform_jobs (name, status, created_by)
    VALUES (_clean, 'queued', auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That job is already queued';
  END;
  PERFORM private.platform_log('job.enqueue', 'platform_job', _id::text, NULL,
    jsonb_build_object('status', 'queued', 'executed', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_enqueue_job(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_enqueue_job(text, text) TO authenticated;
