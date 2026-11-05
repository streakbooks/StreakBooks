-- Run after accounting workflow fixtures, in the isolated PostgreSQL container.
-- Caller has permission for company A, not company B.
INSERT INTO public.test_permissions(company_id,user_id,permission)
VALUES ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001','company.settings.edit');
INSERT INTO public.document_sequences(company_id,document_type,prefix,next_number,padding)
VALUES ('10000000-0000-4000-8000-000000000001','sales_invoice','INV-',41,4),
       ('10000000-0000-4000-8000-000000000002','sales_invoice','B-',5,3)
ON CONFLICT (company_id,document_type) DO UPDATE
SET prefix=EXCLUDED.prefix,next_number=EXCLUDED.next_number,padding=EXCLUDED.padding;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000001"}',false);

DO $$
DECLARE
 c uuid := '10000000-0000-4000-8000-000000000001';
 other_id uuid := '10000000-0000-4000-8000-000000000002';
 loc_old jsonb := '{"locale":"en-GB","date_format":"DD/MM/YYYY","invoice_footer":"","document_theme_color":"#0F766E"}';
 loc_new jsonb := '{"locale":"en-US","date_format":"MM/DD/YYYY","invoice_footer":"Terms","document_theme_color":"#112233"}';
 brand_empty jsonb := '{"trading_name":null,"letterhead_line":null,"invoice_email":null,"invoice_phone":null,"logo_url":null}';
 brand_new jsonb := '{"trading_name":"My Shop","letterhead_line":"Online","invoice_email":"billing@example.com","invoice_phone":null,"logo_url":null}';
 brand_next jsonb := '{"trading_name":"New Shop","letterhead_line":"Online","invoice_email":"billing@example.com","invoice_phone":null,"logo_url":null}';
 seq_old jsonb := '{"prefix":"INV-","next_number":41,"padding":4}';
 seq_new jsonb := '{"prefix":"INV-","next_number":42,"padding":4}';
 before_audit integer;
BEGIN
 IF public.save_company_localisation_if_unchanged(c,loc_old,loc_new) <> loc_new THEN
   RAISE EXCEPTION 'Localisation save returned incorrect data';
 END IF;
 BEGIN
   PERFORM public.save_company_localisation_if_unchanged(c,loc_old,loc_old);
   RAISE EXCEPTION 'Stale localisation was allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
 END;

 PERFORM set_config('test.fail_audit','on',true);
 BEGIN
   PERFORM public.save_company_localisation_if_unchanged(c,loc_new,loc_old);
   RAISE EXCEPTION 'Localisation audit failure was ignored';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
 END;
 PERFORM set_config('test.fail_audit','off',true);
 IF (SELECT locale FROM public.companies WHERE id=c) <> 'en-US' THEN
   RAISE EXCEPTION 'Localisation audit failure did not roll back';
 END IF;

 IF public.save_company_branding_if_unchanged(c,brand_empty,brand_new) <> brand_new THEN
   RAISE EXCEPTION 'Branding create did not return expected values';
 END IF;
 BEGIN
   PERFORM public.save_company_branding_if_unchanged(c,brand_empty,brand_next);
   RAISE EXCEPTION 'Stale branding was allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
 END;
 PERFORM set_config('test.fail_audit','on',true);
 BEGIN
   PERFORM public.save_company_branding_if_unchanged(c,brand_new,brand_next);
   RAISE EXCEPTION 'Branding audit failure was ignored';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
 END;
 PERFORM set_config('test.fail_audit','off',true);
 IF (SELECT trading_name FROM public.company_branding WHERE company_id=c) <> 'My Shop' THEN
   RAISE EXCEPTION 'Branding audit failure did not roll back';
 END IF;

 IF public.save_document_sequence_if_unchanged(c,'sales_invoice',seq_old,seq_new) <> seq_new THEN
   RAISE EXCEPTION 'Document sequence save failed';
 END IF;
 BEGIN
   PERFORM public.save_document_sequence_if_unchanged(c,'sales_invoice',seq_old,seq_new);
   RAISE EXCEPTION 'Stale numbering was allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.save_document_sequence_if_unchanged(
      c,'sales_invoice',seq_new,'{"prefix":"INV-","next_number":10,"padding":4}'::jsonb
   );
   RAISE EXCEPTION 'Number rewind was allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%cannot be decreased%' THEN RAISE; END IF;
 END;

 -- Simulate a concurrent number allocation between read and save.
 UPDATE public.document_sequences SET next_number=next_number+1
 WHERE company_id=c AND document_type='sales_invoice';
 BEGIN
   PERFORM public.save_document_sequence_if_unchanged(c,'sales_invoice',seq_new,
     '{"prefix":"NEW-","next_number":43,"padding":5}'::jsonb);
   RAISE EXCEPTION 'Allocation race was allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT ILIKE '%changed in another session%' THEN RAISE; END IF;
 END;
 IF (SELECT next_number FROM public.document_sequences
     WHERE company_id=c AND document_type='sales_invoice') <> 43 THEN
   RAISE EXCEPTION 'Number allocator was overwritten';
 END IF;

 BEGIN
   PERFORM public.save_company_localisation_if_unchanged(other_id,loc_old,loc_new);
   RAISE EXCEPTION 'Cross-tenant localisation save was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.save_company_branding_if_unchanged(other_id,brand_empty,brand_next);
   RAISE EXCEPTION 'Cross-tenant branding save was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM public.save_document_sequence_if_unchanged(other_id,'sales_invoice',seq_old,seq_new);
   RAISE EXCEPTION 'Cross-tenant numbering save was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

DO $$
BEGIN
 IF has_function_privilege('anon',
   'public.save_company_localisation_if_unchanged(uuid,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
   'public.save_company_branding_if_unchanged(uuid,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
   'public.save_document_sequence_if_unchanged(uuid,text,jsonb,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Anonymous settings RPC access was enabled';
 END IF;
 IF EXISTS (SELECT 1 FROM public.company_branding
            WHERE company_id='10000000-0000-4000-8000-000000000002') THEN
   RAISE EXCEPTION 'Cross-tenant branding was written';
 END IF;
END $$;
SELECT 'PASS: atomic legacy settings CAS, rollback, numbering safety and tenant isolation' AS result;
