-- Run after tax-master-history baseline and both tax master guard/audit migrations.
INSERT INTO auth.users (id) VALUES ('70000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);

SET ROLE authenticated;
SELECT public.assert_tax_raises(
 $$INSERT INTO public.settings_change_log (company_id, category, setting_key, source)
   VALUES ('10000000-0000-4000-8000-000000000001', 'tax', 'direct-write', 'test')$$,
 '%row-level security%');
INSERT INTO public.tax_rates (id, company_id, name, rate_bps, effective_from)
VALUES ('20000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000001', 'Audit rate', 1000, '2026-01-01');
UPDATE public.tax_rates SET rate_bps = 1200
 WHERE id = '20000000-0000-4000-8000-000000000005';
INSERT INTO public.tax_codes (id, company_id, code, name, tax_rate_id)
VALUES ('30000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000001', 'AUDIT', 'Audit code',
        '20000000-0000-4000-8000-000000000005');
UPDATE public.tax_codes SET name = 'Renamed audit code'
 WHERE id = '30000000-0000-4000-8000-000000000005';

SELECT public.assert_tax_raises(
 $$UPDATE public.tax_rates SET company_id = '10000000-0000-4000-8000-000000000002'
   WHERE id = '20000000-0000-4000-8000-000000000005'$$,
 '%Cannot move a tax rate to another organisation%');
SELECT public.assert_tax_raises(
 $$UPDATE public.tax_codes SET company_id = '10000000-0000-4000-8000-000000000002'
   WHERE id = '30000000-0000-4000-8000-000000000005'$$,
 '%must belong to this organisation%');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
     WHERE company_id = '10000000-0000-4000-8000-000000000001'
       AND actor_user_id = '70000000-0000-4000-8000-000000000001'
       AND category = 'tax'
       AND setting_key = 'tax_rates:20000000-0000-4000-8000-000000000005'
       AND source = 'tax_module'
       AND old_value IS NULL
       AND (new_value ->> 'rate_bps')::integer = 1000
  ) THEN
    RAISE EXCEPTION 'Tax rate creation is missing its audit record';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
     WHERE company_id = '10000000-0000-4000-8000-000000000001'
       AND actor_user_id = '70000000-0000-4000-8000-000000000001'
       AND category = 'tax'
       AND setting_key = 'tax_rates:20000000-0000-4000-8000-000000000005'
       AND source = 'tax_module'
       AND (old_value ->> 'rate_bps')::integer = 1000
       AND (new_value ->> 'rate_bps')::integer = 1200
  ) THEN
    RAISE EXCEPTION 'Tax rate edit is missing its before/after audit record';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings_change_log
     WHERE company_id = '10000000-0000-4000-8000-000000000001'
       AND actor_user_id = '70000000-0000-4000-8000-000000000001'
       AND category = 'tax'
       AND setting_key = 'tax_codes:30000000-0000-4000-8000-000000000005'
       AND source = 'tax_module'
       AND old_value ->> 'name' = 'Audit code'
       AND new_value ->> 'name' = 'Renamed audit code'
  ) THEN
    RAISE EXCEPTION 'Tax code change is missing its before/after audit record';
  END IF;

  IF has_function_privilege(
    'authenticated', 'public.audit_tax_master_settings_change()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.audit_tax_master_settings_change()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Internal tax audit function is executable by client roles';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.settings_change_log
     WHERE setting_key IN (
       'tax_rates:20000000-0000-4000-8000-000000000005',
       'tax_codes:30000000-0000-4000-8000-000000000005'
     )
       AND company_id = '10000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Rejected tenant reassignment must not create a cross-tenant audit row';
  END IF;
END $$;

BEGIN;
SET ROLE authenticated;
INSERT INTO public.tax_rates (id, company_id, name, rate_bps, effective_from)
VALUES ('20000000-0000-4000-8000-000000000006',
        '10000000-0000-4000-8000-000000000001', 'Rolled back rate', 500, '2026-01-01');
RESET ROLE;
ROLLBACK;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.settings_change_log
     WHERE setting_key = 'tax_rates:20000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'Rolled back tax master edit left an audit row';
  END IF;
END $$;
