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
DECLARE c uuid:=current_setting('test.correct_c1')::uuid;u uuid:=current_setting('test.correct_u1')::uuid;ct uuid; inv uuid;rev uuid;bank uuid;bj uuid;rs uuid; jl uuid;
BEGIN
 INSERT INTO public.accounts(company_id,code,name,account_type,normal_balance,account_kind) VALUES
 (c,'T-ASSET','Prepaid operating costs','asset','debit','current_asset'),(c,'T-LIAB','Ordinary accrued costs','liability','credit','current_liability'),(c,'T-EQUITY','Ordinary contributed capital','equity','credit','equity'),(c,'T-BANK','Bank without subtype','asset','debit','current_asset');
 INSERT INTO public.contacts(company_id,name,kind) VALUES(c,'Advanced search customer','customer') RETURNING id INTO ct;
 INSERT INTO public.sales_invoices(company_id,contact_id,invoice_number,invoice_date,due_date,currency_code,status,subtotal_minor,tax_minor,total_minor,created_by)
 VALUES(c,ct,'ADV-INV-1','2026-10-01','2026-10-31','GBP','authorised',10000,2000,12000,u) RETURNING id INTO inv;
 SELECT id INTO rev FROM public.accounts WHERE company_id=c AND code='4000';
 INSERT INTO public.sales_invoice_lines(company_id,invoice_id,line_order,description,account_id,quantity,unit_price_minor,tax_rate_bps,net_minor,tax_minor,gross_minor)
 VALUES(c,inv,0,'Taxable test line',rev,1,10000,2000,10000,2000,12000);
 INSERT INTO public.bank_accounts(company_id,name,currency_code,gl_account_id) SELECT c,'Advanced search bank','GBP',id FROM public.accounts WHERE company_id=c AND code='T-BANK' RETURNING id INTO bank;
 bj:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-10-01','currency_code','GBP','source_type','sales_invoice','source_id',inv,'idempotency_key','fixture:advanced:'||gen_random_uuid(),
 'lines',jsonb_build_array(jsonb_build_object('account_id',(SELECT id FROM public.accounts WHERE company_id=c AND code='T-BANK'),'debit_minor',12000,'credit_minor',0),jsonb_build_object('account_id',rev,'debit_minor',0,'credit_minor',12000))));
 UPDATE public.sales_invoices SET posted_journal_id=bj WHERE id=inv;
 SELECT id INTO jl FROM public.journal_lines WHERE journal_id=bj AND debit_minor=12000;
 INSERT INTO public.reconciliation_sessions(company_id,bank_account_id,statement_date,statement_balance_minor,reconciled_balance_minor,status,completed_at,completed_by,created_by) VALUES(c,bank,'2026-10-31',12000,12000,'completed','2026-10-31T12:00:00Z',u,u) RETURNING id INTO rs;
 INSERT INTO public.reconciliation_session_lines(company_id,session_id,journal_line_id,amount_minor) VALUES(c,rs,jl,12000);
 PERFORM set_config('test.advanced_invoice',inv::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid:=current_setting('test.correct_c1')::uuid;a uuid;t uuid;eq uuid;li uuid;revenue uuid;j uuid;row jsonb;rows jsonb;items jsonb;p jsonb;b jsonb;before_count integer;n integer;f jsonb:=jsonb_build_object('from','2026-10-01','to','2026-10-31');cond jsonb;setup jsonb;balance bigint;
BEGIN
 SELECT id INTO a FROM public.accounts WHERE company_id=c AND code='6000';SELECT id INTO t FROM public.accounts WHERE company_id=c AND code='T-ASSET';SELECT id INTO eq FROM public.accounts WHERE company_id=c AND code='T-EQUITY';SELECT id INTO li FROM public.accounts WHERE company_id=c AND code='T-LIAB';SELECT id INTO revenue FROM public.accounts WHERE company_id=c AND code='4000';
 setup:=public.transaction_correction_setup(c);
 IF (SELECT count(*) FROM jsonb_array_elements(setup->'accounts')x WHERE x->>'type' IN ('asset','liability','equity'))<3 THEN RAISE EXCEPTION 'Missing balance-sheet setup accounts'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(setup->'accounts')x WHERE x->>'code'='T-BANK' AND (x->>'eligible')::boolean) THEN RAISE EXCEPTION 'Linked bank accepted despite missing chart metadata'; END IF;
 j:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-10-02','currency_code','GBP','source_type','manual','memo','Advanced literal % search','idempotency_key','fixture:'||gen_random_uuid(),
 'lines',jsonb_build_array(jsonb_build_object('account_id',a,'debit_minor',10000,'credit_minor',0,'description','Office prepayment'),jsonb_build_object('account_id',revenue,'debit_minor',0,'credit_minor',10000))));
 rows:=public.find_correction_lines(c,f||jsonb_build_object('scope','balance_sheet'))->'rows';
 IF jsonb_array_length(rows)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'account_type' NOT IN ('asset','liability','equity')) THEN RAISE EXCEPTION 'Balance-sheet scope failed'; END IF;
 rows:=public.find_correction_lines(c,f||jsonb_build_object('scope','profit_loss'))->'rows';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'account_type' NOT IN ('income','expense')) THEN RAISE EXCEPTION 'P&L scope leaked balance sheet'; END IF;
 cond:='[{"field":"account_type","operator":"is","value":"expense"},{"field":"description","operator":"contains","value":"prepayment"},{"field":"line_amount","operator":"between","value":"10000","value_to":"10000"}]';
 rows:=public.find_correction_lines(c,f||jsonb_build_object('conditions',cond,'match','all'))->'rows';
 IF jsonb_array_length(rows)<>1 THEN RAISE EXCEPTION 'Combined conditions failed: %',rows; END IF;
 row:=rows->0;items:=jsonb_build_array(jsonb_build_object('id',row->>'id','fingerprint',row->>'fingerprint'));
 p:=public.preview_transaction_correction(c,items,t,'original',NULL,'Capitalise ordinary prepaid costs');
 IF p#>>'{impact,profit_change_minor}'<>'10000' OR (p#>>'{impact,cross_statement_lines}')::integer<>1 THEN RAISE EXCEPTION 'P&L-to-asset impact incorrect: %',p->'impact'; END IF;
 b:=public.apply_transaction_correction(c,gen_random_uuid(),p->>'preview_hash',items,t,'original',NULL,'Capitalise ordinary prepaid costs');
 SELECT sum(l.debit_minor-l.credit_minor) INTO balance FROM public.journal_lines l JOIN public.journals jj ON jj.id=l.journal_id WHERE l.company_id=c AND l.account_id=t AND jj.status='posted';
 IF balance<>10000 THEN RAISE EXCEPTION 'Asset correction did not post'; END IF;
 PERFORM public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-02','Undo capitalisation fixture');
 -- An ordinary liability credit moves to equity with zero profit impact.
 j:=public.post_journal(jsonb_build_object('company_id',c,'journal_date','2026-10-03','currency_code','GBP','source_type','manual','idempotency_key','fixture:'||gen_random_uuid(),
 'lines',jsonb_build_array(jsonb_build_object('account_id',t,'debit_minor',25000,'credit_minor',0),jsonb_build_object('account_id',li,'debit_minor',0,'credit_minor',25000))));
 SELECT value INTO row FROM jsonb_array_elements(public.find_correction_lines(c,f||jsonb_build_object('account_id',li))->'rows')x WHERE x->>'journal_id'=j::text;
 items:=jsonb_build_array(jsonb_build_object('id',row->>'id','fingerprint',row->>'fingerprint'));
 p:=public.preview_transaction_correction(c,items,eq,'original',NULL,'Reclassify ordinary liability to capital');
 IF p#>>'{impact,profit_change_minor}'<>'0' OR p#>>'{impact,cross_statement_lines}'<>'0' THEN RAISE EXCEPTION 'Within-BS impact incorrect'; END IF;
 b:=public.apply_transaction_correction(c,gen_random_uuid(),p->>'preview_hash',items,eq,'original',NULL,'Reclassify ordinary liability to capital');
 SELECT sum(l.debit_minor-l.credit_minor) INTO balance FROM public.journal_lines l JOIN public.journals jj ON jj.id=l.journal_id WHERE l.company_id=c AND l.account_id=eq AND jj.status='posted';
 IF balance<>-25000 THEN RAISE EXCEPTION 'Equity credit sign incorrect'; END IF;
 PERFORM public.undo_transaction_correction(c,(b->>'id')::uuid,'2026-10-03','Undo balance sheet classification');
 cond:='[{"field":"account_type","operator":"is","value":"asset"},{"field":"account_type","operator":"is","value":"expense"}]';
 rows:=public.find_correction_lines(c,f||jsonb_build_object('conditions',cond,'match','any'))->'rows';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'account_type'='asset') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'account_type'='expense') OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'account_type' NOT IN ('asset','expense')) THEN RAISE EXCEPTION 'OR matching failed'; END IF;
 rows:=public.find_correction_lines(c,f||jsonb_build_object('query','%'))->'rows';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'memo' NOT LIKE '%literal%') THEN RAISE EXCEPTION 'Literal search became wildcard'; END IF;
 -- Authoritative source, reconciliation and bank metadata on a posted invoice.
 cond:='[{"field":"tax_rate","operator":"is","value":"20"},{"field":"document_total","operator":"is","value":"12000"},{"field":"reconciled_date","operator":"between","value":"2026-10-30","value_to":"2026-11-01"},{"field":"bank_account","operator":"contains","value":"advanced search"},{"field":"contact","operator":"is","value":"Advanced search customer"},{"field":"reference","operator":"is","value":"ADV-INV-1"}]';
 rows:=public.find_correction_lines(c,f||jsonb_build_object('conditions',cond))->'rows';
 IF jsonb_array_length(rows)<>1 OR rows#>>'{0,account_type}'<>'income' THEN RAISE EXCEPTION 'Tax/bank/reconciliation/source metadata conditions failed: %',rows; END IF;
 cond:='[{"field":"tax_rate","operator":"is_not","value":"20"}]';
 rows:=public.find_correction_lines(c,f||jsonb_build_object('conditions',cond))->'rows';
 IF jsonb_array_length(rows)<>0 THEN RAISE EXCEPTION 'Missing tax metadata matched a negative condition'; END IF;
 cond:='[{"field":"contact","operator":"empty"}]';
 rows:=public.find_correction_lines(c,f||jsonb_build_object('conditions',cond))->'rows';
 IF jsonb_array_length(rows)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'contact_name' IS NOT NULL) THEN RAISE EXCEPTION 'Empty metadata semantics failed'; END IF;
 -- Invalid predicates must fail even if the date range has no matching records.
 FOR cond IN SELECT value FROM jsonb_array_elements('[
 [{"field":"sql","operator":"is","value":"1"}],
 [{"field":"memo","operator":"gte","value":"a"}],
 [{"field":"line_amount","operator":"contains","value":"1"}],
 [{"field":"date","operator":"between","value":"2026-11-02","value_to":"2026-11-01"}],
 [{"field":"tax_rate","operator":"is","value":"100.01"}]
 ]'::jsonb) LOOP
  BEGIN PERFORM public.find_correction_lines(c,'{"from":"2025-01-01","to":"2025-01-31"}'::jsonb||jsonb_build_object('conditions',cond));RAISE EXCEPTION 'TEST invalid condition accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST invalid condition accepted' THEN RAISE; END IF; END;
 END LOOP;
 BEGIN PERFORM public.find_correction_lines(current_setting('test.correct_c2')::uuid,f);RAISE EXCEPTION 'TEST cross-company search accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'advanced_transaction_search: both statements, cross-statement financial impact, credit signs, AND/OR, exact ranges, source/tax/bank/reconciliation metadata and validation passed; fixtures rolled back' AS result;
