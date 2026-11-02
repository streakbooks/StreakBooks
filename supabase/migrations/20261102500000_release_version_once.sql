-- READY-TO-APPLY. Not applied. A release version is recorded once. Recording it does not deploy.
-- Reverse: drop index platform_releases_version_key, then reapply
-- public.platform_record_release from 20261102290000_incidents.sql.

CREATE UNIQUE INDEX platform_releases_version_key ON public.platform_releases (version);

CREATE OR REPLACE FUNCTION public.platform_record_release(_version text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF _version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Use a numeric version and record a reason';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_releases WHERE version = _version) THEN
    RAISE EXCEPTION 'That version is already recorded';
  END IF;
  BEGIN
    INSERT INTO public.platform_releases (version, created_by) VALUES (_version, auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That version is already recorded';
  END;
  PERFORM private.platform_log('release.record', 'platform_release', _id::text, NULL,
    jsonb_build_object('version', _version, 'deployed', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_release(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_release(text, text) TO authenticated;
