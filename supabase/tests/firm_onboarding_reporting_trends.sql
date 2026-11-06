-- Rollback-only verification: dependency ordering, staff scope, in-app reminders and MFA.
BEGIN;
DO $$
DECLARE
  u1 uuid:=gen_random_uuid();
  u2 uuid:=gen_random_uuid();
  u3 uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid();
  c2 uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES
    (u1,'firm-onboard-admin-'||u1||'@example.invalid','{}'),
    (u2,'firm-onboard-staff-'||u2||'@example.invalid','{}'),
    (u3,'firm-onboard-outsider-'||u3||'@example.invalid','{}');
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
  VALUES (gen_random_uuid(),u1,'totp','verified',now(),now());
  INSERT INTO public.companies(
    id,name,country_code,base_currency,fiscal_year_end_month,
    fiscal_year_end_day,timezone,created_by
  ) VALUES
    (c1,'Onboarding check firm client','GB','GBP',12,31,'UTC',u1),
    (c2,'Onboarding check outsider','GB','GBP',12,31,'UTC',u3);
  PERFORM set_config('linkbooks.trusted','on',true);
  INSERT INTO public.company_members(company_id,user_id,role)
  VALUES(c1,u1,'owner'),(c1,u2,'accountant'),(c2,u3,'owner')
  ON CONFLICT(company_id,user_id) DO NOTHING;
  PERFORM set_config('linkbooks.trusted','off',true);
  PERFORM set_config('test.onboarding_owner',u1::text,true);
  PERFORM set_config('test.onboarding_staff',u2::text,true);
  PERFORM set_config('test.onboarding_outsider',u3::text,true);
  PERFORM set_config('test.onboarding_company',c1::text,true);
  PERFORM set_config('test.onboarding_foreign',c2::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',u1,'role','authenticated','aal','aal2')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  owner_id uuid:=current_setting('test.onboarding_owner')::uuid;
  staff_id uuid:=current_setting('test.onboarding_staff')::uuid;
  foreign_id uuid:=current_setting('test.onboarding_outsider')::uuid;
  client_id uuid:=current_setting('test.onboarding_company')::uuid;
  foreign_company uuid:=current_setting('test.onboarding_foreign')::uuid;
  fid uuid;
  bad integer;
  result jsonb;
BEGIN
  fid:=public.create_practice_firm('Onboarding automation checks');
  PERFORM set_config('test.onboarding_firm',fid::text,true);
  INSERT INTO public.firm_members(firm_id,user_id,role)
  VALUES(fid,staff_id,'member');
  PERFORM public.manage_practice_client(fid,client_id,'view',false);

  INSERT INTO public.firm_client_onboarding_steps(
    firm_id,company_id,task_key,title,updated_by
  ) VALUES(fid,client_id,'client_details','Confirm contact',owner_id);
  INSERT INTO public.firm_client_onboarding_steps(
    firm_id,company_id,task_key,title,depends_on_task_key,assignee_id,
    due_date,reminders_enabled,updated_by
  ) VALUES(
    fid,client_id,'verify_access','Verify client access','client_details',
    staff_id,current_date,true,owner_id
  );
  BEGIN
    UPDATE public.firm_client_onboarding_steps
      SET completed_at=now(),completed_by=owner_id,updated_by=owner_id
      WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access';
    RAISE EXCEPTION 'TEST: Dependent step completed before prerequisite';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.firm_client_onboarding_steps
    SET completed_at=now(),completed_by=owner_id,updated_by=owner_id
    WHERE firm_id=fid AND company_id=client_id AND task_key='client_details';
  UPDATE public.firm_client_onboarding_steps
    SET completed_at=now(),completed_by=owner_id,updated_by=owner_id
    WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access';
  BEGIN
    UPDATE public.firm_client_onboarding_steps
      SET completed_at=null,completed_by=null,updated_by=owner_id
      WHERE firm_id=fid AND company_id=client_id AND task_key='client_details';
    RAISE EXCEPTION 'TEST: Reopened a completed prerequisite';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.firm_client_onboarding_steps
    SET completed_at=null,completed_by=null,updated_by=owner_id
    WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access';
  UPDATE public.firm_client_onboarding_steps
    SET completed_at=null,completed_by=null,updated_by=owner_id
    WHERE firm_id=fid AND company_id=client_id AND task_key='client_details';
  BEGIN
    UPDATE public.firm_client_onboarding_steps
      SET depends_on_task_key='verify_access',updated_by=owner_id
      WHERE firm_id=fid AND company_id=client_id AND task_key='client_details';
    RAISE EXCEPTION 'TEST: Circular dependency permitted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE public.firm_client_onboarding_steps
      SET assignee_id=foreign_id,updated_by=owner_id
      WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access';
    RAISE EXCEPTION 'TEST: Unlinked assignee permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.firm_client_onboarding_steps
      SET depends_on_task_key='foreign_step',updated_by=owner_id
      WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access';
    RAISE EXCEPTION 'TEST: Missing dependency permitted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- New templates copy relative due dates once without overriding a previous client step.
  INSERT INTO public.firm_onboarding_template_steps(
    firm_id,title,due_in_days,reminders_enabled,created_by,updated_by
  ) VALUES(fid,'Review initial payroll',7,false,owner_id,owner_id);
  result:=public.apply_firm_onboarding_template(fid,client_id);
  IF (result->>'added')::integer<>1 THEN
    RAISE EXCEPTION 'Template step not inserted';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.firm_client_onboarding_steps
    WHERE firm_id=fid AND company_id=client_id
      AND title='Review initial payroll' AND due_date=current_date+7
      AND reminders_enabled=false
  ) THEN
    RAISE EXCEPTION 'Relative due date and reminder settings not copied';
  END IF;
  result:=public.apply_firm_onboarding_template(fid,client_id);
  IF (result->>'added')::integer<>0 THEN
    RAISE EXCEPTION 'Template reapply was not idempotent';
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',staff_id,'role','authenticated','aal','aal2')::text,true);
  IF NOT EXISTS(
    SELECT 1 FROM public.firm_client_onboarding_steps
    WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access'
  ) THEN RAISE EXCEPTION 'Eligible staff cannot see linked onboarding'; END IF;
  UPDATE public.firm_client_onboarding_steps
    SET note='Unauthorized write',updated_by=staff_id
    WHERE firm_id=fid AND company_id=client_id AND task_key='verify_access';
  GET DIAGNOSTICS bad=ROW_COUNT;
  IF bad<>0 THEN RAISE EXCEPTION 'Non-admin edited checklist'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal1')::text,true);
  IF EXISTS(
    SELECT 1 FROM public.firm_client_onboarding_steps
    WHERE firm_id=fid AND company_id=client_id
  ) THEN RAISE EXCEPTION 'MFA protection bypassed'; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE
  fid uuid:=current_setting('test.onboarding_firm')::uuid;
  staff_id uuid:=current_setting('test.onboarding_staff')::uuid;
  client_id uuid:=current_setting('test.onboarding_company')::uuid;
  foreign_id uuid:=current_setting('test.onboarding_outsider')::uuid;
  first_run integer;
  repeat_run integer;
BEGIN
  first_run:=private.firm_onboarding_due_notifications();
  repeat_run:=private.firm_onboarding_due_notifications();
  IF first_run<>1 OR repeat_run<>0 THEN
    RAISE EXCEPTION 'Onboarding reminder not idempotent: %, %',first_run,repeat_run;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.action_notifications
    WHERE company_id=client_id AND recipient_user_id=staff_id
      AND event_key LIKE 'firm-onboard-due:%'
  ) THEN RAISE EXCEPTION 'Assignee notification not delivered in-app'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.action_notifications
    WHERE company_id=client_id AND recipient_user_id=foreign_id
      AND event_key LIKE 'firm-onboard-due:%'
  ) THEN RAISE EXCEPTION 'Unauthorized recipient notified'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM cron.job
    WHERE jobname='linkbooks-firm-onboarding-reminders'
  ) THEN RAISE EXCEPTION 'Onboarding reminder cron missing'; END IF;
END $$;
-- Capture observations in a superuser-only test transaction.
DO $$
DECLARE
  fid uuid:=current_setting('test.onboarding_firm')::uuid;
  owner_id uuid:=current_setting('test.onboarding_owner')::uuid;
  client_id uuid:=current_setting('test.onboarding_company')::uuid;
  foreign_company uuid:=current_setting('test.onboarding_foreign')::uuid;
  first_run integer;
  second_run integer;
BEGIN
  first_run:=private.capture_firm_onboarding_daily_snapshots();
  second_run:=private.capture_firm_onboarding_daily_snapshots();
  IF first_run<>1 OR second_run<>0 THEN
    RAISE EXCEPTION 'Daily capture not idempotent: %, %',first_run,second_run;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.firm_onboarding_daily_snapshots d
    WHERE d.firm_id=fid AND d.company_id=client_id AND d.snapshot_date=current_date
      AND d.total_steps=3 AND d.completed_steps=0 AND d.overdue_steps=0
      AND d.unassigned_open_steps=2 AND d.blocked_steps=1
  ) THEN
    RAISE EXCEPTION 'Daily counts do not match checklist state';
  END IF;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true);
  UPDATE public.firm_client_onboarding_steps
  SET completed_at=now(),completed_by=owner_id,updated_by=owner_id
  WHERE firm_id=fid AND company_id=client_id AND task_key='client_details';
  IF private.capture_firm_onboarding_daily_snapshots()<>0 THEN
    RAISE EXCEPTION 'Re-run inserted a duplicate daily observation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.firm_onboarding_daily_snapshots
    WHERE firm_id=fid AND company_id=client_id AND completed_steps=0
  ) THEN
    RAISE EXCEPTION 'Historical observation was silently rewritten';
  END IF;
  -- This synthetic row verifies RLS: a firm member cannot read a foreign,
  -- unlinked company just because the row shares the same firm_id.
  INSERT INTO public.firm_onboarding_daily_snapshots(
    firm_id,company_id,snapshot_date,total_steps,completed_steps,
    overdue_steps,unassigned_open_steps,blocked_steps
  ) VALUES (fid,foreign_company,current_date,1,0,0,0,0);
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='linkbooks-firm-onboarding-daily-snapshots'
      AND schedule='45 1 * * *'
  ) THEN
    RAISE EXCEPTION 'Daily capture schedule was not registered';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  fid uuid:=current_setting('test.onboarding_firm')::uuid;
  owner_id uuid:=current_setting('test.onboarding_owner')::uuid;
  staff_id uuid:=current_setting('test.onboarding_staff')::uuid;
  foreign_company uuid:=current_setting('test.onboarding_foreign')::uuid;
  client_id uuid:=current_setting('test.onboarding_company')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true);
  IF (SELECT count(*) FROM public.firm_onboarding_daily_snapshots
    WHERE firm_id=fid)<>1 THEN
    RAISE EXCEPTION 'Admin history read leaked unlinked company';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.firm_onboarding_daily_snapshots
    WHERE firm_id=fid AND company_id=foreign_company
  ) THEN
    RAISE EXCEPTION 'Foreign company leaked via historical snapshot';
  END IF;
  BEGIN
    INSERT INTO public.firm_onboarding_daily_snapshots(
      firm_id,company_id,snapshot_date,total_steps,completed_steps,
      overdue_steps,unassigned_open_steps,blocked_steps)
    VALUES(fid,client_id,current_date-2,10,1,0,1,0);
    RAISE EXCEPTION 'TEST: App user forged a historical snapshot';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',staff_id,'aal','aal2','role','authenticated')::text,true);
  IF (SELECT count(*) FROM public.firm_onboarding_daily_snapshots
    WHERE firm_id=fid)<>1 THEN
    RAISE EXCEPTION 'Eligible firm staff cannot read their client history';
  END IF;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',owner_id,'aal','aal1','role','authenticated')::text,true);
  IF EXISTS (
    SELECT 1 FROM public.firm_onboarding_daily_snapshots WHERE firm_id=fid
  ) THEN RAISE EXCEPTION 'MFA protection bypassed on daily snapshots'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'firm onboarding daily history, scoped RLS, capture idempotency and MFA passed; rolled back' AS result;
