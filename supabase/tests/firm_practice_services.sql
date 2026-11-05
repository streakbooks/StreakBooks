-- Run on a migrated database; every synthetic account, company and record rolls back.
BEGIN;
DO $$
DECLARE
  u1 uuid:=gen_random_uuid();
  u2 uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid();
  c2 uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES
    (u1,'firm-services-test-'||u1||'@example.invalid','{}'),
    (u2,'firm-services-test-'||u2||'@example.invalid','{}');
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
  VALUES (gen_random_uuid(),u1,'totp','verified',now(),now());
  INSERT INTO public.companies(
    id,name,country_code,base_currency,fiscal_year_end_month,
    fiscal_year_end_day,timezone,created_by
  ) VALUES
    (c1,'Firm services test A','GB','GBP',12,31,'UTC',u1),
    (c2,'Firm services test B','GB','GBP',12,31,'UTC',u2);
  PERFORM set_config('linkbooks.trusted','on',true);
  INSERT INTO public.company_members(company_id,user_id,role)
  VALUES (c1,u1,'owner'),(c1,u2,'accountant'),(c2,u2,'owner')
  ON CONFLICT (company_id,user_id) DO NOTHING;
  PERFORM set_config('linkbooks.trusted','off',true);
  PERFORM set_config('test.firm_services_u1',u1::text,true);
  PERFORM set_config('test.firm_services_u2',u2::text,true);
  PERFORM set_config('test.firm_services_c1',c1::text,true);
  PERFORM set_config('test.firm_services_c2',c2::text,true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,
    true
  );
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  u1 uuid:=current_setting('test.firm_services_u1')::uuid;
  u2 uuid:=current_setting('test.firm_services_u2')::uuid;
  c1 uuid:=current_setting('test.firm_services_c1')::uuid;
  c2 uuid:=current_setting('test.firm_services_c2')::uuid;
  fid uuid;
  eid uuid;
  affected integer;
BEGIN
  fid:=public.create_practice_firm('Isolated firm-service test');
  INSERT INTO public.firm_members(firm_id,user_id,role)
  VALUES (fid,u2,'member');
  PERFORM public.manage_practice_client(fid,c1,'view',false);

  INSERT INTO public.firm_client_onboarding_steps(
    firm_id,company_id,task_key,title,updated_by
  ) VALUES (fid,c1,'client_details','Confirm details',u1);
  UPDATE public.firm_client_onboarding_steps
  SET completed_at=now(),completed_by=u1,updated_by=u1,note='Reviewed'
  WHERE firm_id=fid AND company_id=c1 AND task_key='client_details' AND version=1;
  IF (SELECT version FROM public.firm_client_onboarding_steps
      WHERE firm_id=fid AND company_id=c1 AND task_key='client_details')<>2 THEN
    RAISE EXCEPTION 'Onboarding version did not advance';
  END IF;
  UPDATE public.firm_client_onboarding_steps
  SET updated_by=u1,note='Stale update'
  WHERE firm_id=fid AND company_id=c1 AND task_key='client_details' AND version=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Stale checklist update accepted'; END IF;

  INSERT INTO public.firm_engagements(
    firm_id,company_id,name,status,frequency,start_date,
    agreed_fee,currency_code,created_by,updated_by
  ) VALUES (
    fid,c1,'Monthly bookkeeping','draft','monthly','2026-11-01',
    250,'GBP',u1,u1
  ) RETURNING id INTO eid;
  UPDATE public.firm_engagements
  SET status='active',updated_by=u1
  WHERE id=eid AND version=1;
  IF (SELECT version FROM public.firm_engagements WHERE id=eid)<>2 THEN
    RAISE EXCEPTION 'Engagement version did not advance';
  END IF;
  BEGIN
    UPDATE public.firm_engagements SET company_id=c2,updated_by=u1
    WHERE id=eid;
    RAISE EXCEPTION 'TEST: engagement client reassignment allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO public.firm_client_onboarding_steps(
      firm_id,company_id,task_key,title,updated_by
    ) VALUES (fid,c2,'forbidden','Foreign client',u1);
    RAISE EXCEPTION 'TEST: foreign client onboarding accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',u2,'aal','aal2','role','authenticated')::text,
    true
  );
  IF (SELECT count(*) FROM public.firm_engagements WHERE id=eid)<>1 THEN
    RAISE EXCEPTION 'Authorised team member cannot view engagement';
  END IF;
  UPDATE public.firm_engagements SET notes='Forbidden',updated_by=u2 WHERE id=eid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Non-admin changed engagement'; END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',u1,'aal','aal1','role','authenticated')::text,
    true
  );
  IF EXISTS (SELECT 1 FROM public.firm_engagements WHERE id=eid) THEN
    RAISE EXCEPTION 'AAL1 session read protected practice records';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,
    true
  );
  PERFORM public.manage_practice_client(fid,c1,NULL,true);
  IF EXISTS (SELECT 1 FROM public.firm_engagements WHERE id=eid) THEN
    RAISE EXCEPTION 'Revoked firm link still reads engagement';
  END IF;
END $$;
ROLLBACK;
SELECT 'firm practice service access, concurrency and MFA: assertions passed; rolled back' AS result;
