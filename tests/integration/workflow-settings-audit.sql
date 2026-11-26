-- Run after workflow baseline objects and 20261126180000_workflow_settings_audit.sql.
INSERT INTO auth.users(id)
VALUES ('70000000-0000-4000-8000-000000000010');
INSERT INTO public.companies(id, name)
VALUES ('10000000-0000-4000-8000-000000000010', 'Workflow Audit Test');
INSERT INTO public.companies(id, name)
VALUES ('10000000-0000-4000-8000-000000000099', 'Other Tenant');
INSERT INTO public.company_workflow_settings(company_id)
VALUES ('10000000-0000-4000-8000-000000000099');
INSERT INTO public.test_permissions(company_id, user_id, permission)
VALUES
  ('10000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000010', 'company.settings.edit'),
  ('10000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000010', 'audit.view');

CREATE FUNCTION public.test_fail_workflow_settings_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_workflow_audit', true) = 'on' THEN
    RAISE EXCEPTION 'Injected workflow audit failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_fail_workflow_settings_audit
BEFORE INSERT ON public.settings_change_log
FOR EACH ROW EXECUTE FUNCTION public.test_fail_workflow_settings_audit();

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000010"}', false);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.settings_change_log(company_id, category, setting_key, source)
    VALUES ('10000000-0000-4000-8000-000000000010', 'workflow', 'forged', 'test');
    RAISE EXCEPTION 'TEST direct audit insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

INSERT INTO public.company_workflow_settings(
  company_id,
  sales_default_notes,
  sales_payment_instructions,
  purchases_default_notes,
  accounting_require_journal_memo,
  updated_by
)
VALUES (
  '10000000-0000-4000-8000-000000000010',
  'Private note at creation',
  'Sensitive payment instruction',
  'Private purchase note at creation',
  true,
  '70000000-0000-4000-8000-000000000010'
);

UPDATE public.company_workflow_settings
SET accounting_require_journal_memo = false,
    sales_default_payment_terms_days = 45,
    purchases_default_payment_terms_days = 60,
    sales_default_notes = 'Updated private note',
    purchases_default_notes = 'Updated private purchase note',
    updated_by = '70000000-0000-4000-8000-000000000010'
WHERE company_id = '10000000-0000-4000-8000-000000000010';

-- A member of the first tenant cannot change the second tenant's settings.
UPDATE public.company_workflow_settings
SET accounting_require_journal_memo = true
WHERE company_id = '10000000-0000-4000-8000-000000000099';
RESET ROLE;

DO $$
DECLARE
  before_count bigint;
  after_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND actor_user_id = '70000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'accounting_require_journal_memo'
      AND source = 'workflow_settings'
      AND old_value IS NULL
      AND new_value = 'true'::jsonb
  ) THEN RAISE EXCEPTION 'Workflow setting insert is missing before/after audit evidence'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'accounting_require_journal_memo'
      AND old_value = 'true'::jsonb
      AND new_value = 'false'::jsonb
  ) THEN RAISE EXCEPTION 'Workflow setting update is missing before/after audit evidence'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'sales_default_payment_terms_days'
      AND old_value = '30'::jsonb
      AND new_value = '45'::jsonb
  ) THEN RAISE EXCEPTION 'Sales payment term update is missing typed before/after audit evidence'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'purchases_default_payment_terms_days'
      AND old_value = '30'::jsonb
      AND new_value = '60'::jsonb
  ) THEN RAISE EXCEPTION 'Purchase payment term update is missing typed before/after audit evidence'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'sales_default_notes'
      AND old_value IS NULL
      AND new_value = '{"redacted":true}'::jsonb
  ) OR NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'sales_default_notes'
      AND old_value = '{"redacted":true}'::jsonb
      AND new_value = '{"redacted":true}'::jsonb
  ) THEN RAISE EXCEPTION 'Free-text workflow values are not safely redacted in audit'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'purchases_default_notes'
      AND old_value IS NULL
      AND new_value = '{"redacted":true}'::jsonb
  ) OR NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000010'
      AND category = 'workflow'
      AND setting_key = 'purchases_default_notes'
      AND old_value = '{"redacted":true}'::jsonb
      AND new_value = '{"redacted":true}'::jsonb
  ) THEN RAISE EXCEPTION 'Purchase note audit values are not redacted'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE category = 'workflow'
      AND (coalesce(old_value::text, '') LIKE '%Private note%'
        OR coalesce(new_value::text, '') LIKE '%payment instruction%'
        OR coalesce(old_value::text, '') LIKE '%purchase note%'
        OR coalesce(new_value::text, '') LIKE '%purchase note%')
  ) THEN RAISE EXCEPTION 'Free-text workflow content leaked into settings audit'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000099'
      AND category = 'workflow'
      AND setting_key = 'purchases_default_notes'
  ) THEN RAISE EXCEPTION 'Unchanged nullable workflow default created an audit row'; END IF;

  SELECT count(*) INTO before_count
  FROM public.settings_change_log
  WHERE company_id = '10000000-0000-4000-8000-000000000010'
    AND category = 'workflow';

  UPDATE public.company_workflow_settings
  SET updated_at = updated_at + interval '1 second'
  WHERE company_id = '10000000-0000-4000-8000-000000000010';

  SELECT count(*) INTO after_count
  FROM public.settings_change_log
  WHERE company_id = '10000000-0000-4000-8000-000000000010'
    AND category = 'workflow';
  IF after_count <> before_count THEN RAISE EXCEPTION 'Metadata-only update created a settings audit row'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.settings_change_log
    WHERE company_id = '10000000-0000-4000-8000-000000000099'
      AND category = 'workflow'
      AND setting_key = 'accounting_require_journal_memo'
      AND old_value = 'false'::jsonb
      AND new_value = 'true'::jsonb
  ) THEN RAISE EXCEPTION 'Tenant-isolated update wrote an audit row to another company'; END IF;

  IF has_function_privilege(
    'authenticated', 'public.audit_company_workflow_settings_change()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.audit_company_workflow_settings_change()', 'EXECUTE'
  ) THEN RAISE EXCEPTION 'Internal workflow audit function is callable by client roles'; END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000010"}', true);
SELECT set_config('test.fail_workflow_audit', 'on', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.company_workflow_settings
    SET accounting_require_journal_memo = true
    WHERE company_id = '10000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'TEST audit failure did not abort settings update';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST audit failure did not abort settings update' THEN RAISE; END IF;
    IF SQLERRM <> 'Injected workflow audit failure' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
COMMIT;

DO $$
BEGIN
  IF (SELECT accounting_require_journal_memo FROM public.company_workflow_settings
      WHERE company_id = '10000000-0000-4000-8000-000000000010') IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Audit failure did not roll back the workflow setting'; END IF;
END $$;
