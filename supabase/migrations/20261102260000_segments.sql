-- READY-TO-APPLY. Not applied. Platform segments for businesses. Contact tags are unchanged.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_tag_company(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS public.platform_create_segment(text, text);
--   DROP TABLE IF EXISTS public.platform_segment_members;
--   DROP TABLE IF EXISTS public.platform_segments;

CREATE TABLE public.platform_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE public.platform_segment_members (
  segment_id uuid NOT NULL REFERENCES public.platform_segments(id),
  company_id uuid NOT NULL,
  PRIMARY KEY (segment_id, company_id)
);

ALTER TABLE public.platform_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_segment_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_segments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_segment_members FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_create_segment(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('businesses.manage');
  IF length(trim(coalesce(_name, ''))) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the segment and record a reason';
  END IF;
  INSERT INTO public.platform_segments (name, created_by) VALUES (trim(_name), auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('segment.create', 'platform_segment', _id::text, NULL,
    jsonb_build_object('name', trim(_name)), trim(_reason));
  RETURN _id;
END;
$$;

CREATE FUNCTION public.platform_tag_company(_segment_id uuid, _company_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.require_platform('businesses.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_segments WHERE id = _segment_id) THEN
    RAISE EXCEPTION 'That segment was not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.platform_segment_members (segment_id, company_id)
  VALUES (_segment_id, _company_id)
  ON CONFLICT DO NOTHING;
  PERFORM private.platform_log('segment.tag', 'company', _company_id::text, NULL,
    jsonb_build_object('segment', _segment_id), trim(_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_segment(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_tag_company(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_segment(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_tag_company(uuid, uuid, text) TO authenticated;
