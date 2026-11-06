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
  category_id uuid;
  custom_key text;
BEGIN
  fid:=public.create_practice_firm('Bulk profile test practice');
  INSERT INTO public.firm_members(firm_id,user_id,role) VALUES(fid,staff_id,'member');
  PERFORM public.manage_practice_client(fid,a,'view',false);
  PERFORM public.manage_practice_client(fid,b,'view',false);

  insert into public.firm_service_categories(firm_id,name,created_by,updated_by)
  values(fid,'Bookkeeping',owner_id,owner_id) returning id into category_id;
  update public.firm_service_categories set name='Monthly Bookkeeping',updated_by=owner_id
    where id=category_id and version=1;
  if not exists(select 1 from public.firm_service_categories
    where id=category_id and version=2 and name='Monthly Bookkeeping') then
    raise exception 'Service category version failed';
  end if;
  begin
    insert into public.firm_service_categories(firm_id,name,created_by,updated_by)
    values(fid,'monthly bookkeeping',owner_id,owner_id);
    raise exception 'TEST: Duplicate name inserted';
  exception when unique_violation then null; end;

  insert into public.firm_onboarding_template_steps(firm_id,title,created_by,updated_by)
    values(fid,'Check payroll registration',owner_id,owner_id)
    returning task_key into custom_key;
  if custom_key !~ '^custom_[0-9a-f]{32}$' then
    raise exception 'Custom checklist key invalid';
  end if;
  result:=public.apply_firm_onboarding_template(fid,a);
  if result->>'added'<>'1' then raise exception 'Custom step was not applied'; end if;
  update public.firm_client_onboarding_steps
    set note='Evidence retained',completed_at=now(),completed_by=owner_id,updated_by=owner_id
    where firm_id=fid and company_id=a and task_key=custom_key;
  result:=public.apply_firm_onboarding_template(fid,a);
  if result->>'added'<>'0' then raise exception 'Custom step was duplicated'; end if;
  if not exists(select 1 from public.firm_client_onboarding_steps where firm_id=fid
    and company_id=a and task_key=custom_key and note='Evidence retained'
    and completed_at is not null) then
    raise exception 'Custom step reapply overwrote evidence';
  end if;
  update public.firm_onboarding_template_steps set is_active=false,updated_by=owner_id
    where firm_id=fid and task_key=custom_key and version=1;
  result:=public.apply_firm_onboarding_template(fid,b);
  if result->>'added'<>'0' then raise exception 'Archived step applied'; end if;
  begin
    perform public.apply_firm_onboarding_template(fid,foreign_company);
    raise exception 'TEST: Unauthorized client template applied';
  exception when insufficient_privilege then null; end;

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

  -- Bulk tags: add, repeat without version change, remove, clear and audit.
  pair:=jsonb_build_array(
    jsonb_build_object('companyId',a,'expectedVersion',3),
    jsonb_build_object('companyId',b,'expectedVersion',2)
  );
  result:=public.bulk_update_firm_client_tags(fid,pair,'add',array['Payroll','Advisory']);
  if (result->>'updated')::integer<>2 then raise exception 'Bulk tag addition failed'; end if;
  pair:=jsonb_build_array(
    jsonb_build_object('companyId',a,'expectedVersion',4),
    jsonb_build_object('companyId',b,'expectedVersion',3)
  );
  result:=public.bulk_update_firm_client_tags(fid,pair,'add',array['Payroll']);
  if (result->>'unchanged')::integer<>2 then raise exception 'Repeated tag addition advanced version'; end if;
  result:=public.bulk_update_firm_client_tags(fid,pair,'remove',array['Advisory']);
  if (result->>'updated')::integer<>2 then raise exception 'Bulk tag removal failed'; end if;
  pair:=jsonb_build_array(
    jsonb_build_object('companyId',a,'expectedVersion',5),
    jsonb_build_object('companyId',b,'expectedVersion',4)
  );
  result:=public.bulk_update_firm_client_tags(fid,pair,'replace',array[]::text[]);
  if (result->>'updated')::integer<>2 then raise exception 'Bulk tag clearing failed'; end if;
  if (select count(*) from public.firm_client_profiles
       where firm_id=fid and cardinality(tags)=0)<>2 then
    raise exception 'Tag clearing did not persist';
  end if;
  if (select count(*) from public.firm_client_profile_audit
       where firm_id=fid and action='updated' and changed_fields @> array['tags']::text[])<>6 then
    raise exception 'Tag update audit entries missing';
  end if;
  begin
    perform public.bulk_update_firm_client_tags(
      fid,jsonb_build_array(
        jsonb_build_object('companyId',a,'expectedVersion',6),
        jsonb_build_object('companyId',foreign_company,'expectedVersion',0)
      ),'add',array['Unauthorized']);
    raise exception 'TEST: Unauthorized mixed tag operation succeeded';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.firm_client_profiles
       where firm_id=fid and cardinality(tags)>0)<>0 then
    raise exception 'Unauthorized tag batch partially committed';
  end if;
  begin
    perform public.bulk_update_firm_client_tags(
      fid,jsonb_build_array(jsonb_build_object('companyId',a,'expectedVersion',5)),
      'add',array['Stale']);
    raise exception 'TEST: Stale tag version accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.bulk_update_firm_client_tags(
      fid,jsonb_build_array(jsonb_build_object('companyId',a,'expectedVersion',6)),
      'add',array['']);
    raise exception 'TEST: Empty tag accepted';
  exception when invalid_parameter_value then null; end;

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
