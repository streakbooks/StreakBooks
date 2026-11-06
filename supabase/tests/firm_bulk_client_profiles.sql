-- Rollback-only integration test for the practice bulk profile updater.
BEGIN;
DO $$
DECLARE
  owner_id uuid:=gen_random_uuid();
  staff_id uuid:=gen_random_uuid();
  outsider_id uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid();
  b uuid:=gen_random_uuid();
  foreign_company uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES
    (owner_id,'bulk-firm-owner-'||owner_id||'@example.invalid','{}'),
    (staff_id,'bulk-firm-staff-'||staff_id||'@example.invalid','{}'),
    (outsider_id,'bulk-firm-outsider-'||outsider_id||'@example.invalid','{}');
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
  VALUES(gen_random_uuid(),owner_id,'totp','verified',now(),now());
  INSERT INTO public.companies(
    id,name,country_code,base_currency,fiscal_year_end_month,
    fiscal_year_end_day,timezone,created_by
  ) VALUES
    (a,'Bulk test company A','GB','GBP',12,31,'UTC',owner_id),
    (b,'Bulk test company B','GB','GBP',12,31,'UTC',staff_id),
    (foreign_company,'Foreign bulk company','GB','GBP',12,31,'UTC',outsider_id);
  PERFORM set_config('linkbooks.trusted','on',true);
  INSERT INTO public.company_members(company_id,user_id,role)
  VALUES
    (a,owner_id,'owner'),(b,staff_id,'owner'),
    (a,staff_id,'accountant'),(b,owner_id,'admin'),
    (foreign_company,outsider_id,'owner')
  ON CONFLICT (company_id,user_id) DO NOTHING;
  PERFORM set_config('linkbooks.trusted','off',true);
  PERFORM set_config('test.fbp_owner',owner_id::text,true);
  PERFORM set_config('test.fbp_staff',staff_id::text,true);
  PERFORM set_config('test.fbp_a',a::text,true);
  PERFORM set_config('test.fbp_b',b::text,true);
  PERFORM set_config('test.fbp_foreign',foreign_company::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  fid uuid;
  owner_id uuid:=current_setting('test.fbp_owner')::uuid;
  staff_id uuid:=current_setting('test.fbp_staff')::uuid;
  a uuid:=current_setting('test.fbp_a')::uuid;
  b uuid:=current_setting('test.fbp_b')::uuid;
  foreign_company uuid:=current_setting('test.fbp_foreign')::uuid;
  result jsonb;
  pair jsonb;
  mixed jsonb;
  audit_count integer;
BEGIN
  fid:=public.create_practice_firm('Bulk profile test practice');
  INSERT INTO public.firm_members(firm_id,user_id,role) VALUES(fid,staff_id,'member');
  PERFORM public.manage_practice_client(fid,a,'view',false);
  PERFORM public.manage_practice_client(fid,b,'view',false);
  pair:=jsonb_build_array(
    jsonb_build_object('companyId',a,'expectedVersion',0),
    jsonb_build_object('companyId',b,'expectedVersion',0)
  );
  result:=public.bulk_update_firm_client_profiles(fid,pair,'status','onboarding');
  IF (result->>'updated')::integer <> 2 THEN
    RAISE EXCEPTION 'Expected two initial profiles';
  END IF;
  IF (SELECT count(*) FROM public.firm_client_profiles
       WHERE firm_id=fid and version=1 and status='onboarding')<>2 THEN
    RAISE EXCEPTION 'Initial status profiles not created';
  END IF;
  IF (SELECT count(*) FROM public.firm_client_profile_audit
       WHERE firm_id=fid and action='created')<>2 THEN
    RAISE EXCEPTION 'Creation audit missing';
  END IF;

  pair:=jsonb_build_array(
    jsonb_build_object('companyId',a,'expectedVersion',1),
    jsonb_build_object('companyId',b,'expectedVersion',1)
  );
  result:=public.bulk_update_firm_client_profiles(fid,pair,'service_line','Payroll');
  IF (result->>'updated')::integer<>2 OR
     (SELECT count(*) FROM public.firm_client_profiles
       WHERE firm_id=fid and service_line='Payroll' and version=2)<>2 THEN
    RAISE EXCEPTION 'Bulk service update or optimistic version failed';
  END IF;
  result:=public.bulk_update_firm_client_profiles(
    fid,jsonb_build_array(jsonb_build_object('companyId',a,'expectedVersion',2)),
    'service_line','Payroll'
  );
  IF (result->>'unchanged')::integer<>1 OR (result->>'updated')::integer<>0 THEN
    RAISE EXCEPTION 'No-op update incorrectly advanced a profile';
  END IF;
  IF (SELECT version FROM public.firm_client_profiles
    WHERE firm_id=fid and company_id=a)<>2 THEN
    RAISE EXCEPTION 'No-op advanced the profile version';
  END IF;

  UPDATE public.firm_client_profiles SET status='active',updated_by=owner_id
  WHERE firm_id=fid and company_id=a and version=2;
  IF (SELECT version FROM public.firm_client_profiles
    WHERE firm_id=fid and company_id=a)<>3 THEN
    RAISE EXCEPTION 'Single-client writes did not advance the version';
  END IF;

  BEGIN
    PERFORM public.bulk_update_firm_client_profiles(fid,pair,'service_line','Advisory');
    RAISE EXCEPTION 'TEST: stale multi-client update succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT count(*) FROM public.firm_client_profiles
       WHERE firm_id=fid and service_line='Payroll')<>2 THEN
    RAISE EXCEPTION 'Partial changes survived a stale batch';
  END IF;

  mixed:=jsonb_build_array(
    jsonb_build_object('companyId',a,'expectedVersion',3),
    jsonb_build_object('companyId',foreign_company,'expectedVersion',0)
  );
  BEGIN
    PERFORM public.bulk_update_firm_client_profiles(fid,mixed,'status','archived');
    RAISE EXCEPTION 'TEST: unlinked client changed via a mixed batch';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT status FROM public.firm_client_profiles
       WHERE firm_id=fid and company_id=a)<>'active' THEN
    RAISE EXCEPTION 'Unauthorized mixed batch was not rolled back';
  END IF;
  BEGIN
    PERFORM public.bulk_update_firm_client_profiles(
      fid,
      jsonb_build_array(
        jsonb_build_object('companyId',a,'expectedVersion',3),
        jsonb_build_object('companyId',a,'expectedVersion',3)
      ),
      'status','archived'
    );
    RAISE EXCEPTION 'TEST: duplicate targets accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT status FROM public.firm_client_profiles
    WHERE firm_id=fid and company_id=a)<>'active' THEN
    RAISE EXCEPTION 'Duplicate target batch was not fully rolled back';
  END IF;

  BEGIN
    PERFORM public.bulk_update_firm_client_profiles(
      fid,
      (SELECT jsonb_agg(jsonb_build_object('companyId',a,'expectedVersion',3))
         FROM generate_series(1,51)),
      'status','archived'
    );
    RAISE EXCEPTION 'TEST: over-limit batch was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  SELECT count(*) INTO audit_count FROM public.firm_client_profile_audit WHERE firm_id=fid;
  IF audit_count<>5 THEN RAISE EXCEPTION 'Unexpected profile audit count: %',audit_count; END IF;

  BEGIN
    INSERT INTO public.firm_client_profile_audit(
      firm_id,company_id,actor_id,action,changed_fields,after_values
    ) VALUES (fid,a,owner_id,'updated',array['status'],'{}');
    RAISE EXCEPTION 'TEST: direct audit forgery succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2')::text,true);
  BEGIN
    PERFORM public.bulk_update_firm_client_profiles(
      fid,jsonb_build_array(jsonb_build_object('companyId',a,'expectedVersion',3)),
      'status','archived');
    RAISE EXCEPTION 'TEST: non-admin bulk edit succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.firm_client_profile_audit WHERE firm_id=fid) THEN
    RAISE EXCEPTION 'Non-admin viewed privileged practice audit';
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1')::text,true);
  BEGIN
    PERFORM public.bulk_update_firm_client_profiles(
      fid,jsonb_build_array(jsonb_build_object('companyId',a,'expectedVersion',3)),
      'status','archived');
    RAISE EXCEPTION 'TEST: enrolled AAL1 changed protected profile';
  EXCEPTION WHEN serialization_failure OR insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'firm bulk profile atomic updates, versions, tenant isolation, audit and MFA passed; rolled back' AS result;
