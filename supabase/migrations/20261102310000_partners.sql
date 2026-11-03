-- READY-TO-APPLY. Not applied. Partner directory only. No plan and no invented revenue share.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_register_partner(text, integer, text);
--   DROP TABLE IF EXISTS public.platform_partners;

CREATE TABLE public.platform_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  revenue_share_minor integer CHECK (revenue_share_minor IS NULL OR revenue_share_minor >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_partners FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_register_partner(_name text, _revenue_share_minor integer, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('firms.manage');
  IF length(trim(coalesce(_name, ''))) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the partner and record a reason';
  END IF;
  IF _revenue_share_minor IS NOT NULL AND _revenue_share_minor < 0 THEN
    RAISE EXCEPTION 'Revenue share must be a whole number of minor units';
  END IF;
  INSERT INTO public.platform_partners (name, revenue_share_minor, created_by)
  VALUES (trim(_name), _revenue_share_minor, auth.uid()) RETURNING id INTO _id;
  PERFORM private.platform_log('partner.register', 'platform_partner', _id::text, NULL,
    jsonb_build_object('share', _revenue_share_minor), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_register_partner(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_register_partner(text, integer, text) TO authenticated;
