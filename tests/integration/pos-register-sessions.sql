\set c '20000000-0000-4000-8000-000000000001'
\set r '50000000-0000-4000-8000-000000000001'
\set loc '30000000-0000-4000-8000-000000000001'
\set cash '40000000-0000-4000-8000-000000000001'
SELECT public.test_assert(NOT has_function_privilege('anon','public.pos_open_session(uuid,uuid,uuid,bigint)','EXECUTE'),'anonymous API denied');
SELECT public.test_assert(NOT has_function_privilege('anon','private.pos_open_session(uuid,uuid,uuid,bigint)','EXECUTE'),'anonymous private command denied');
SELECT public.test_assert(NOT has_table_privilege('authenticated','public.pos_register_sessions','UPDATE'),'no direct session mutations');
SELECT public.test_assert(NOT has_table_privilege('authenticated','public.pos_location_access','INSERT'),'no direct access grants');
SELECT public.test_assert((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.pos_registers'::regclass,'public.pos_register_sessions'::regclass,'public.pos_location_access'::regclass)),'RLS enabled on all POS tables');
INSERT INTO public.pos_registers(id,company_id,location_id,cash_account_id,code,name)
VALUES('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','FOREIGN','Foreign Counter');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);
SELECT public.pos_create_register(:'c',:'r',:'loc',:'cash','TILL-1','Front Counter');
SELECT public.test_raises($q$SELECT public.pos_create_register('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','FOREIGN','Foreign Counter')$q$,'location|conflicts','foreign-register replay cannot claim success');

SELECT public.test_assert(public.pos_create_register(:'c',:'r',:'loc',:'cash','TILL-1','Front Counter')=:'r'::uuid,'register create replay is idempotent');
SELECT public.test_raises($q$SELECT public.pos_create_register('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','CHANGED','Front Counter')$q$,'conflicts','changed register request rejected');
SELECT public.test_raises($q$SELECT public.pos_create_register('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','FOREIGN','Bad')$q$,'active company location','foreign location denied');
SELECT public.test_raises($q$SELECT public.pos_create_register('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','FOREIGN','Bad')$q$,'cash asset account','foreign cash account denied');
SELECT public.test_raises($q$SELECT public.pos_create_register('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','BADTYPE','Bad')$q$,'cash asset account','revenue cash mapping denied');
SELECT public.test_assert(jsonb_array_length(public.pos_get_workspace(:'c')->'registers')=1,'manager sees configured register');
SELECT public.pos_set_location_access(:'c',:'loc','10000000-0000-4000-8000-000000000002',true);
SELECT public.test_raises($q$SELECT public.pos_set_location_access('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',NULL)$q$,'Invalid','null access action rejected');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.pos_location_access WHERE user_id='10000000-0000-4000-8000-000000000002'),'invalid access action cannot revoke a grant');

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003"}',false);
SELECT public.test_assert((SELECT count(*)=0 FROM public.pos_registers),'cashier without location grant sees no register');
SELECT public.test_raises($q$SELECT public.pos_open_session('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',10000)$q$,'unavailable','cashier without location grant cannot open');
SELECT public.test_raises($q$SELECT public.pos_set_location_access('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',true)$q$,'permission denied','cashier cannot self-grant location');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002"}',false);
SELECT public.test_assert((SELECT count(*)=1 FROM public.pos_registers),'assigned cashier reads own location register');
SELECT public.test_assert(jsonb_array_length(public.pos_get_workspace(:'c')->'cashAccounts')=0,'cashier receives no account picker');
SELECT public.test_raises($q$SELECT public.pos_open_session('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',-1)$q$,'Invalid','negative opening float rejected');
SELECT public.pos_open_session(:'c',:'r','60000000-0000-4000-8000-000000000001',9007199254740993);
SELECT public.test_assert((public.pos_get_workspace(:'c')->'openSessions'->0->>'opening_float_minor')='9007199254740993','bigint float serialized exactly as text');
SELECT public.test_assert(public.pos_open_session(:'c',:'r','60000000-0000-4000-8000-000000000001',9007199254740993)=(SELECT id FROM public.pos_register_sessions LIMIT 1),'opening retry returns original session');
SELECT public.test_raises($q$SELECT public.pos_open_session('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1)$q$,'payload differs','opening replay changed amount rejected');
SELECT public.test_raises($q$SELECT public.pos_open_session('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',1)$q$,'open session|duplicate key','second open session rejected');
SELECT public.test_raises($q$SELECT public.pos_close_session('20000000-0000-4000-8000-000000000001',(SELECT id FROM public.pos_register_sessions LIMIT 1),'70000000-0000-4000-8000-000000000001',1)$q$,'variance','variance cannot silently close');
SELECT public.test_assert((SELECT closed_at IS NULL FROM public.pos_register_sessions LIMIT 1),'variance failure leaves session open');
SELECT public.pos_close_session(:'c',(SELECT id FROM public.pos_register_sessions LIMIT 1),'70000000-0000-4000-8000-000000000001',9007199254740993);
SELECT public.test_assert(public.pos_close_session(:'c',(SELECT id FROM public.pos_register_sessions LIMIT 1),'70000000-0000-4000-8000-000000000001',9007199254740993) IS NOT NULL,'closing retry idempotent');
SELECT public.test_raises($q$SELECT public.pos_close_session('20000000-0000-4000-8000-000000000001',(SELECT id FROM public.pos_register_sessions LIMIT 1),'70000000-0000-4000-8000-000000000002',9007199254740993)$q$,'locked','closed session cannot be rewritten');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004"}',false);
SELECT public.test_assert((SELECT count(*)=0 FROM public.pos_register_sessions),'foreign tenant sees no sessions');
SELECT public.test_raises($q$SELECT public.pos_get_workspace('20000000-0000-4000-8000-000000000001')$q$,'permission denied','foreign tenant cannot call workspace RPC');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);
SELECT public.pos_set_location_access(:'c',:'loc','10000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002"}',false);
SELECT public.test_assert((SELECT count(*)=0 FROM public.pos_register_sessions),'revoked location hides session history');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);
SELECT set_config('test.fail_audit','on',false);
SELECT public.test_raises($q$SELECT public.pos_open_session('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003',0)$q$,'Injected audit failure','audit failure rolls back opening');
SELECT set_config('test.fail_audit','off',false);
SELECT public.test_assert((SELECT count(*)=0 FROM public.pos_register_sessions WHERE closed_at IS NULL),'no session survives failed audit');
RESET ROLE;
SELECT public.test_assert((SELECT count(*)=1 FROM public.audit_events WHERE action='pos.register.created'),'register replay did not duplicate audit');
SELECT public.test_assert((SELECT count(*)=1 FROM public.audit_events WHERE action='pos.session.opened'),'opening replay did not duplicate audit');
SELECT public.test_assert((SELECT count(*)=1 FROM public.audit_events WHERE action='pos.session.closed'),'closing replay did not duplicate audit');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pos_%' AND p.prosecdef),'no exposed SECURITY DEFINER POS functions');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'pos_%' AND NOT ('search_path=""'=ANY(p.proconfig))),'guarded POS functions pin search path');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);
SELECT set_config('test.fail_audit','on',false);
SELECT public.test_raises($q$SELECT public.pos_create_register('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000099','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','ROLLBACK','Rollback')$q$,'Injected audit failure','audit failure rolls back register creation');
SELECT set_config('test.fail_audit','off',false);
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.pos_registers WHERE code='ROLLBACK'),'no register survives failed audit');
SELECT public.pos_open_session(:'c',:'r','60000000-0000-4000-8000-000000000004',100);
SELECT set_config('test.fail_audit','on',false);
SELECT public.test_raises($q$SELECT public.pos_close_session('20000000-0000-4000-8000-000000000001',(SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL),'70000000-0000-4000-8000-000000000004',100)$q$,'Injected audit failure','audit failure rolls back close');
SELECT set_config('test.fail_audit','off',false);
SELECT public.test_assert((SELECT count(*)=1 FROM public.pos_register_sessions WHERE closed_at IS NULL),'failed audited close remains open');
SELECT public.pos_close_session(:'c',(SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL),'70000000-0000-4000-8000-000000000004',100);
RESET ROLE;
