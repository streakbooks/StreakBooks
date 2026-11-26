INSERT INTO auth.users(id,email,last_sign_in_at) VALUES
 ('10000000-0000-0000-0000-000000000001','owner@test.invalid',now()),
 ('10000000-0000-0000-0000-000000000002','staff1@test.invalid',now()),
 ('10000000-0000-0000-0000-000000000003','staff2@test.invalid',now()),
 ('10000000-0000-0000-0000-000000000004','client1@test.invalid',now()),
 ('10000000-0000-0000-0000-000000000005','client2@test.invalid',now()),
 ('10000000-0000-0000-0000-000000000006','stale@test.invalid',now()-interval '121 days'),
 ('10000000-0000-0000-0000-000000000007','firm-admin@test.invalid',now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name) SELECT id,split_part(email,'@',1) FROM auth.users
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.companies(id,name) VALUES
 ('20000000-0000-0000-0000-000000000001','Client A'),
 ('20000000-0000-0000-0000-000000000002','Client B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.firms(id,name,created_by) VALUES ('30000000-0000-0000-0000-000000000001','Firm One','10000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.firm_members(firm_id,user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','member'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','member'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','admin')
ON CONFLICT (firm_id,user_id) DO NOTHING;
INSERT INTO public.company_members(company_id,user_id,role) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','owner'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','owner'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005','owner'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000006','owner')
ON CONFLICT (company_id,user_id) DO NOTHING;
INSERT INTO public.role_permissions(role,permission) VALUES
 ('owner','company.view'),('owner','company.settings.edit'),('owner','members.manage'),('owner','accounting.view'),('owner','accounting.export'),('owner','accounting.post'),
 ('admin','company.view'),('admin','accounting.view'),('admin','accounting.export'),('admin','accounting.post'),
 ('read_only','company.view'),('read_only','accounting.view'),('read_only','accounting.export'),('bookkeeper','company.view'),('bookkeeper','accounting.view'),('bookkeeper','accounting.export'),('bookkeeper','accounting.post')
ON CONFLICT (role,permission) DO NOTHING;

-- Link both clients. The caller already has a client admin role; the RPC must not add any staff seats.
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001"}',false);
SELECT public.manage_practice_client('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','full',false);
SELECT public.manage_practice_client('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','full',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.company_members) <> 5 THEN RAISE EXCEPTION 'Firm-managed membership consumed a client seat'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firm_client_access_grants
      WHERE firm_id='30000000-0000-0000-0000-000000000001'
        AND company_id='20000000-0000-0000-0000-000000000001'
        AND user_id='10000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Legacy firm access grant was not migrated';
  END IF;
END $$;
INSERT INTO public.firm_client_access_grants(firm_id,company_id,user_id,role,granted_by) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','bookkeeper','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','bookkeeper','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','admin','10000000-0000-0000-0000-000000000001')
ON CONFLICT (firm_id,company_id,user_id) DO UPDATE SET role=excluded.role,revoked_at=NULL;

UPDATE public.firm_client_access_grants SET role='admin'
WHERE user_id='10000000-0000-0000-0000-000000000002' AND company_id='20000000-0000-0000-0000-000000000001';

-- Two staff, two clients: each portfolio and permission helper is isolated to its explicit grant.
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002"}',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Staff 1 denied assigned Client A'; END IF;
  IF public.has_company_permission('20000000-0000-0000-0000-000000000002','accounting.view') THEN RAISE EXCEPTION 'Staff 1 leaked Client B'; END IF;
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.post') THEN RAISE EXCEPTION 'Unapproved posting was granted'; END IF;
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','sales.draft') THEN RAISE EXCEPTION 'Unapproved transaction drafting was granted'; END IF;
  IF (SELECT count(*) FROM public.firm_client_portfolio('30000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'Staff 1 portfolio was not grant-scoped'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.firm_client_links WHERE firm_id='30000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'RLS exposed an unassigned client link to Staff 1';
  END IF;
END $$;
RESET ROLE;
SELECT public.record_firm_client_access('20000000-0000-0000-0000-000000000001','accounting');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003"}',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000002','accounting.view') THEN RAISE EXCEPTION 'Staff 2 denied assigned Client B'; END IF;
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Staff 2 leaked Client A'; END IF;
  IF (SELECT count(*) FROM public.firm_client_portfolio('30000000-0000-0000-0000-000000000001')) <> 1 THEN RAISE EXCEPTION 'Staff 2 portfolio was not grant-scoped'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.firm_client_links WHERE firm_id='30000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'RLS exposed an unassigned client link to Staff 2';
  END IF;
END $$;
RESET ROLE;

-- A delegated staff member can switch between the multiple clients they are explicitly granted.
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001"}',false);
INSERT INTO public.firm_client_access_grants(firm_id,company_id,user_id,role,granted_by) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002','bookkeeper','10000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002"}',false);
DO $$ BEGIN
  IF jsonb_array_length(public.platform_company_context()) <> 2 THEN
    RAISE EXCEPTION 'Company switcher did not expose both granted clients';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.platform_company_context()) c
    WHERE c->>'id'='20000000-0000-0000-0000-000000000001' AND c->>'firm_access'='true') THEN
    RAISE EXCEPTION 'Company context did not identify a firm-granted client workspace';
  END IF;
END $$;
UPDATE public.firm_client_access_grants SET revoked_at=now()
WHERE firm_id='30000000-0000-0000-0000-000000000001'
  AND company_id='20000000-0000-0000-0000-000000000002'
  AND user_id='10000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  IF jsonb_array_length(public.platform_company_context()) <> 1 THEN
    RAISE EXCEPTION 'Revoked client remained in the company switcher';
  END IF;
END $$;

-- A firm can assign its owner the admin role but still cannot self-approve elevated permissions.
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007"}',false);
DO $$ BEGIN
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.post') THEN RAISE EXCEPTION 'Firm admin self-granted elevated access'; END IF;
END $$;
INSERT INTO public.firm_client_permission_requests(firm_id,company_id,user_id,permission_keys,request_reason,requested_by)
VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000007', ARRAY['accounting.post','sales.draft'],
  'Client asked the accountant to draft sales documents and post approved journals','10000000-0000-0000-0000-000000000007');
DO $$ BEGIN
  BEGIN
    UPDATE public.firm_client_permission_requests
      SET status='approved',reviewed_by='10000000-0000-0000-0000-000000000007',
        reviewed_at=now(),review_reason='Attempted self approval'
    WHERE company_id='20000000-0000-0000-0000-000000000001'
      AND requested_by='10000000-0000-0000-0000-000000000007';
    RAISE EXCEPTION 'Firm request owner approved their own elevated access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004"}',false);
UPDATE public.firm_client_permission_requests SET status='approved',reviewed_by='10000000-0000-0000-0000-000000000004',
  reviewed_at=now(),review_reason='Approved by client owner' WHERE company_id='20000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007"}',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.post') THEN RAISE EXCEPTION 'Client-approved posting permission missing'; END IF;
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','sales.draft') THEN RAISE EXCEPTION 'Client-approved transaction creation permission missing'; END IF;
END $$;

-- Client can see staff, module and timestamp; logged access is not a client data copy.
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004"}',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.firm_client_access_log('20000000-0000-0000-0000-000000000001')) < 1 THEN RAISE EXCEPTION 'Client access log is empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firm_client_access_log('20000000-0000-0000-0000-000000000001') WHERE module_key='accounting') THEN
    RAISE EXCEPTION 'Client access log did not identify the visited module';
  END IF;
END $$;

-- Firm suspension and link disconnect stop delegated access but preserve client view/export access.
UPDATE public.firms SET status='suspended' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002"}',false);
DO $$ BEGIN
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Suspended firm retained access'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004"}',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Firm suspension blocked client read'; END IF;
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.export') THEN RAISE EXCEPTION 'Firm suspension blocked client export'; END IF;
END $$;
UPDATE public.firms SET status='disputed' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002"}',false);
DO $$ BEGIN
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Disputed firm retained delegated access'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004"}',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Firm dispute blocked client read'; END IF;
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.export') THEN RAISE EXCEPTION 'Firm dispute blocked client export'; END IF;
END $$;
UPDATE public.firms SET status='active' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT set_config('test.write_allowed','false',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Tenant suspension blocked client read-only access'; END IF;
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.post') THEN RAISE EXCEPTION 'Tenant suspension allowed client writes'; END IF;
END $$;
SELECT set_config('test.write_allowed','true',false);
UPDATE public.firms SET status='active' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT public.disconnect_firm_client('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002"}',false);
DO $$ BEGIN
  IF public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Disconnected firm retained access'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004"}',false);
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Disconnect blocked client read'; END IF;
END $$;

-- Consent gates firm payer changes; changing payer does not change client access.
UPDATE public.firm_client_links SET revoked_at=NULL WHERE firm_id='30000000-0000-0000-0000-000000000001' AND company_id='20000000-0000-0000-0000-000000000001';
INSERT INTO public.company_subscriptions(company_id,plan_code,status,provider,unit_amount_minor) VALUES
 ('20000000-0000-0000-0000-000000000001','pro','active','stripe',1000),
 ('20000000-0000-0000-0000-000000000002','pro','trialing','stripe',1000);
DO $$ BEGIN
  BEGIN
    UPDATE public.company_subscriptions SET payer_kind='firm',payer_firm_id='30000000-0000-0000-0000-000000000001'
    WHERE company_id='20000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Firm payer was accepted without consent';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.firm_subscription_payer_consents(firm_id,company_id,accepted_by)
VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004');
UPDATE public.company_subscriptions SET payer_kind='firm',payer_firm_id='30000000-0000-0000-0000-000000000001'
WHERE company_id='20000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF NOT public.has_company_permission('20000000-0000-0000-0000-000000000001','accounting.view') THEN RAISE EXCEPTION 'Payer change lost client access'; END IF;
  IF (SELECT payer_kind FROM public.company_subscriptions WHERE company_id='20000000-0000-0000-0000-000000000001') <> 'firm' THEN RAISE EXCEPTION 'Payer not stored'; END IF;
END $$;

-- Paid and recently used clients count. Trials and >120-day dormant clients do not.
UPDATE public.firm_client_links SET revoked_at=NULL WHERE firm_id='30000000-0000-0000-0000-000000000001' AND company_id='20000000-0000-0000-0000-000000000001';
UPDATE public.firms SET status='active' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT billing.set_firm_partner_tier('base',0,0);
SELECT billing.set_firm_partner_tier('active',1,500);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001"}',false);
DO $$ DECLARE n bigint; tier text; discount integer; BEGIN
  SELECT active_paid_clients,tier_code,discount_bps INTO n,tier,discount
  FROM billing.firm_partner_tier_summary('30000000-0000-0000-0000-000000000001');
  IF n <> 1 OR tier <> 'active' OR discount <> 500 THEN
    RAISE EXCEPTION 'Tier criteria incorrect: count %, tier %, discount %',n,tier,discount;
  END IF;
  UPDATE public.company_subscriptions SET status='active' WHERE company_id='20000000-0000-0000-0000-000000000002';
  UPDATE auth.users SET last_sign_in_at=now()-interval '121 days'
    WHERE id='10000000-0000-0000-0000-000000000005';
  SELECT active_paid_clients INTO n FROM billing.firm_partner_tier_summary('30000000-0000-0000-0000-000000000001');
  IF n <> 1 THEN RAISE EXCEPTION 'Dormant client counted toward partner tier: %',n; END IF;
END $$;
