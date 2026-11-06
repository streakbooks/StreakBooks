-- Run after 20261106063045. All fixture users, firms and settings roll back.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  VALUES
    (owner_id,'firm-pref-owner-'||owner_id||'@example.invalid',now(),'{}'),
    (outsider_id,'firm-pref-outsider-'||outsider_id||'@example.invalid',now(),'{}');
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
  VALUES(gen_random_uuid(),owner_id,'totp','verified',now(),now());
  PERFORM set_config('test.fp_owner',owner_id::text,true);
  PERFORM set_config('test.fp_outsider',outsider_id::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  firm uuid;
  owner_id uuid := current_setting('test.fp_owner')::uuid;
  outsider_id uuid := current_setting('test.fp_outsider')::uuid;
  rows_seen integer;
BEGIN
  firm := public.create_practice_firm('Test preferences practice');
  INSERT INTO public.firm_ui_preferences(firm_id,user_id,preference_key,preference_value)
  VALUES(firm,owner_id,'firm.directory.columns.v1','["email","review"]'::jsonb);

  INSERT INTO public.firm_ui_preferences(firm_id,user_id,preference_key,preference_value)
  VALUES(firm,owner_id,'firm.directory.columns.v1','["status"]'::jsonb)
  ON CONFLICT (firm_id,user_id,preference_key)
  DO UPDATE SET preference_value = excluded.preference_value;

  IF (SELECT preference_value FROM public.firm_ui_preferences
      WHERE firm_id=firm AND user_id=owner_id
        AND preference_key='firm.directory.columns.v1') <> '["status"]'::jsonb THEN
    RAISE EXCEPTION 'Cloud upsert did not persist the new value';
  END IF;

  BEGIN
    UPDATE public.firm_ui_preferences
      SET preference_key = 'firm.directory.views.v1'
      WHERE firm_id=firm AND user_id=owner_id;
    RAISE EXCEPTION 'TEST: Preference identity was changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO public.firm_ui_preferences(firm_id,user_id,preference_key,preference_value)
    VALUES(firm,owner_id,'firm.directory.views.v1','{}'::jsonb);
    RAISE EXCEPTION 'TEST: Non-array preference inserted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',outsider_id,'role','authenticated','aal','aal2')::text,true);

  SELECT count(*) INTO rows_seen FROM public.firm_ui_preferences WHERE firm_id=firm;
  IF rows_seen <> 0 THEN RAISE EXCEPTION 'Outsider read firm preferences'; END IF;

  BEGIN
    INSERT INTO public.firm_ui_preferences(firm_id,user_id,preference_key,preference_value)
    VALUES(firm,outsider_id,'firm.directory.views.v1','[]'::jsonb);
    RAISE EXCEPTION 'TEST: Outsider created preferences';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1')::text,true);
  SELECT count(*) INTO rows_seen FROM public.firm_ui_preferences WHERE firm_id=firm;
  IF rows_seen <> 0 THEN RAISE EXCEPTION 'AAL1 read firm preferences despite enrolled MFA'; END IF;
END $$;
ROLLBACK;
SELECT 'firm directory preference RLS, upsert, identity, type and MFA checks passed; rolled back' AS result;
