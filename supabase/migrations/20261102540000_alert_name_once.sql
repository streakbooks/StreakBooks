-- READY-TO-APPLY. Not applied. An alert name is created once. A missing observation still does not fire.
-- Reverse: drop index platform_alert_rules_name_key, then reapply
-- public.platform_create_alert_rule from 20261102270000_alert_rules.sql.

CREATE UNIQUE INDEX platform_alert_rules_name_key ON public.platform_alert_rules (name);

CREATE OR REPLACE FUNCTION public.platform_create_alert_rule(_name text, _threshold bigint, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _clean text;
BEGIN
  PERFORM private.require_platform('notifications.manage');
  _clean := trim(coalesce(_name, ''));
  IF length(_clean) < 2 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the alert and record a reason';
  END IF;
  IF _threshold IS NULL OR _threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be a whole number';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_alert_rules WHERE name = _clean) THEN
    RAISE EXCEPTION 'That alert already exists';
  END IF;
  BEGIN
    INSERT INTO public.platform_alert_rules (name, threshold, created_by)
    VALUES (_clean, _threshold, auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That alert already exists';
  END;
  PERFORM private.platform_log('alert.create', 'platform_alert_rule', _id::text, NULL,
    jsonb_build_object('threshold', _threshold), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_alert_rule(text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_alert_rule(text, bigint, text) TO authenticated;
