-- READY-TO-APPLY. Not applied. A duplicate segment name or membership is rejected and is not audited as a new tag.
-- Reverse: reapply public.platform_create_segment and public.platform_tag_company
-- from 20261102260000_segments.sql.

CREATE OR REPLACE FUNCTION public.platform_create_segment(_name text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _clean text;
BEGIN
  PERFORM private.require_platform('businesses.manage');
  _clean := trim(coalesce(_name, ''));
  IF length(_clean) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the segment and record a reason';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_segments WHERE name = _clean) THEN
    RAISE EXCEPTION 'That segment already exists';
  END IF;
  INSERT INTO public.platform_segments (name, created_by) VALUES (_clean, auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('segment.create', 'platform_segment', _id::text, NULL,
    jsonb_build_object('name', _clean), trim(_reason));
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_tag_company(_segment_id uuid, _company_id uuid, _reason text)
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
  IF EXISTS (
    SELECT 1 FROM public.platform_segment_members
    WHERE segment_id = _segment_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'That business is already in this segment';
  END IF;
  INSERT INTO public.platform_segment_members (segment_id, company_id)
  VALUES (_segment_id, _company_id);
  PERFORM private.platform_log('segment.tag', 'company', _company_id::text, NULL,
    jsonb_build_object('segment', _segment_id), trim(_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_segment(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_tag_company(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_segment(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_tag_company(uuid, uuid, text) TO authenticated;
