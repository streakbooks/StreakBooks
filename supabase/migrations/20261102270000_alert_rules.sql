-- READY-TO-APPLY. Not applied. A missing observation does not fire.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_create_alert_rule(text, bigint, text);
--   DROP TABLE IF EXISTS public.platform_alert_rules;

CREATE TABLE public.platform_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  threshold bigint NOT NULL CHECK (threshold >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_alert_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_alert_rules FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_create_alert_rule(_name text, _threshold bigint, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('notifications.manage');
  IF length(trim(coalesce(_name, ''))) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the alert and record a reason';
  END IF;
  IF _threshold IS NULL OR _threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be a whole number';
  END IF;
  INSERT INTO public.platform_alert_rules (name, threshold, created_by)
  VALUES (trim(_name), _threshold, auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('alert.create', 'platform_alert_rule', _id::text, NULL,
    jsonb_build_object('threshold', _threshold), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_alert_rule(text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_alert_rule(text, bigint, text) TO authenticated;
