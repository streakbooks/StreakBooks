-- Synthetic Postgres component tests. No network, service credentials or production data.
CREATE SCHEMA fixture;
GRANT USAGE ON SCHEMA fixture TO authenticated;
CREATE FUNCTION fixture.login(n integer, aal text DEFAULT 'aal2') RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',format('00000000-0000-4000-8000-%s',lpad(n::text,12,'0')),
    'session_id',format('10000000-0000-4000-8000-%s',lpad(n::text,12,'0')),'aal',aal,'iat',floor(extract(epoch from now())))::text,false);
END $$;
CREATE FUNCTION fixture.denied(stmt text, pattern text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text;
BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
  IF message IS NULL OR message !~ pattern THEN RAISE EXCEPTION 'Expected %; got % for %',pattern,coalesce(message,'SUCCESS'),stmt; END IF;
END $$;
INSERT INTO auth.users(id,email) SELECT format('00000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,'fixture'||n||'@example.invalid' FROM generate_series(1,6) n;
INSERT INTO auth.sessions(id,user_id) SELECT format('10000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,id FROM (SELECT id,row_number() OVER(ORDER BY id) n FROM auth.users) u;
INSERT INTO public.platform_roles VALUES('00000000-0000-4000-8000-000000000001','platform_owner'),('00000000-0000-4000-8000-000000000002','platform_owner'),('00000000-0000-4000-8000-000000000003','platform_support'),('00000000-0000-4000-8000-000000000004','platform_finance');
INSERT INTO public.platform_custom_roles(id,name,scope,permissions) VALUES('60000000-0000-4000-8000-000000000001','Approver fixture','platform',ARRAY['approvals.view','approvals.manage']);
INSERT INTO public.platform_role_assignments(user_id,role_id) VALUES('00000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000001');
INSERT INTO public.companies(id,name) SELECT format('20000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,'Synthetic business '||n FROM generate_series(1,4) n ON CONFLICT DO NOTHING;
INSERT INTO public.company_members(company_id,user_id,status) VALUES('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','active');
INSERT INTO public.company_members(company_id,user_id,status) VALUES('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005','active');
INSERT INTO public.journals(company_id,journal_date,status,source_type) VALUES('20000000-0000-4000-8000-000000000001',current_date,'posted','synthetic');
INSERT INTO public.journals(company_id,journal_date,status,source_type) SELECT '20000000-0000-4000-8000-000000000001',current_date-n,'posted','synthetic' FROM generate_series(1,30) n;
SET ROLE authenticated;
SELECT fixture.login(5);
DO $$ BEGIN
 IF public.company_break_glass_log('20000000-0000-4000-8000-000000000004')::text LIKE '%Private legacy%' THEN RAISE EXCEPTION 'Legacy private reason disclosed'; END IF;
END $$;
SELECT fixture.denied($q$SELECT public.platform_supervised_support_list()$q$,'Platform permission');
SELECT fixture.denied($q$SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000001','Tenant denied',now()+interval '1 hour',NULL)$q$,'Platform permission');
SELECT fixture.denied($q$SELECT * FROM public.break_glass_grants$q$,'permission denied');
SELECT fixture.denied($q$INSERT INTO public.platform_support_grants(user_id,company_id,expires_at,reason) VALUES(auth.uid(),'20000000-0000-4000-8000-000000000001',now()+interval '1 hour','Bypass denied')$q$,'permission denied');
SELECT fixture.denied($q$SELECT public.company_break_glass_log('20000000-0000-4000-8000-000000000002')$q$,'Company membership');
SELECT fixture.login(1,'aal1');
SELECT fixture.denied($q$SELECT public.platform_supervised_support_list()$q$,'Platform permission');
SELECT fixture.login(1);
SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000004','Replace legacy request',now()+interval '1 hour','30000000-0000-4000-8000-000000000008');
SELECT public.platform_revoke_break_glass('30000000-0000-4000-8000-000000000008','Cancel replacement fixture');
SELECT fixture.denied($q$SELECT public.platform_mutate('support.grant',NULL,jsonb_build_object('user_id',auth.uid(),'company_id','20000000-0000-4000-8000-000000000001'),'Legacy bypass')$q$,'approved support request');
SELECT fixture.denied($q$SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000001','Too long',now()+interval '5 hours',NULL)$q$,'within four hours');
SELECT fixture.denied($q$SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000001','Missing expiry',NULL,NULL)$q$,'within four hours');
SELECT fixture.denied($q$SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000099','Missing company',now()+interval '1 hour',NULL)$q$,'not found');
SELECT fixture.denied($q$SELECT public.platform_support_read('20000000-0000-4000-8000-000000000001')$q$,'unexpired support grant');
SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000001','Investigate synthetic posting metadata',now()+interval '1 hour','30000000-0000-4000-8000-000000000001');
SELECT fixture.denied($q$SELECT public.platform_decide_break_glass('30000000-0000-4000-8000-000000000001','approved','Self approval denied')$q$,'second person');
SELECT fixture.denied($q$SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000001','Duplicate',now()+interval '1 hour',NULL)$q$,'already has');
SELECT fixture.login(3);
SELECT fixture.denied($q$SELECT public.platform_decide_break_glass('30000000-0000-4000-8000-000000000001','approved','Wrong permission denied')$q$,'Platform permission approvals.manage');
SELECT fixture.login(6);
SELECT public.platform_decide_break_glass('30000000-0000-4000-8000-000000000001','approved','Independent approver checked scope');
SELECT fixture.denied($q$SELECT public.platform_decide_break_glass('30000000-0000-4000-8000-000000000001','approved','Replay denied')$q$,'no longer pending');
SELECT fixture.login(2);
SELECT fixture.denied($q$SELECT public.platform_support_read('20000000-0000-4000-8000-000000000001')$q$,'unexpired support grant');
SELECT fixture.login(1);
DO $$ BEGIN
  IF jsonb_array_length(public.platform_support_read('20000000-0000-4000-8000-000000000001')) <> 25 THEN RAISE EXCEPTION 'Approved requester cannot read bounded metadata'; END IF;
END $$;
SELECT fixture.denied($q$SELECT public.platform_support_read('20000000-0000-4000-8000-000000000002')$q$,'unexpired support grant');
SELECT fixture.denied($q$SELECT * FROM public.journals$q$,'permission denied');
RESET ROLE;
INSERT INTO public.platform_tenant_controls(company_id,status) VALUES('20000000-0000-4000-8000-000000000001','archived');
SET ROLE authenticated; SELECT fixture.login(1);
SELECT fixture.denied($q$SELECT public.platform_support_read('20000000-0000-4000-8000-000000000001')$q$,'unexpired support grant');
RESET ROLE; UPDATE public.platform_tenant_controls SET status='active' WHERE company_id='20000000-0000-4000-8000-000000000001';
SET ROLE authenticated; SELECT fixture.login(1);
SELECT public.platform_revoke_break_glass('30000000-0000-4000-8000-000000000001','Investigation complete');
SELECT fixture.denied($q$SELECT public.platform_support_read('20000000-0000-4000-8000-000000000001')$q$,'unexpired support grant');
SELECT fixture.login(5);
DO $$ DECLARE log jsonb; BEGIN
  log:=public.company_break_glass_log('20000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(log)<>4 OR NOT (log->0 ? 'actor_id') OR NOT (log->0 ? 'scope') OR NOT (log->0 ? 'reason') THEN RAISE EXCEPTION 'Customer log omitted scope, reason, actor or lifecycle'; END IF;
END $$;
RESET ROLE;
-- Direct legacy grant insertion and unapproved reactivation fail even inside privileged RPC code.
SELECT fixture.denied($q$INSERT INTO public.platform_support_grants(user_id,company_id,expires_at,reason) VALUES('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',now()+interval '1 hour','Legacy bypass')$q$,'approved support request');
INSERT INTO public.approval_requests(id,kind,requester_id,reason,expires_at) VALUES('40000000-0000-4000-8000-000000000001','refund','00000000-0000-4000-8000-000000000001','Unsupported type fixture',now()+interval '1 hour');
SET ROLE authenticated;
SELECT fixture.login(2);
SELECT fixture.denied($q$SELECT public.platform_decide_approval('40000000-0000-4000-8000-000000000001','approved','No handler available')$q$,'no executable approval handler');
SELECT public.platform_decide_approval('40000000-0000-4000-8000-000000000001','rejected','Refuse unsupported request');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.platform_support_grants)<>1 THEN RAISE EXCEPTION 'Duplicate access effect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_audit WHERE action='support.read' AND actor_user_id='00000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Missing read audit'; END IF;
 IF (SELECT count(*) FROM public.platform_audit WHERE action='approval.decide')<>2 THEN RAISE EXCEPTION 'Decision audit or rollback incorrect'; END IF;
END $$;
-- Revoked live session and banned account invalidate permissions immediately.
DELETE FROM auth.sessions WHERE user_id='00000000-0000-4000-8000-000000000002';
SET ROLE authenticated; SELECT fixture.login(2);
SELECT fixture.denied($q$SELECT public.platform_supervised_support_list()$q$,'Platform permission');
RESET ROLE;
DELETE FROM auth.sessions WHERE user_id='00000000-0000-4000-8000-000000000005';
SET ROLE authenticated; SELECT fixture.login(5);
SELECT fixture.denied($q$SELECT public.company_break_glass_log('20000000-0000-4000-8000-000000000001')$q$,'Company membership');
RESET ROLE;
-- Real clock expiry: an approved grant becomes unreadable before any cleanup worker runs.
SET ROLE authenticated; SELECT fixture.login(3);
SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000002','Expiry fixture',now()+interval '5 seconds','30000000-0000-4000-8000-000000000002');
SELECT fixture.login(6);
SELECT public.platform_decide_break_glass('30000000-0000-4000-8000-000000000002','approved','Approve expiry fixture');
SELECT fixture.login(3);
SELECT public.platform_support_read('20000000-0000-4000-8000-000000000002');
SELECT pg_sleep(5.1);
SELECT fixture.denied($q$SELECT public.platform_support_read('20000000-0000-4000-8000-000000000002')$q$,'unexpired support grant');
SELECT public.platform_expire_break_glass('30000000-0000-4000-8000-000000000002');
SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000002','Pending expiry fixture',now()+interval '1 second','30000000-0000-4000-8000-000000000003');
SELECT pg_sleep(1.1);
SELECT public.platform_request_break_glass('20000000-0000-4000-8000-000000000002','Replace expired pending request',now()+interval '1 hour','30000000-0000-4000-8000-000000000004');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT status FROM public.break_glass_grants WHERE id='30000000-0000-4000-8000-000000000002')<>'expired' THEN RAISE EXCEPTION 'Expiry not persisted'; END IF;
 IF (SELECT status FROM public.break_glass_grants WHERE id='30000000-0000-4000-8000-000000000003')<>'expired' THEN RAISE EXCEPTION 'Expired pending request not released'; END IF;
 IF (SELECT count(*) FROM public.platform_audit WHERE action='break_glass.expire')<>2 THEN RAISE EXCEPTION 'Expiry missing audit'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
   LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE n.nspname='public' AND p.proname IN ('platform_request_break_glass','platform_decide_break_glass','platform_decide_approval','platform_revoke_break_glass','platform_expire_break_glass','platform_supervised_support_list','company_break_glass_log')
   AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC execute leaked'; END IF;
END $$;
