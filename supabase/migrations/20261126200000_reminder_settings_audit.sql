-- Keep manual invoice reminder schedule changes in the same transaction as the settings row.
CREATE OR REPLACE FUNCTION public.audit_company_reminder_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  fields text[] := ARRAY[
    'first_after_days',
    'repeat_every_days',
    'max_reminders',
    'include_bank_details'
  ];
  field_name text;
  old_document jsonb := '{}'::jsonb;
  new_document jsonb := to_jsonb(NEW);
  old_value jsonb;
  new_value jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_document := to_jsonb(OLD);
  END IF;

  FOREACH field_name IN ARRAY fields LOOP
    old_value := old_document -> field_name;
    new_value := new_document -> field_name;
    IF old_value = 'null'::jsonb THEN old_value := NULL; END IF;
    IF new_value = 'null'::jsonb THEN new_value := NULL; END IF;
    IF old_value IS NOT DISTINCT FROM new_value THEN CONTINUE; END IF;

    INSERT INTO public.settings_change_log (
      company_id,
      actor_user_id,
      category,
      setting_key,
      old_value,
      new_value,
      source
    ) VALUES (
      NEW.company_id,
      auth.uid(),
      'sales',
      'payment_reminders.' || field_name,
      old_value,
      new_value,
      'company_reminder_settings'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_company_reminder_settings_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS company_reminder_settings_audit ON public.company_reminder_settings;
CREATE TRIGGER company_reminder_settings_audit
AFTER INSERT OR UPDATE ON public.company_reminder_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_company_reminder_settings_change();

COMMENT ON FUNCTION public.audit_company_reminder_settings_change() IS
  'Records typed manual invoice reminder schedule changes in settings_change_log in the same transaction.';
