-- Run after workflow baseline objects and 20261126200000_reminder_settings_audit.sql.
INSERT INTO auth.users(id)
VALUES ('70000000-0000-4000-8000-000000000011');
INSERT INTO public.companies(id, name)
VALUES ('90000000-0000-4000-8000-000000000011', 'Reminder Audit Test');
INSERT INTO public.companies(id, name)
VALUES ('90000000-0000-4000-8000-000000000012', 'Other Reminder Tenant');
INSERT INTO public.test_permissions(company_id, user_id, permission)
VALUES
  ('90000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000011', 'company.settings.edit'),
  ('90000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000011', 'audit.view');

CREATE FUNCTION public.test_fail_reminder_settings_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_reminder_audit', true) = 'on' THEN
    RAISE EXCEPTION 'Injected reminder audit failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_fail_reminder_settings_audit
BEFORE INSERT ON public.settings_change_log
FOR EACH ROW EXECUTE FUNCTION public.test_fail_reminder_settings_audit();

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000011"}', false);

INSERT INTO public.company_reminder_settings(
  company_id, first_after_days, repeat_every_days, max_reminders, include_bank_details, updated_by
) VALUES (
  '90000000-0000-4000-8000-000000000011', 10, 20, 4, false,
  '70000000-0000-4000-8000-000000000011'
);

UPDATE public.company_reminder_settings
SET first_after_days = 12, include_bank_details = true,
    updated_by = '70000000-0000-4000-8000-000000000011'
WHERE company_id = '90000000-0000-4000-8000-000000000011';

-- Tenant-scoped RLS prevents the first company's editor from writing another company's policy.
UPDATE public.company_reminder_settings
SET first_after_days = 30
WHERE company_id = '90000000-0000-4000-8000-000000000012';
RESET ROLE;

DO $$
DECLARE before_count bigint; after_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '90000000-0000-4000-8000-000000000011'
      AND actor_user_id = '70000000-0000-4000-8000-000000000011'
      AND category = 'sales'
      AND setting_key = 'payment_reminders.first_after_days'
      AND old_value IS NULL AND new_value = '10'::jsonb
      AND source = 'company_reminder_settings'
  ) THEN RAISE EXCEPTION 'Reminder insert did not record typed schedule audit'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '90000000-0000-4000-8000-000000000011'
      AND setting_key = 'payment_reminders.first_after_days'
      AND old_value = '10'::jsonb AND new_value = '12'::jsonb
  ) OR NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '90000000-0000-4000-8000-000000000011'
      AND setting_key = 'payment_reminders.include_bank_details'
      AND old_value = 'false'::jsonb AND new_value = 'true'::jsonb
  ) THEN RAISE EXCEPTION 'Reminder update did not record exact typed before/after values'; END IF;

  SELECT count(*) INTO before_count FROM public.settings_change_log
  WHERE company_id = '90000000-0000-4000-8000-000000000011' AND category = 'sales';
  UPDATE public.company_reminder_settings SET updated_at = updated_at + interval '1 second'
  WHERE company_id = '90000000-0000-4000-8000-000000000011';
  SELECT count(*) INTO after_count FROM public.settings_change_log
  WHERE company_id = '90000000-0000-4000-8000-000000000011' AND category = 'sales';
  IF before_count <> after_count THEN RAISE EXCEPTION 'Metadata-only reminder update created audit rows'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '90000000-0000-4000-8000-000000000012'
      AND setting_key LIKE 'payment_reminders.%'
  ) THEN RAISE EXCEPTION 'Reminder audit crossed tenant boundary'; END IF;

  IF has_function_privilege('authenticated', 'public.audit_company_reminder_settings_change()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.audit_company_reminder_settings_change()', 'EXECUTE')
  THEN RAISE EXCEPTION 'Internal reminder audit function is client-executable'; END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000011"}', true);
SELECT set_config('test.fail_reminder_audit', 'on', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.company_reminder_settings SET max_reminders = 6
    WHERE company_id = '90000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'TEST reminder audit failure did not abort settings update';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST reminder audit failure did not abort settings update' THEN RAISE; END IF;
    IF SQLERRM <> 'Injected reminder audit failure' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
COMMIT;

DO $$
BEGIN
  IF (SELECT max_reminders FROM public.company_reminder_settings
      WHERE company_id = '90000000-0000-4000-8000-000000000011') <> 4
  THEN RAISE EXCEPTION 'Audit failure did not roll back reminder settings'; END IF;
END $$;

DROP TRIGGER test_fail_reminder_settings_audit ON public.settings_change_log;
DROP FUNCTION public.test_fail_reminder_settings_audit();
