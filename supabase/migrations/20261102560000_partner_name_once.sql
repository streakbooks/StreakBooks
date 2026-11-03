-- READY-TO-APPLY. Not applied. A partner name is registered once. A missing revenue share stays null and no plan is created.
-- Reverse: drop index platform_partners_name_key, then reapply
-- public.platform_register_partner from 20261102310000_partners.sql.

CREATE UNIQUE INDEX platform_partners_name_key ON public.platform_partners (name);

CREATE OR REPLACE FUNCTION public.platform_register_partner(_name text, _revenue_share_minor integer, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _clean text;
BEGIN
  PERFORM private.require_platform('firms.manage');
  _clean := trim(coalesce(_name, ''));
  IF length(_clean) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the partner and record a reason';
  END IF;
  IF _revenue_share_minor IS NOT NULL AND _revenue_share_minor < 0 THEN
    RAISE EXCEPTION 'Revenue share must be a whole number of minor units';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_partners WHERE name = _clean) THEN
    RAISE EXCEPTION 'That partner already exists';
  END IF;
  BEGIN
    INSERT INTO public.platform_partners (name, revenue_share_minor, created_by)
    VALUES (_clean, _revenue_share_minor, auth.uid()) RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That partner already exists';
  END;
  PERFORM private.platform_log('partner.register', 'platform_partner', _id::text, NULL,
    jsonb_build_object('share', _revenue_share_minor), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_register_partner(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_register_partner(text, integer, text) TO authenticated;
