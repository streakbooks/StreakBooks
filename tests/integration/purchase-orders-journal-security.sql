SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',false);
DO $$
DECLARE c uuid:='10000000-0000-4000-8000-000000000001'; o jsonb; bill jsonb; b public.purchase_bills; payload jsonb; posted jsonb; journal_id uuid; line_id uuid;
BEGIN
 o:=public.po_test_open_order(gen_random_uuid(),3,'Journal security');
 PERFORM public.receive_purchase_order(c,(o->>'id')::uuid,gen_random_uuid(),'2026-11-18','SECURITY-GR',jsonb_build_array(jsonb_build_object('lineId',o->>'lineId','receiveQuantity',3)));
 bill:=public.convert_purchase_order_atomic(c,(o->>'id')::uuid);
 SELECT * INTO b FROM public.purchase_bills WHERE id=(bill->>'billId')::uuid;
 payload:=jsonb_build_object('company_id',c,'journal_date',b.bill_date,'currency_code',b.currency_code,'fx_rate_to_base',1,'source_type','purchase_bill','source_id',b.id,'idempotency_key','purchase_bill:'||b.id||':authorise','lines',jsonb_build_array(
  jsonb_build_object('account_id','20000000-0000-4000-8000-000000000001','debit_minor',b.total_minor,'credit_minor',0),
  jsonb_build_object('account_id','20000000-0000-4000-8000-000000000002','debit_minor',0,'credit_minor',b.total_minor)));
 PERFORM public.po_test_error(format('DO $attack$ BEGIN PERFORM public.post_journal(%L); SET CONSTRAINTS ALL IMMEDIATE; END $attack$',payload::text),'%atomic authorisation%','legacy direct journal cannot commit without atomic PO bill linkage');
 PERFORM public.po_test_error(format('DO $attack$ DECLARE j uuid; BEGIN j:=public.post_journal(%L); UPDATE public.purchase_bills SET status=''authorised'',posted_journal_id=j,fx_rate_to_base=1 WHERE id=%L; SET CONSTRAINTS ALL IMMEDIATE; END $attack$',payload::text,b.id),'%Journal expense accounts%','balanced source journal with wrong expense and input tax split cannot commit');
 PERFORM public.po_test_assert(NOT EXISTS(SELECT 1 FROM public.journals WHERE source_id=b.id) AND EXISTS(SELECT 1 FROM public.purchase_bills WHERE id=b.id AND status='draft' AND posted_journal_id IS NULL),'rejected source journal spoof leaves bill and ledger unchanged');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004"}',true);
 PERFORM public.po_test_error(format('SELECT public.authorise_purchase_order_bill_atomic(%L,%L)',c,b.id),'%denied%','view-only user cannot authorise PO bill');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true);
 PERFORM public.po_test_error(format('SELECT public.authorise_purchase_order_bill_atomic(%L,%L)',c,b.id),'%denied%','cross-tenant PO bill authorisation denied');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
 posted:=public.authorise_purchase_order_bill_atomic(c,b.id);
 journal_id:=(posted->>'journalId')::uuid;
 PERFORM public.po_test_error(format('UPDATE public.purchase_bills SET posted_journal_id=NULL,status=''draft'' WHERE id=%L',b.id),'%immutable%','posted source journal cannot be cleared to reopen draft');
 PERFORM public.po_test_error(format('UPDATE public.purchase_bills SET bill_date=''2026-11-19'' WHERE id=%L',b.id),'%immutable%','posted source bill date is immutable');
 PERFORM public.po_test_error(format('UPDATE public.purchase_bills SET fx_rate_to_base=2 WHERE id=%L',b.id),'%immutable%','posted source bill exchange rate is immutable');
 PERFORM public.po_test_error(format('DO $attack$ BEGIN PERFORM public.reverse_journal_on(%L,%L,%L); SET CONSTRAINTS ALL IMMEDIATE; END $attack$',journal_id,'2026-11-18','bypass-reversal'),'%atomic bill voiding%','generic journal reversal cannot leave PO bill authorised');
 PERFORM public.po_test_assert(EXISTS(SELECT 1 FROM public.purchase_bills WHERE id=b.id AND status='authorised') AND NOT EXISTS(SELECT 1 FROM public.journals WHERE reverses_journal_id=journal_id),'rejected generic reversal preserves source bill and posted journal');
 PERFORM public.void_purchase_order_bill_atomic(c,b.id,'Complete security test','2026-11-18');
 PERFORM public.po_test_error(format('UPDATE public.purchase_bills SET void_journal_id=NULL WHERE id=%L',b.id),'%immutable%','posted bill reversal link cannot be cleared');
 -- A tiny partial receipt must not reserve zero-value billed quantities that
 -- would produce an unpostable bill in the shared accounting engine.
 o:=public.save_purchase_order_atomic(c,jsonb_build_object('requestId',gen_random_uuid(),'contactId','30000000-0000-4000-8000-000000000001','orderDate','2026-11-18','currencyCode','GBP','lines',jsonb_build_array(jsonb_build_object('description','Tiny allocation','accountId','20000000-0000-4000-8000-000000000001','quantity',3,'unitPriceMinor',1,'discountMinor',2,'taxRateBps',0))));
 o:=public.manage_purchase_order(c,(o->>'id')::uuid,1,'submit');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003"}',true);
 o:=public.manage_purchase_order(c,(o->>'id')::uuid,2,'approve');
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
 o:=public.manage_purchase_order(c,(o->>'id')::uuid,3,'send');
 SELECT id INTO line_id FROM public.purchase_order_lines WHERE order_id=(o->>'id')::uuid;
 PERFORM public.receive_purchase_order(c,(o->>'id')::uuid,gen_random_uuid(),'2026-11-18','TINY-GR',jsonb_build_array(jsonb_build_object('lineId',line_id,'receiveQuantity',1)));
 PERFORM public.po_test_error(format('SELECT public.convert_purchase_order_atomic(%L,%L)',c,o->>'id'),'%No payable amount%','zero-value partial conversion fails closed');
 PERFORM public.po_test_assert(NOT EXISTS(SELECT 1 FROM public.purchase_bills WHERE purchase_order_id=(o->>'id')::uuid) AND (SELECT quantity_billed FROM public.purchase_order_lines WHERE id=line_id)=0,'zero-value allocation failure leaves no bill or reserved quantity');
END $$;
RESET ROLE;
