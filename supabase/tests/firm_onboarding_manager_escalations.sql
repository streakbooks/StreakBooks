-- Rollback-only security, policy versions, opt-in delivery and audit checks.
BEGIN;
DO $$
DECLARE
 owner_id uuid:=gen_random_uuid();
 staff_id uuid:=gen_random_uuid();
 outsider_id uuid:=gen_random_uuid();
 client_id uuid:=gen_random_uuid();
 foreign_company uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  (owner_id,'escalation-owner-'||owner_id||'@example.invalid','{}'),
  (staff_id,'escalation-manager-'||staff_id||'@example.invalid','{}'),
  (outsider_id,'escalation-outsider-'||outsider_id||'@example.invalid','{}');
 INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
 VALUES(gen_random_uuid(),owner_id,'totp','verified',now(),now());
 INSERT INTO public.companies(
  id,name,country_code,base_currency,fiscal_year_end_month,
  fiscal_year_end_day,timezone,created_by)
 VALUES
  (client_id,'Escalation client test','GB','GBP',12,31,'UTC',owner_id),
  (foreign_company,'Escalation unrelated client','GB','GBP',12,31,'UTC',outsider_id);
 PERFORM set_config('linkbooks.trusted','on',true);
 INSERT INTO public.company_members(company_id,user_id,role)
 VALUES(client_id,owner_id,'owner'),
       (client_id,staff_id,'accountant'),
       (foreign_company,outsider_id,'owner')
 ON CONFLICT(company_id,user_id) DO NOTHING;
 PERFORM set_config('linkbooks.trusted','off',true);
 PERFORM set_config('test.esc_owner',owner_id::text,true);
 PERFORM set_config('test.esc_staff',staff_id::text,true);
 PERFORM set_config('test.esc_client',client_id::text,true);
 PERFORM set_config('test.esc_outsider',outsider_id::text,true);
 PERFORM set_config('request.jwt.claims',
  jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
 owner_id uuid:=current_setting('test.esc_owner')::uuid;
 staff_id uuid:=current_setting('test.esc_staff')::uuid;
 client_id uuid:=current_setting('test.esc_client')::uuid;
 fid uuid;
 affected integer;
BEGIN
 fid:=public.create_practice_firm('Escalation authorization checks');
 PERFORM set_config('test.esc_firm',fid::text,true);
 INSERT INTO public.firm_members(firm_id,user_id,role)
 VALUES(fid,staff_id,'member');
 PERFORM public.manage_practice_client(fid,client_id,'view',false);
 INSERT INTO public.firm_client_assignments(
  firm_id,company_id,user_id,responsibility,updated_by)
 VALUES(fid,client_id,staff_id,'manager',owner_id);
 INSERT INTO public.firm_client_onboarding_steps(
  firm_id,company_id,task_key,title,due_date,updated_by)
 VALUES(fid,client_id,'escalation_first','Overdue review',
  current_date-3,owner_id);
 INSERT INTO public.firm_onboarding_escalation_policies(firm_id,enabled,updated_by)
 VALUES(fid,false,owner_id);
 IF (SELECT enabled FROM public.firm_onboarding_escalation_policies
  WHERE firm_id=fid) THEN
  RAISE EXCEPTION 'Escalations unexpectedly enabled';
 END IF;
 UPDATE public.firm_onboarding_escalation_policies
  SET enabled=true,updated_by=owner_id
  WHERE firm_id=fid AND version=1;
 IF NOT EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_policies
  WHERE firm_id=fid AND version=2 AND enabled) THEN
  RAISE EXCEPTION 'Policy version did not advance';
 END IF;
 UPDATE public.firm_onboarding_escalation_policies
  SET repeat_every_days=4,updated_by=owner_id
  WHERE firm_id=fid AND version=1;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Stale policy update succeeded'; END IF;
 BEGIN
  UPDATE public.firm_onboarding_escalation_policies
   SET version=77,updated_by=owner_id WHERE firm_id=fid;
  RAISE EXCEPTION 'TEST: Policy version was forged';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.firm_onboarding_escalation_policies
    SET first_overdue_days=0,updated_by=owner_id WHERE firm_id=fid;
  RAISE EXCEPTION 'TEST: Invalid threshold accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',staff_id,'aal','aal2','role','authenticated')::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_policies
  WHERE firm_id=fid AND enabled) THEN
  RAISE EXCEPTION 'Firm member cannot read policy';
 END IF;
 UPDATE public.firm_onboarding_escalation_policies
   SET enabled=false,updated_by=staff_id WHERE firm_id=fid;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Member changed escalation policy'; END IF;
 IF EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_events
  WHERE firm_id=fid) THEN RAISE EXCEPTION 'Member saw private manager history'; END IF;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',owner_id,'aal','aal1','role','authenticated')::text,true);
 IF EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_policies
  WHERE firm_id=fid) THEN RAISE EXCEPTION 'MFA policy read bypassed'; END IF;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true);
END $$;
RESET ROLE;
DO $$
DECLARE
 fid uuid:=current_setting('test.esc_firm')::uuid;
 client_id uuid:=current_setting('test.esc_client')::uuid;
 staff_id uuid:=current_setting('test.esc_staff')::uuid;
 first integer;
 second integer;
BEGIN
 -- Confirm policy opt-out before enabling any delivery.
 UPDATE public.firm_onboarding_escalation_policies
   SET enabled=false,updated_by=current_setting('test.esc_owner')::uuid
   WHERE firm_id=fid;
 IF private.firm_onboarding_manager_escalations()<>0 THEN
   RAISE EXCEPTION 'Disabled policy generated an escalation';
 END IF;
 UPDATE public.firm_onboarding_escalation_policies
   SET enabled=true,updated_by=current_setting('test.esc_owner')::uuid
   WHERE firm_id=fid;
 first:=private.firm_onboarding_manager_escalations();
 second:=private.firm_onboarding_manager_escalations();
 IF first<>1 OR second<>0 THEN
  RAISE EXCEPTION 'Manager escalation is not idempotent: %, %',first,second;
 END IF;
 IF (SELECT count(*) FROM public.firm_onboarding_escalation_events
    WHERE firm_id=fid AND recipient_user_id=staff_id AND overdue_days=3)<>1 THEN
  RAISE EXCEPTION 'Escalation history did not record delivery';
 END IF;
 IF (SELECT count(*) FROM public.action_notifications
    WHERE company_id=client_id AND recipient_user_id=staff_id
      AND event_key LIKE 'firm-onboard-escalation:%')<>1 THEN
  RAISE EXCEPTION 'Manager notification missing';
 END IF;
 INSERT INTO public.firm_client_onboarding_steps(
  firm_id,company_id,task_key,title,due_date,updated_by)
 VALUES(fid,client_id,'escalation_denied','Overdue denied target',
  current_date-3,current_setting('test.esc_owner')::uuid);
 INSERT INTO public.member_permission_adjustments(
  company_id,user_id,permission,effect,created_by)
 VALUES(client_id,staff_id,'accounting.view','deny',current_setting('test.esc_owner')::uuid);
 IF private.firm_onboarding_manager_escalations()<>0 THEN
  RAISE EXCEPTION 'Denied client accounting permission still escalated';
 END IF;
 IF EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_events
   WHERE firm_id=fid AND task_key='escalation_denied') THEN
  RAISE EXCEPTION 'Denied manager was recorded in escalation history';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job
    WHERE jobname='linkbooks-firm-onboarding-manager-escalations') THEN
  RAISE EXCEPTION 'Scheduled manager escalation job missing';
 END IF;
END $;
SET LOCAL ROLE authenticated;
DO $
DECLARE
 fid uuid:=current_setting('test.esc_firm')::uuid;
 owner_id uuid:=current_setting('test.esc_owner')::uuid;
 staff_id uuid:=current_setting('test.esc_staff')::uuid;
BEGIN
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',owner_id,'aal','aal2','role','authenticated')::text,true);
 IF (SELECT count(*) FROM public.firm_onboarding_escalation_events
    WHERE firm_id=fid)<>1 THEN
   RAISE EXCEPTION 'Firm admin did not see authorized escalation history';
 END IF;
 BEGIN
   INSERT INTO public.firm_onboarding_escalation_events(
     firm_id,company_id,task_key,recipient_user_id,escalated_on,overdue_days,policy_version)
   VALUES(fid,current_setting('test.esc_client')::uuid,'forged',owner_id,current_date,3,2);
   RAISE EXCEPTION 'TEST: Client forged escalation history';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',staff_id,'aal','aal2','role','authenticated')::text,true);
 IF EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_events
    WHERE firm_id=fid) THEN
   RAISE EXCEPTION 'Nonadmin saw private escalation history';
 END IF;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',owner_id,'aal','aal1','role','authenticated')::text,true);
 IF EXISTS(SELECT 1 FROM public.firm_onboarding_escalation_events
    WHERE firm_id=fid) THEN
   RAISE EXCEPTION 'Escalation history bypassed MFA restriction';
 END IF;
END $;
ROLLBACK;
SELECT 'firm escalation opt-in, permissions, version guards, history, dedup and MFA passed; rolled back' AS result;
