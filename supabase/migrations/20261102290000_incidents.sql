-- READY-TO-APPLY. Not applied. Incident status and a release note. Nothing is deployed or deleted.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_record_release(text, text);
--   DROP FUNCTION IF EXISTS public.platform_resolve_incident(uuid, text);
--   DROP FUNCTION IF EXISTS public.platform_open_incident(text, text);
--   DROP TABLE IF EXISTS public.platform_releases;
--   DROP TABLE IF EXISTS public.platform_incidents;

CREATE TABLE public.platform_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) >= 3),
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  opened_by uuid NOT NULL,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_incidents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_releases FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_open_incident(_title text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_title, ''))) < 3 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the incident and record a reason';
  END IF;
  INSERT INTO public.platform_incidents (title, status, opened_by)
  VALUES (trim(_title), 'open', auth.uid()) RETURNING id INTO _id;
  PERFORM private.platform_log('incident.open', 'platform_incident', _id::text, NULL,
    jsonb_build_object('status', 'open'), trim(_reason));
  RETURN _id;
END;
$$;

CREATE FUNCTION public.platform_resolve_incident(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  UPDATE public.platform_incidents
  SET status = 'resolved', resolved_by = auth.uid()
  WHERE id = _id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'That incident is no longer open'; END IF;
  PERFORM private.platform_log('incident.resolve', 'platform_incident', _id::text,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'resolved'), trim(_reason));
END;
$$;

CREATE FUNCTION public.platform_record_release(_version text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF _version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Use a numeric version and record a reason';
  END IF;
  INSERT INTO public.platform_releases (version, created_by) VALUES (_version, auth.uid()) RETURNING id INTO _id;
  PERFORM private.platform_log('release.record', 'platform_release', _id::text, NULL,
    jsonb_build_object('version', _version, 'deployed', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_open_incident(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_resolve_incident(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_record_release(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_open_incident(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_resolve_incident(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_record_release(text, text) TO authenticated;
