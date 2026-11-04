-- Transactional synthetic integration test. The migration must be applied first,
-- or prepended to the transaction during schema preflight.
BEGIN;
DO $$
DECLARE
 u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
 c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); billing uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  (u1,'firm-completion-'||u1||'@example.invalid','{}'),
  (u2,'firm-completion-'||u2||'@example.invalid','{}');
 INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
 VALUES (gen_random_uuid(),u1,'totp','verified',now(),now());
 INSERT INTO public.companies(id,name,country_code,base_currency,
  fiscal_year_end_month,fiscal_year_end_day,timezone,created_by)
 VALUES (c1,'Firm completion client','GB','GBP',12,31,'UTC',u1),
        (c2,'Unrelated company','GB','GBP',12,31,'UTC',u2),
        (billing,'Practice billing company','GB','GBP',12,31,'UTC',u1);
 PERFORM set_config('linkbooks.trusted','on',true);
 INSERT INTO public.company_members(company_id,user_id,role) VALUES
  (c1,u1,'owner'),(c1,u2,'accountant'),(c2,u2,'owner'),(billing,u1,'owner')
 ON CONFLICT(company_id,user_id) DO NOTHING;
 PERFORM set_config('linkbooks.trusted','off',true);
 PERFORM set_config('test.fcp_u1',u1::text,true);
 PERFORM set_config('test.fcp_u2',u2::text,true);
 PERFORM set_config('test.fcp_c1',c1::text,true);
 PERFORM set_config('test.fcp_c2',c2::text,true);
 PERFORM set_config('test.fcp_billing',billing::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
 u1 uuid:=current_setting('test.fcp_u1')::uuid;
 u2 uuid:=current_setting('test.fcp_u2')::uuid;
 c1 uuid:=current_setting('test.fcp_c1')::uuid;
 c2 uuid:=current_setting('test.fcp_c2')::uuid;
 billing uuid:=current_setting('test.fcp_billing')::uuid;
 fid uuid; request_id uuid; engagement_id uuid; invoice_id uuid; contact_id uuid;
BEGIN
 fid:=public.create_practice_firm('Firm completion test');
 INSERT INTO public.firm_members(firm_id,user_id,role) VALUES(fid,u2,'member');
 PERFORM public.manage_practice_client(fid,c1,'view',false);
 PERFORM set_config('test.fcp_firm',fid::text,true);

 INSERT INTO public.firm_client_assignments(
   firm_id,company_id,user_id,responsibility,updated_by
 ) VALUES(fid,c1,u2,'bookkeeper',u1);
 IF (SELECT responsibility FROM public.firm_client_assignments
    WHERE firm_id=fid AND company_id=c1 AND user_id=u2)<>'bookkeeper'
 THEN RAISE EXCEPTION 'Client assignment not saved'; END IF;
 BEGIN
   UPDATE public.firm_client_assignments SET company_id=c2,updated_by=u1
   WHERE firm_id=fid AND company_id=c1 AND user_id=u2;
   RAISE EXCEPTION 'TEST: assignment could be reparented';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.firm_client_assignments(
     firm_id,company_id,user_id,responsibility,updated_by
   ) VALUES(fid,c2,u2,'manager',u1);
   RAISE EXCEPTION 'TEST: cross-client assignment accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 request_id:=public.create_firm_document_request(
   fid,c1,u2,'November statements','Upload company bank files',current_date+3
 );
 IF NOT EXISTS(SELECT 1 FROM public.firm_document_request_tracking
    WHERE request_id=request_id AND firm_id=fid AND company_id=c1)
 THEN RAISE EXCEPTION 'Firm tracking request missing'; END IF;
 PERFORM set_config('test.fcp_request',request_id::text,true);
 BEGIN
   PERFORM public.create_firm_document_request(
      fid,c2,u2,'Wrong company','Do not allow',current_date+3);
   RAISE EXCEPTION 'TEST: foreign request accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 INSERT INTO public.contacts(company_id,kind,name)
 VALUES(billing,'customer','Practice fee recipient') RETURNING id INTO contact_id;
 INSERT INTO public.sales_invoices(company_id,contact_id,invoice_number,
  invoice_date,due_date,currency_code,status,created_by)
 VALUES(billing,contact_id,'FCP-TEST',current_date,current_date+30,'GBP','draft',u1)
 RETURNING id INTO invoice_id;
 INSERT INTO public.firm_engagements(
   firm_id,company_id,name,frequency,status,start_date,created_by,updated_by
 ) VALUES(fid,c1,'Monthly bookkeeping','monthly','active',current_date,u1,u1)
 RETURNING id INTO engagement_id;
 INSERT INTO public.firm_engagement_invoice_links(
   engagement_id,invoice_id,firm_id,company_id,billing_company_id,created_by
 ) VALUES(engagement_id,invoice_id,fid,c1,billing,u1);
 IF NOT EXISTS(SELECT 1 FROM public.firm_engagement_invoice_links
    WHERE engagement_id=engagement_id AND invoice_id=invoice_id)
 THEN RAISE EXCEPTION 'Invoice link not persisted'; END IF;
 BEGIN
   INSERT INTO public.firm_engagement_invoice_links(
     engagement_id,invoice_id,firm_id,company_id,billing_company_id,created_by
   ) VALUES(engagement_id,gen_random_uuid(),fid,c1,billing,u1);
   RAISE EXCEPTION 'TEST: unknown invoice accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

RESET ROLE;
DO $$
DECLARE rid uuid:=current_setting('test.fcp_request')::uuid;
 c uuid:=current_setting('test.fcp_c1')::uuid;
 u2 uuid:=current_setting('test.fcp_u2')::uuid;
 n integer;
BEGIN
 n:=private.firm_request_due_notifications();
 IF n<>1 THEN RAISE EXCEPTION 'Expected 1 due notification, got %',n; END IF;
 n:=private.firm_request_due_notifications();
 IF n<>0 THEN RAISE EXCEPTION 'Idempotency failed for due reminders'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.action_notifications
   WHERE company_id=c AND recipient_user_id=u2 AND entity_id=rid
     AND category='document_request')
 THEN RAISE EXCEPTION 'Missing recipient reminder'; END IF;
END $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
 u1 uuid:=current_setting('test.fcp_u1')::uuid;
 u2 uuid:=current_setting('test.fcp_u2')::uuid;
 c1 uuid:=current_setting('test.fcp_c1')::uuid;
 fid uuid:=current_setting('test.fcp_firm')::uuid;
 rid uuid:=current_setting('test.fcp_request')::uuid;
 affected int;
BEGIN
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',u2,'aal','aal2','role','authenticated')::text,true);
 UPDATE public.firm_client_assignments SET responsibility='manager',updated_by=u2
 WHERE firm_id=fid AND company_id=c1 AND user_id=u2;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Non-admin modified client assignments'; END IF;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',u1,'aal','aal1','role','authenticated')::text,true);
 IF EXISTS(SELECT 1 FROM public.firm_document_request_tracking
   WHERE request_id=rid) THEN
   RAISE EXCEPTION 'Weak MFA user read practice request'; END IF;
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,true);
 PERFORM public.cancel_action_document_request(rid);
 IF NOT EXISTS(SELECT 1 FROM public.action_document_requests
   WHERE id=rid AND cancelled_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Cancellation did not affect original request'; END IF;
 PERFORM public.manage_practice_client(fid,c1,NULL,true);
 IF EXISTS(SELECT 1 FROM public.firm_client_assignments
   WHERE firm_id=fid AND company_id=c1)
 THEN RAISE EXCEPTION 'Revoked firm still reads assignments'; END IF;
END $$;
ROLLBACK;
SELECT 'firm-practice-completion: integration and isolation assertions passed; rolled back' AS result;
