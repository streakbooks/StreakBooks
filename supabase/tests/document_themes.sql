-- Exercises the real posting engine as authenticated users. Every fixture is rolled back.
BEGIN;
DO $$
DECLARE u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();c1 uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u1,'correction-'||u1||'@example.invalid','{}'),(u2,'correction-'||u2||'@example.invalid','{}');
 INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES(gen_random_uuid(),u1,'totp','verified',now(),now());
 INSERT INTO public.companies(id,name,country_code,base_currency,fiscal_year_end_month,fiscal_year_end_day,timezone,created_by)
 VALUES(c1,'Isolated correction A','GB','GBP',12,31,'UTC',u1),(c2,'Isolated correction B','GB','GBP',12,31,'UTC',u2);
 PERFORM set_config('linkbooks.trusted','on',true);
 INSERT INTO public.company_members(company_id,user_id,role) VALUES(c1,u1,'owner'),(c1,u2,'read_only'),(c2,u2,'owner') ON CONFLICT(company_id,user_id) DO NOTHING;
 PERFORM public.seed_default_chart_of_accounts(c1);
 INSERT INTO public.accounts(company_id,code,name,account_type,normal_balance,account_kind) VALUES(c1,'T-CORR','Corrections target','expense','debit','overhead');
 INSERT INTO public.accounting_periods(company_id,name,start_date,end_date,status) VALUES(c1,'Test financial year','2026-01-01','2026-12-31','open');
 PERFORM set_config('linkbooks.trusted','off',true);
 PERFORM set_config('test.correct_u1',u1::text,true);PERFORM set_config('test.correct_u2',u2::text,true);PERFORM set_config('test.correct_c1',c1::text,true);PERFORM set_config('test.correct_c2',c2::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,true);
END $$;
DO $$
DECLARE c uuid:=current_setting('test.correct_c1')::uuid;u uuid:=current_setting('test.correct_u1')::uuid;ct uuid;i uuid;
BEGIN
 INSERT INTO public.contacts(company_id,name,kind,billing_address_line1) VALUES(c,'Original customer','customer','Original address') RETURNING id INTO ct;
 INSERT INTO public.sales_invoices(company_id,contact_id,invoice_number,invoice_date,due_date,currency_code,created_by,subtotal_minor,tax_minor,total_minor) VALUES(c,ct,'THEME-1','2026-11-01','2026-12-01','GBP',u,10000,0,10000) RETURNING id INTO i;
 PERFORM set_config('test.theme_invoice',i::text,true);PERFORM set_config('test.theme_contact',ct::text,true);
 INSERT INTO public.document_themes(company_id,name) VALUES(current_setting('test.correct_c2')::uuid,'Foreign theme');
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('org-logos',c||'/test-logo.png','{"mimetype":"image/png"}');
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid:=current_setting('test.correct_c1')::uuid;other_c uuid:=current_setting('test.correct_c2')::uuid;i uuid:=current_setting('test.theme_invoice')::uuid;ct uuid:=current_setting('test.theme_contact')::uuid;t jsonb;t2 jsonb;a jsonb;after_edit jsonb;key uuid;j uuid;revenue uuid;receivable uuid;link jsonb;bad jsonb;n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.document_themes WHERE company_id=other_c) THEN RAISE EXCEPTION 'Cross tenant theme leak'; END IF;
 PERFORM public.save_document_branding(c,'{"trading_name":"Original organisation","accent_color":"#123456","footer_text":"Original footer"}');
 t:=public.save_document_theme(c,NULL,NULL,'Professional',jsonb_build_object('font_family','serif','page_size','Letter','orientation','landscape','margin_mm',18,'accent_color','#246810','footer_text','Issued footer','logo_path',c||'/test-logo.png'));
 PERFORM public.set_document_theme_default(c,'sales_invoice',(t->>'id')::uuid);
 PERFORM public.set_document_theme_default(c,'customer_statement',(t->>'id')::uuid);
 a:=public.get_document_appearance(c,'sales_invoice',i);
 IF a->>'provenance'<>'draft' OR a#>>'{branding,font_family}'<>'serif' THEN RAISE EXCEPTION 'Draft does not resolve selected theme'; END IF;
 -- Follow the existing issue boundary: shared posting engine, then source status update.
 SELECT id INTO revenue FROM public.accounts WHERE company_id=c AND code='4000';
 SELECT id INTO receivable FROM public.accounts WHERE company_id=c AND is_control AND code='1100' LIMIT 1;
 IF receivable IS NULL THEN RAISE EXCEPTION 'Fixture receivable missing'; END IF;
 j:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-11-01','currency_code','GBP','source_type','sales_invoice','source_id',i,'idempotency_key','theme-fixture:'||i,
 'lines',jsonb_build_array(jsonb_build_object('account_id',receivable,'debit_minor',10000,'credit_minor',0),jsonb_build_object('account_id',revenue,'debit_minor',0,'credit_minor',10000))));
 UPDATE public.sales_invoices SET status='authorised',posted_journal_id=j WHERE id=i AND company_id=c;
 a:=public.get_document_appearance(c,'sales_invoice',i);
 IF a->>'provenance'<>'issued' OR a#>>'{company,document_theme_color}'<>'#246810' OR a#>>'{party,name}'<>'Original customer' THEN RAISE EXCEPTION 'Issue snapshot missing'; END IF;
 t2:=public.save_document_theme(c,(t->>'id')::uuid,1,'Renamed',jsonb_build_object('font_family','mono','accent_color','#FF0000','footer_text','Changed footer','font_size',16));
 IF t2->>'revision'<>'2' THEN RAISE EXCEPTION 'Theme revision failed'; END IF;
 BEGIN PERFORM public.save_document_theme(c,(t->>'id')::uuid,1,'Stale',t->'config');RAISE EXCEPTION 'TEST stale update accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 PERFORM public.save_document_branding(c,'{"trading_name":"Changed organisation","accent_color":"#000000","footer_text":"Changed global footer"}');
 UPDATE public.contacts SET name='Changed customer',billing_address_line1='Changed address' WHERE company_id=c AND id=ct;
 after_edit:=public.get_document_appearance(c,'sales_invoice',i);
 IF after_edit IS DISTINCT FROM a THEN RAISE EXCEPTION 'Issued appearance changed after editing theme/company/contact'; END IF;
 IF (SELECT total_minor FROM public.sales_invoices WHERE id=i)<>10000 OR (SELECT count(*) FROM public.journal_lines WHERE journal_id=j)<>2 THEN RAISE EXCEPTION 'Appearance changed financial records'; END IF;
 IF public.get_document_theme_context(c,'customer_statement')#>>'{branding,font_family}'<>'mono' THEN RAISE EXCEPTION 'Statement did not use current theme'; END IF;
 BEGIN PERFORM public.delete_document_theme(c,(t->>'id')::uuid,2);RAISE EXCEPTION 'TEST used theme deleted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Used themes cannot%' THEN RAISE; END IF;END;
 PERFORM public.set_document_theme_default(c,'sales_invoice',NULL);PERFORM public.set_document_theme_default(c,'customer_statement',NULL);
 BEGIN PERFORM public.delete_document_theme(c,(t->>'id')::uuid,2);RAISE EXCEPTION 'TEST historically used theme deleted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Used themes cannot%' THEN RAISE; END IF;END;
 t2:=public.save_document_theme(c,NULL,NULL,'Duplicate theme',t2->'config');
 IF t2->>'id'=t->>'id' THEN RAISE EXCEPTION 'Duplicate overwrote original'; END IF;
 PERFORM public.delete_document_theme(c,(t2->>'id')::uuid,1);
 BEGIN PERFORM public.set_document_theme_default(other_c,'sales_invoice',(t->>'id')::uuid);RAISE EXCEPTION 'TEST cross company default accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.set_document_theme_default(c,'sales_invoice',gen_random_uuid());RAISE EXCEPTION 'TEST forged theme accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"font_size":100},{"orientation":"sideways"},{"accent_color":"red;display:none"},{"page_size":"A0"},{"logo_path":"other/file.png"},{"raw_css":"body{display:none}"},{"show_total":"false"}]') LOOP
  BEGIN PERFORM public.save_document_theme(c,NULL,NULL,'Invalid theme',bad);RAISE EXCEPTION 'TEST invalid configuration accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST invalid configuration accepted' THEN RAISE; END IF;END;
 END LOOP;
 IF NOT private.logo_is_retained(c||'/test-logo.png') THEN RAISE EXCEPTION 'Issued logo retention lookup failed'; END IF;
 BEGIN DELETE FROM storage.objects WHERE bucket_id='org-logos' AND name=c||'/test-logo.png';GET DIAGNOSTICS n=ROW_COUNT;EXCEPTION WHEN insufficient_privilege THEN n:=0;END;
 IF n<>0 THEN RAISE EXCEPTION 'Issued logo deletion was permitted'; END IF;
 UPDATE storage.objects SET metadata='{}' WHERE bucket_id='org-logos' AND name=c||'/test-logo.png';GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Issued logo replacement was permitted'; END IF;
 BEGIN DELETE FROM public.issued_document_appearances WHERE company_id=c;RAISE EXCEPTION 'TEST issued appearance delete permitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 link:=public.create_invoice_share_link(c,i,NULL);
 PERFORM set_config('test.theme_token',link->>'token',true);
 PERFORM set_config('test.theme_snapshot',a::text,true);
 -- Low-privilege member and MFA checks are independent of the server function.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.correct_u2'),'aal','aal2','role','authenticated')::text,true);
 BEGIN PERFORM public.save_document_theme(c,NULL,NULL,'Denied','{}');RAISE EXCEPTION 'TEST readonly save accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.correct_u1'),'aal','aal1','role','authenticated')::text,true);
 BEGIN PERFORM public.get_document_appearance(c,'sales_invoice',i);RAISE EXCEPTION 'TEST MFA read accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.save_document_theme(c,NULL,NULL,'Denied','{}');RAISE EXCEPTION 'TEST MFA save accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $$DECLARE shared jsonb;expected jsonb:=current_setting('test.theme_snapshot')::jsonb;BEGIN
 shared:=public.get_shared_invoice(current_setting('test.theme_token'));
 IF shared->'company' IS DISTINCT FROM expected->'company' OR shared->'branding' IS DISTINCT FROM expected->'branding' OR shared#>>'{customer,name}'<>'Original customer' THEN RAISE EXCEPTION 'Public share did not preserve issued theme'; END IF;
 IF shared->'customer'?'email' OR shared->'customer'?'phone' THEN RAISE EXCEPTION 'Public share leaked private contact fields'; END IF;
 IF public.get_shared_invoice(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'Invalid token returned invoice'; END IF;
 BEGIN PERFORM public.save_document_theme(gen_random_uuid(),NULL,NULL,'Denied','{}');RAISE EXCEPTION 'TEST anonymous save accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'document_themes: CRUD, defaults, optimistic concurrency, real issue snapshot, source/branding independence, logo retention, public share privacy, MFA and tenant isolation passed; fixtures rolled back' as result;
