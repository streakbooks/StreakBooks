-- Isolated regression for authenticated, versioned Settings Centre writes.
-- Run only through scripts/test-workflows-postgres.mjs, never against a hosted project.
CREATE FUNCTION private.fail_settings_change_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_setting('test.fail_settings_change_audit', true) = 'on' THEN
    RAISE EXCEPTION 'Injected settings audit failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_fail_settings_change_audit
BEFORE INSERT ON public.settings_change_log
FOR EACH ROW EXECUTE FUNCTION private.fail_settings_change_audit();

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  c uuid := '10000000-0000-4000-8000-000000000031';
  v1 integer;
  v2 integer;
  before_audit integer;
BEGIN
  v1 := (public.upsert_organisation_config(
    c, 'notifications', '{"email_from_name":"Accounts"}'::jsonb,
    NULL, 'Initial notification settings', 'ui', 'request-1'
  )->>'version')::integer;
  IF v1 <> 1 THEN RAISE EXCEPTION 'Initial category write did not start at version 1'; END IF;

  v2 := (public.upsert_organisation_config(
    c, 'notifications', '{"email_from_name":"Finance"}'::jsonb,
    v1, 'Update sender name', 'ui', 'request-2'
  )->>'version')::integer;
  IF v2 <> 2 THEN RAISE EXCEPTION 'Valid category write did not advance its version'; END IF;

  SELECT count(*) INTO before_audit FROM public.settings_change_log
  WHERE company_id=c AND category='notifications' AND setting_key='*';
  BEGIN
    PERFORM public.upsert_organisation_config(
      c, 'notifications', '{"email_from_name":"Stale"}'::jsonb,
      v1, 'Stale editor', 'ui', 'request-stale'
    );
    RAISE EXCEPTION 'Stale category write overwrote a newer value';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Settings conflict%' THEN RAISE; END IF;
  END;
  IF (SELECT document->>'email_from_name' FROM public.organisation_config
      WHERE company_id=c AND category='notifications') <> 'Finance' THEN
    RAISE EXCEPTION 'Stale category write mutated the saved value';
  END IF;
  IF (SELECT count(*) FROM public.settings_change_log
      WHERE company_id=c AND category='notifications' AND setting_key='*') <> before_audit THEN
    RAISE EXCEPTION 'Rejected stale category write recorded an audit entry';
  END IF;

  PERFORM set_config('test.fail_settings_change_audit','on',true);
  BEGIN
    PERFORM public.upsert_organisation_config(
      c, 'automation', '{"ai_mode":"off"}'::jsonb,
      NULL, 'Audit rollback', 'ui', 'request-failure'
    );
    RAISE EXCEPTION 'Missing injected settings audit failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected settings audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_settings_change_audit','off',true);
  IF EXISTS (SELECT 1 FROM public.organisation_config WHERE company_id=c AND category='automation') THEN
    RAISE EXCEPTION 'Audit failure did not roll back a category write';
  END IF;

  BEGIN
    UPDATE public.organisation_config SET document='{"email_from_name":"Direct"}'::jsonb
    WHERE company_id=c AND category='notifications';
    RAISE EXCEPTION 'Direct category write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002"}', false);
DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.organisation_config
  WHERE company_id='10000000-0000-4000-8000-000000000031';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'A member cannot read their tenant config'; END IF;
  SELECT count(*) INTO visible_count FROM public.organisation_config
  WHERE company_id='10000000-0000-4000-8000-000000000032';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Cross-tenant config became visible'; END IF;
  SELECT count(*) INTO visible_count FROM public.settings_change_log
  WHERE company_id='10000000-0000-4000-8000-000000000031';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Settings audit became visible without audit permission'; END IF;
  BEGIN
    PERFORM public.upsert_organisation_config(
      '10000000-0000-4000-8000-000000000031', 'notifications',
      '{"email_from_name":"Unauthorised"}'::jsonb, 2, 'Unauthorized', 'ui', 'request-3'
    );
    RAISE EXCEPTION 'Tenant member without settings permission wrote configuration';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%permission to edit settings%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.upsert_organisation_config(uuid,text,jsonb,integer,text,text,text)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'Anonymous Settings Centre RPC access is enabled'; END IF;
  IF (SELECT count(*) FROM public.settings_change_log
      WHERE company_id='10000000-0000-4000-8000-000000000031'
        AND category='notifications' AND setting_key='*') <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two committed settings audit rows';
  END IF;
END $$;

DROP TRIGGER test_fail_settings_change_audit ON public.settings_change_log;
DROP FUNCTION private.fail_settings_change_audit();
SELECT 'PASS: organisation config permission, RLS, versioning, audit and rollback' AS result;
