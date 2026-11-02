-- READY-TO-APPLY. Not applied. Business and user name search. The query text is not written to the audit row.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_global_search(text);

CREATE FUNCTION public.platform_global_search(_query text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _term text;
  _rows jsonb;
  _count integer;
BEGIN
  IF NOT (private.platform_can('businesses.view') OR private.platform_can('users.view')) THEN
    RAISE EXCEPTION 'Platform permission required' USING ERRCODE = '42501';
  END IF;
  _term := trim(coalesce(_query, ''));
  IF length(_term) < 2 THEN RETURN '[]'::jsonb; END IF;
  _term := replace(replace(replace(_term, '\', '\\'), '%', '\%'), '_', '\_');
  SELECT coalesce(jsonb_agg(hit), '[]'::jsonb) INTO _rows FROM (
    SELECT jsonb_build_object('kind', 'business', 'id', c.id, 'label', c.name) AS hit
    FROM public.companies c
    WHERE private.platform_can('businesses.view')
      AND c.name ILIKE '%' || _term || '%' ESCAPE '\'
    UNION ALL
    SELECT jsonb_build_object('kind', 'user', 'id', u.id, 'label', coalesce(p.full_name, u.email))
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE private.platform_can('users.view')
      AND coalesce(p.full_name, u.email, '') ILIKE '%' || _term || '%' ESCAPE '\'
    LIMIT 20
  ) hits;
  _count := jsonb_array_length(_rows);
  PERFORM private.platform_log(
    'search', 'platform', 'global', NULL, jsonb_build_object('rows', _count), 'Platform search'
  );
  RETURN _rows;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_global_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_global_search(text) TO authenticated;
