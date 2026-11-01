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
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid:=current_setting('test.correct_c1')::uuid;other_c uuid:=current_setting('test.correct_c2')::uuid;u1 uuid:=current_setting('test.correct_u1')::uuid;u2 uuid:=current_setting('test.correct_u2')::uuid;
 a uuid;t uuid;credit uuid;protected uuid;j uuid;j2 uuid;rev uuid;before_count integer;row jsonb;items jsonb;p jsonb;b jsonb;again jsonb;key uuid:=gen_random_uuid();n integer;balance bigint;
BEGIN
 SELECT id INTO a FROM public.accounts WHERE company_id=c AND code='6000'; SELECT id INTO t FROM public.accounts WHERE company_id=c AND code='T-CORR'; SELECT id INTO credit FROM public.accounts WHERE company_id=c AND code='4000';
 j:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-10-01','currency_code','GBP','source_type','manual','idempotency_key','fixture:'||gen_random_uuid(),
 'lines',jsonb_build_array(jsonb_build_object('account_id',a,'debit_minor',10000,'credit_minor',0),jsonb_build_object('account_id',credit,'debit_minor',0,'credit_minor',10000))));
 SELECT value INTO row FROM jsonb_array_elements(public.find_correction_lines(c,jsonb_build_object('from','2026-10-01','to','2026-10-31','account_id',a))->'rows') WHERE value->>'journal_id'=j::text;
 IF row IS NULL OR row->>'blocked_reason' IS NOT NULL THEN RAISE EXCEPTION 'Seeded P&L account should be eligible'; END IF;
 items:=jsonb_build_array(jsonb_build_object('id',row->>'id','fingerprint',row->>'fingerprint'));
 p:=public.preview_transaction_correction(c,items,t,'original',NULL,'Correct expense classification');
 b:=public.apply_transaction_correction(c,key,p->>'preview_hash',items,t,'original',NULL,'Correct expense classification');
 again:=public.apply_transaction_correction(c,key,p->>'preview_hash',items,t,'original',NULL,'Correct expense classification');
 IF b->>'id'<>again->>'id' THEN RAISE EXCEPTION 'Idempotent retry created another batch'; END IF;
 SELECT sum(l.debit_minor-l.credit_minor) INTO balance FROM public.journal_lines l JOIN public.journals jj ON jj.id=l.journal_id WHERE l.company_id=c AND l.account_id=a AND jj.status='posted';
 IF balance<>0 THEN RAISE EXCEPTION 'Source GL balance did not move'; END IF;
 SELECT sum(l.debit_minor-l.credit_minor) INTO balance FROM public.journal_lines l JOIN public.journals jj ON jj.id=l.journal_id WHERE l.company_id=c AND l.account_id=t AND jj.status='posted';
 IF balance<>10000 THEN RAISE EXCEPTION 'Destination GL balance incorrect'; END IF;
 IF (SELECT account_id FROM public.journal_lines WHERE id=(row->>'id')::uuid)<>a OR (SELECT count(*) FROM public.journal_lines WHERE journal_id=j)<>2 THEN RAISE EXCEPTION 'Posted source history changed'; END IF;
 BEGIN PERFORM public.preview_transaction_correction(c,items,t,'original',NULL,'Duplicate correction attempt');RAISE EXCEPTION 'TEST: active double correction accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Already corrected%' THEN RAISE; END IF;END;
 BEGIN PERFORM public.reverse_journal_on(j,'2026-10-01','fixture_reverse:'||j);RAISE EXCEPTION 'TEST: source reversed with active correction';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Undo active transaction corrections%' THEN RAISE; END IF;END;
 again:=public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-01','Undo fixture correction');
 IF again->>'status'<>'undone' THEN RAISE EXCEPTION 'Undo did not complete'; END IF;
 again:=public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-01','Undo fixture correction');
 SELECT sum(l.debit_minor-l.credit_minor) INTO balance FROM public.journal_lines l JOIN public.journals jj ON jj.id=l.journal_id WHERE l.company_id=c AND l.account_id=a AND jj.status='posted';
 IF balance<>10000 THEN RAISE EXCEPTION 'Undo did not restore source GL balance'; END IF;

 BEGIN PERFORM public.apply_transaction_correction(c,key,p->>'preview_hash',items,t,'original',NULL,'Different reuse of reference');RAISE EXCEPTION 'TEST: changed retry accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Request reference already%' THEN RAISE;END IF;END;
 SELECT count(*) INTO before_count FROM public.transaction_correction_batches WHERE company_id=c;
 BEGIN PERFORM public.apply_transaction_correction(c,gen_random_uuid(),repeat('0',32),items,t,'original',NULL,'Stale preview attempt');RAISE EXCEPTION 'TEST: stale preview accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 IF (SELECT count(*) FROM public.transaction_correction_batches WHERE company_id=c)<>before_count THEN RAISE EXCEPTION 'Stale preview partially wrote';END IF;
 SELECT id INTO protected FROM public.accounts WHERE company_id=c AND is_control ORDER BY id LIMIT 1;
 BEGIN PERFORM public.preview_transaction_correction(c,items,protected,'original',NULL,'Protected destination');RAISE EXCEPTION 'TEST: control account accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Choose an active, ordinary%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.preview_transaction_correction(c,items,a,'original',NULL,'No change requested');RAISE EXCEPTION 'TEST: same account accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Destination equals%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.preview_transaction_correction(c,items||items,t,'original',NULL,'Duplicate selected line');RAISE EXCEPTION 'TEST: duplicate line accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Duplicate or missing%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.find_correction_lines(other_c,jsonb_build_object('from','2026-10-01','to','2026-10-31'));RAISE EXCEPTION 'TEST: cross tenant search';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.transaction_correction_batches WHERE id=(b->>'id')::uuid;RAISE EXCEPTION 'TEST: direct batch deletion';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.set_organisation_lock_policy(c,'2026-10-31',NULL,NULL,true,'Lock for correction scenario');
 BEGIN PERFORM public.preview_transaction_correction(c,items,t,'original',NULL,'Locked original date');RAISE EXCEPTION 'TEST: locked date accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Period is locked%' THEN RAISE;END IF;END;
 p:=public.preview_transaction_correction(c,items,t,'adjustment','2026-11-01','Open-period adjustment');
 IF p->'rows'->0->>'posting_date'<>'2026-11-01' THEN RAISE EXCEPTION 'Adjustment did not use the chosen date';END IF;
 b:=public.apply_transaction_correction(c,gen_random_uuid(),p->>'preview_hash',items,t,'adjustment','2026-11-01','Open-period adjustment');
 BEGIN PERFORM public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-31','Undo before correction date');RAISE EXCEPTION 'TEST: early undo accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Undo date cannot%' THEN RAISE;END IF;END;
 PERFORM public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-11-01','Undo open-period adjustment');
 p:=public.preview_transaction_correction(c,items,t,'adjustment','2026-11-02','External reversal scenario');
 b:=public.apply_transaction_correction(c,gen_random_uuid(),p->>'preview_hash',items,t,'adjustment','2026-11-02','External reversal scenario');
 rev:=public.reverse_journal_on((b->'journal_ids'->>0)::uuid,'2026-11-02','external:'||gen_random_uuid());
 BEGIN PERFORM public.reverse_journal_on(rev,'2026-11-02','reverse_external:'||gen_random_uuid());RAISE EXCEPTION 'TEST: correction reversal reversed';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Correction reversals cannot%' THEN RAISE;END IF;END;
 SELECT count(*) INTO before_count FROM public.journals WHERE company_id=c;
 again:=public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-11-03','Reuse exact external reversal');
 IF again->'undo_journal_ids'->>0<>rev::text OR (SELECT count(*) FROM public.journals WHERE company_id=c)<>before_count THEN RAISE EXCEPTION 'External reversal not reused exactly';END IF;
 PERFORM public.set_organisation_lock_policy(c,NULL,NULL,NULL,true,'Unlock test period for dated split');
 j2:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-10-02','currency_code','GBP','source_type','manual','idempotency_key','fixture:'||gen_random_uuid(),
 'lines',jsonb_build_array(jsonb_build_object('account_id',a,'debit_minor',2500,'credit_minor',0),jsonb_build_object('account_id',credit,'debit_minor',0,'credit_minor',2500))));
 SELECT value INTO row FROM jsonb_array_elements(public.find_correction_lines(c,jsonb_build_object('from','2026-10-02','to','2026-10-02','account_id',a))->'rows') WHERE value->>'journal_id'=j2::text;
 items:=items||jsonb_build_array(jsonb_build_object('id',row->>'id','fingerprint',row->>'fingerprint'));
 p:=public.preview_transaction_correction(c,items,t,'original',NULL,'Preserve original dates');
 IF (p->>'journal_count')::integer<>2 THEN RAISE EXCEPTION 'Original-date plan merged different dates';END IF;
 b:=public.apply_transaction_correction(c,gen_random_uuid(),p->>'preview_hash',items,t,'original',NULL,'Preserve original dates');
 IF jsonb_array_length(b->'journal_ids')<>2 THEN RAISE EXCEPTION 'Dated correction journal count incorrect';END IF;
 PERFORM public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-02','Undo multi-date correction');

 -- Credit lines use the opposite sign while preserving their exact magnitude.
 SELECT value INTO row FROM jsonb_array_elements(public.find_correction_lines(c,jsonb_build_object('from','2026-10-01','to','2026-10-01','account_id',credit))->'rows') WHERE value->>'journal_id'=j::text;
 items:=jsonb_build_array(jsonb_build_object('id',row->>'id','fingerprint',row->>'fingerprint'));
 p:=public.preview_transaction_correction(c,items,t,'original',NULL,'Reclassify a credit line');
 IF p->'rows'->0->>'credit_minor'<>'10000' THEN RAISE EXCEPTION 'Credit magnitude changed';END IF;
 b:=public.apply_transaction_correction(c,gen_random_uuid(),p->>'preview_hash',items,t,'original',NULL,'Reclassify a credit line');
 SELECT sum(l.debit_minor-l.credit_minor) INTO balance FROM public.journal_lines l JOIN public.journals jj ON jj.id=l.journal_id WHERE l.company_id=c AND l.account_id=t AND jj.status='posted';
 IF balance<>-10000 THEN RAISE EXCEPTION 'Credit correction sign incorrect';END IF;
 PERFORM public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-01','Undo credit correction');
 j2:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-10-03','currency_code','USD','fx_rate_to_base',1.25,'source_type','manual','idempotency_key','fixture:'||gen_random_uuid(),
 'lines',jsonb_build_array(jsonb_build_object('account_id',a,'debit_minor',10001,'credit_minor',0),jsonb_build_object('account_id',credit,'debit_minor',0,'credit_minor',10001))));
 SELECT value INTO row FROM jsonb_array_elements(public.find_correction_lines(c,jsonb_build_object('from','2026-10-03','to','2026-10-03','account_id',a))->'rows') WHERE value->>'journal_id'=j2::text;
 IF row->>'base_gross_minor'<>'12501' THEN RAISE EXCEPTION 'Foreign base equivalent rounding incorrect';END IF;
 IF jsonb_array_length(public.find_correction_lines(c,jsonb_build_object('from','2026-10-03','to','2026-10-03','account_id',a,'max_minor','11000'))->'rows')<>0 THEN RAISE EXCEPTION 'Amount filter compared different source currency units';END IF;
 IF row->>'currency'<>'USD' OR row->>'blocked_reason' NOT LIKE 'Foreign-currency%' THEN RAISE EXCEPTION 'Foreign source was not explicitly excluded';END IF;
 items:=jsonb_build_array(jsonb_build_object('id',row->>'id','fingerprint',row->>'fingerprint'));
 BEGIN PERFORM public.preview_transaction_correction(c,items,t,'original',NULL,'Foreign currency attempt');RAISE EXCEPTION 'TEST: foreign currency accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Foreign-currency%' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'aal','aal2','role','authenticated')::text,true);
 BEGIN PERFORM public.preview_transaction_correction(c,items,t,'original',NULL,'Read only attempt');RAISE EXCEPTION 'TEST: read only posted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'aal','aal1','role','authenticated')::text,true);
 BEGIN PERFORM public.preview_transaction_correction(c,items,t,'original',NULL,'Weak MFA attempt');RAISE EXCEPTION 'TEST: MFA bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.transaction_correction_batches WHERE company_id=c) THEN RAISE EXCEPTION 'MFA read leak';END IF;
 IF has_function_privilege('anon','public.apply_transaction_correction(uuid,uuid,text,jsonb,uuid,text,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous posting';END IF;
END $$;
ROLLBACK;
SELECT 'transaction_corrections: posting, balanced movement, immutability, idempotency, undo and authorization passed; fixtures rolled back' AS result;
