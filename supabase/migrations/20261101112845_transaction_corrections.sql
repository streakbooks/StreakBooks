-- Additive, line-specific GL corrections. Never rewrites source documents or posted lines.
CREATE TABLE public.transaction_correction_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 request_key uuid NOT NULL, request_hash text NOT NULL, preview_hash text NOT NULL,
 target_account_id uuid NOT NULL REFERENCES public.accounts(id), reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 1000),
 date_mode text NOT NULL CHECK(date_mode IN ('original','adjustment')), adjustment_date date,
 plan jsonb NOT NULL, journal_ids uuid[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','undone')),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 undo_date date, undo_reason text, undone_by uuid REFERENCES auth.users(id), undone_at timestamptz, undo_journal_ids uuid[],
 UNIQUE(company_id,request_key), CHECK((date_mode='original' AND adjustment_date IS NULL) OR (date_mode='adjustment' AND adjustment_date IS NOT NULL))
);
CREATE INDEX transaction_correction_batches_history ON public.transaction_correction_batches(company_id,created_at DESC,id);
CREATE INDEX transaction_correction_batches_target ON public.transaction_correction_batches(target_account_id);
CREATE INDEX transaction_correction_batches_journals ON public.transaction_correction_batches USING gin(journal_ids);
CREATE INDEX transaction_correction_batches_creator ON public.transaction_correction_batches(created_by);
CREATE INDEX transaction_correction_batches_undo_actor ON public.transaction_correction_batches(undone_by) WHERE undone_by IS NOT NULL;
CREATE TABLE public.transaction_correction_items (
 batch_id uuid NOT NULL REFERENCES public.transaction_correction_batches(id), company_id uuid NOT NULL REFERENCES public.companies(id),
 source_line_id uuid NOT NULL REFERENCES public.journal_lines(id), source_journal_id uuid NOT NULL REFERENCES public.journals(id),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(batch_id,source_line_id)
);
CREATE UNIQUE INDEX transaction_correction_active_line ON public.transaction_correction_items(source_line_id) WHERE active;
CREATE INDEX transaction_correction_items_company ON public.transaction_correction_items(company_id);
CREATE INDEX transaction_correction_items_journal ON public.transaction_correction_items(source_journal_id) WHERE active;
CREATE INDEX transaction_correction_items_line ON public.transaction_correction_items(source_line_id);
ALTER TABLE public.transaction_correction_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_correction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY correction_batches_read ON public.transaction_correction_batches FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'accounting.view'));
CREATE POLICY correction_items_read ON public.transaction_correction_items FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'accounting.view'));
CREATE POLICY mfa_aal2_required ON public.transaction_correction_batches AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.mfa_requirement_met())) WITH CHECK((SELECT private.mfa_requirement_met()));
CREATE POLICY mfa_aal2_required ON public.transaction_correction_items AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.mfa_requirement_met())) WITH CHECK((SELECT private.mfa_requirement_met()));
REVOKE ALL ON public.transaction_correction_batches,public.transaction_correction_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.transaction_correction_batches,public.transaction_correction_items TO authenticated;

-- is_locked protects chart structure; seeded P&L posting accounts may legitimately have it set.
CREATE FUNCTION private.correction_account_ok(a public.accounts) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT a.account_type IN ('income','expense') AND a.is_active AND a.is_postable AND NOT a.is_control AND NOT a.is_header
 AND a.archived_at IS NULL AND a.system_key IS NULL AND coalesce(a.subtype,'') NOT IN ('rounding','fx_gain','fx_loss','depreciation')
 AND coalesce(a.account_kind,'')<>'depreciation';
$$;
REVOKE ALL ON FUNCTION private.correction_account_ok(public.accounts) FROM PUBLIC,anon,authenticated;
CREATE VIEW private.correction_line_candidates WITH(security_invoker=true) AS
 SELECT l.id,l.company_id,l.journal_id,l.account_id,j.journal_date,j.journal_number,j.source_type::text AS source_type,j.source_id,
 a.code AS account_code,a.name AS account_name,a.account_type::text AS account_type,j.currency_code::text AS currency,
 l.description,j.memo,l.debit_minor,l.credit_minor,coalesce(si.invoice_number,pb.bill_number,j.journal_number::text) AS source_reference,ct.name AS contact_name,
 md5((to_jsonb(l)||jsonb_build_object('date',j.journal_date,'currency',j.currency_code,'fx',j.fx_rate_to_base,'reversed',j.reversed_by_journal_id,'status',j.status))::text) AS fingerprint,
 CASE WHEN j.status<>'posted' OR j.reversed_by_journal_id IS NOT NULL THEN 'Source journal is not posted or has been reversed'
 WHEN j.source_type::text NOT IN ('manual','sales_invoice','sales_credit_note','purchase_bill','purchase_credit_note','expense','bank_transaction') THEN 'This source requires its own correction workflow'
 WHEN coalesce(j.idempotency_key,'') LIKE 'transaction_correction:%' OR coalesce(j.idempotency_key,'') LIKE 'merge:%' OR coalesce(j.idempotency_key,'') LIKE 'year_end_close:%' THEN 'Generated accounting adjustment; use its original workflow'
 WHEN EXISTS(SELECT 1 FROM public.journal_auto_reversals r WHERE r.journal_id=j.id AND r.status IN ('pending','failed')) THEN 'Scheduled reversal must be resolved first'
 WHEN NOT private.correction_account_ok(a) THEN 'Protected or inactive account; use the source workflow'
 WHEN j.currency_code<>c.base_currency OR j.fx_rate_to_base<>1 OR (a.currency_code IS NOT NULL AND a.currency_code<>c.base_currency) THEN 'Foreign-currency corrections require the source workflow'
 WHEN EXISTS(SELECT 1 FROM public.transaction_correction_items i WHERE i.source_line_id=l.id AND i.active) THEN 'Already corrected; undo the active batch before correcting again'
 ELSE NULL END AS blocked_reason
 FROM public.journal_lines l JOIN public.journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN public.accounts a ON a.id=l.account_id AND a.company_id=l.company_id JOIN public.companies c ON c.id=l.company_id
 LEFT JOIN public.sales_invoices si ON j.source_type='sales_invoice' AND si.id=j.source_id AND si.company_id=l.company_id
 LEFT JOIN public.purchase_bills pb ON j.source_type='purchase_bill' AND pb.id=j.source_id AND pb.company_id=l.company_id
 LEFT JOIN public.contacts ct ON ct.id=coalesce(si.contact_id,pb.contact_id) AND ct.company_id=l.company_id;
REVOKE ALL ON private.correction_line_candidates FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.find_correction_lines(_company_id uuid,_filters jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; page integer:=coalesce((_filters->>'page')::integer,0); d1 date:=(_filters->>'from')::date; d2 date:=(_filters->>'to')::date;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.view') THEN RAISE EXCEPTION 'Accounting access required' USING ERRCODE='42501'; END IF;
 IF d1 IS NULL OR d2 IS NULL OR d1>d2 OR d2-d1>3660 OR page NOT BETWEEN 0 AND 100000 OR length(coalesce(_filters->>'query',''))>200 THEN RAISE EXCEPTION 'Invalid search range or page'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.journal_date DESC,r.id),'[]') INTO rows FROM (
  SELECT v.id,v.journal_id,v.journal_date,v.journal_number::text,v.source_type,v.source_id,v.account_id,v.account_code,v.account_name,v.account_type,v.currency,
   v.description,v.memo,v.source_reference,v.contact_name,v.debit_minor::text,v.credit_minor::text,v.fingerprint,v.blocked_reason
  FROM private.correction_line_candidates v WHERE v.company_id=_company_id AND v.account_type IN ('income','expense') AND v.journal_date BETWEEN d1 AND d2
   AND (nullif(_filters->>'account_id','') IS NULL OR v.account_id=(_filters->>'account_id')::uuid)
   AND (nullif(_filters->>'source_type','') IS NULL OR v.source_type=_filters->>'source_type')
   AND (nullif(_filters->>'query','') IS NULL OR position(lower(_filters->>'query') IN lower(concat_ws(' ',v.description,v.memo,v.journal_number::text,v.source_reference,v.contact_name)))>0)
   AND (nullif(_filters->>'min_minor','') IS NULL OR greatest(v.debit_minor,v.credit_minor)>=(_filters->>'min_minor')::numeric)
   AND (nullif(_filters->>'max_minor','') IS NULL OR greatest(v.debit_minor,v.credit_minor)<=(_filters->>'max_minor')::numeric)
  ORDER BY v.journal_date DESC,v.id LIMIT 201 OFFSET page*200
 )r;
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality<=200),'[]'),'has_more',jsonb_array_length(rows)>200,'page',page);
END $$;
REVOKE ALL ON FUNCTION public.find_correction_lines(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_correction_lines(uuid,jsonb) TO authenticated;

CREATE FUNCTION private.correction_plan(_company_id uuid,_items jsonb,_target_id uuid,_mode text,_date date,_reason text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target public.accounts; item jsonb; ln record; posting_date date; rows jsonb:='[]'; gross numeric:=0; base text; dates date[]:='{}';
BEGIN
 IF _items IS NULL OR jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select between 1 and 100 lines'; END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(_items)v)<>jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate or missing selected line'; END IF;
 IF _mode IS NULL OR _mode NOT IN ('original','adjustment') OR (_mode='adjustment' AND _date IS NULL) OR (_mode='original' AND _date IS NOT NULL) THEN RAISE EXCEPTION 'Choose a valid correction date policy'; END IF;
 IF _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'A reason of 5 to 1000 characters is required'; END IF;
 SELECT * INTO target FROM public.accounts WHERE company_id=_company_id AND id=_target_id;
 SELECT base_currency::text INTO base FROM public.companies WHERE id=_company_id;
 IF target.id IS NULL OR NOT private.correction_account_ok(target) OR (target.currency_code IS NOT NULL AND target.currency_code::text<>base) THEN RAISE EXCEPTION 'Choose an active, ordinary income or expense destination account'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'id' LOOP
  SELECT * INTO ln FROM private.correction_line_candidates WHERE company_id=_company_id AND id=(item->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'A selected line is missing or inaccessible'; END IF;
  IF ln.fingerprint IS DISTINCT FROM item->>'fingerprint' THEN RAISE EXCEPTION 'A selected line changed. Search and preview again' USING ERRCODE='40001'; END IF;
  IF ln.blocked_reason IS NOT NULL THEN RAISE EXCEPTION '%',ln.blocked_reason; END IF;
  IF ln.account_id=_target_id THEN RAISE EXCEPTION 'Destination equals a selected source account'; END IF;
  posting_date:=CASE WHEN _mode='original' THEN ln.journal_date ELSE _date END;
  IF posting_date<ln.journal_date THEN RAISE EXCEPTION 'The adjustment date cannot precede any selected transaction'; END IF;
  PERFORM 1 FROM public.accounting_periods WHERE company_id=_company_id AND start_date<=posting_date AND end_date>=posting_date AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'No open accounting period covers %',posting_date; END IF;
  PERFORM public.assert_journal_date_unlocked(_company_id,posting_date);
  gross:=gross+greatest(ln.debit_minor,ln.credit_minor);
  IF gross>9007199254740991 THEN RAISE EXCEPTION 'Batch exceeds the supported monetary range; split the selection'; END IF;
  dates:=array_append(dates,posting_date);
  rows:=rows||jsonb_build_array(jsonb_build_object('id',ln.id,'journal_id',ln.journal_id,'journal_number',ln.journal_number::text,'journal_date',ln.journal_date,
   'source_type',ln.source_type,'source_reference',ln.source_reference,'contact_name',ln.contact_name,'description',ln.description,'memo',ln.memo,'source_account_id',ln.account_id,'source_account_code',ln.account_code,'source_account_name',ln.account_name,
   'debit_minor',ln.debit_minor::text,'credit_minor',ln.credit_minor::text,'posting_date',posting_date,'fingerprint',ln.fingerprint));
 END LOOP;
 RETURN jsonb_build_object('company_id',_company_id,'currency',base,'rows',rows,'gross_minor',gross::text,'line_count',jsonb_array_length(rows),
  'journal_count',(SELECT count(DISTINCT d) FROM unnest(dates)d),'date_mode',_mode,'adjustment_date',_date,'reason',trim(_reason),
  'target',jsonb_build_object('id',target.id,'code',target.code,'name',target.name,'updated_at',target.updated_at));
END $$;
REVOKE ALL ON FUNCTION private.correction_plan(uuid,jsonb,uuid,text,date,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.preview_transaction_correction(_company_id uuid,_items jsonb,_target_id uuid,_mode text,_date date,_reason text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'journals.manual') OR NOT public.has_company_permission(_company_id,'accounting.post') THEN RAISE EXCEPTION 'Manual journal and posting permissions required' USING ERRCODE='42501'; END IF;
 plan:=private.correction_plan(_company_id,_items,_target_id,_mode,_date,_reason);
 RETURN plan||jsonb_build_object('preview_hash',md5(plan::text));
END $$;
REVOKE ALL ON FUNCTION public.preview_transaction_correction(uuid,jsonb,uuid,text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_transaction_correction(uuid,jsonb,uuid,text,date,text) TO authenticated;

CREATE FUNCTION public.apply_transaction_correction(_company_id uuid,_request_key uuid,_preview_hash text,_items jsonb,_target_id uuid,_mode text,_date date,_reason text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.transaction_correction_batches; plan jsonb; request_hash text; d date; item jsonb; lines jsonb; jid uuid; ids uuid[]:='{}';
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'journals.manual') OR NOT public.has_company_permission(_company_id,'accounting.post') THEN RAISE EXCEPTION 'Manual journal and posting permissions required' USING ERRCODE='42501'; END IF;
 IF _request_key IS NULL THEN RAISE EXCEPTION 'Request reference required'; END IF;
 request_hash:=md5(jsonb_build_object('items',(SELECT jsonb_agg(value ORDER BY value->>'id') FROM jsonb_array_elements(_items)),'target',_target_id,'mode',_mode,'date',_date,'reason',trim(_reason))::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text,29));
 SELECT * INTO b FROM public.transaction_correction_batches WHERE company_id=_company_id AND request_key=_request_key FOR UPDATE;
 IF FOUND THEN
  IF b.request_hash<>request_hash THEN RAISE EXCEPTION 'Request reference already belongs to a different correction'; END IF;
  RETURN to_jsonb(b);
 END IF;
 -- Consistent locks protect originals, chart metadata, fiscal periods and organisation lock policy.
 PERFORM 1 FROM public.accounts WHERE company_id=_company_id ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.accounting_periods WHERE company_id=_company_id ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.organisation_lock_policy WHERE company_id=_company_id FOR SHARE;
 PERFORM 1 FROM public.journals j JOIN public.journal_lines l ON l.journal_id=j.id
  WHERE l.company_id=_company_id AND l.id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(_items)) ORDER BY j.id FOR UPDATE OF j;
 plan:=private.correction_plan(_company_id,_items,_target_id,_mode,_date,_reason);
 IF _preview_hash IS DISTINCT FROM md5(plan::text) THEN RAISE EXCEPTION 'The correction preview is stale. Preview again' USING ERRCODE='40001'; END IF;
 INSERT INTO public.transaction_correction_batches(company_id,request_key,request_hash,preview_hash,target_account_id,reason,date_mode,adjustment_date,plan,created_by)
 VALUES(_company_id,_request_key,request_hash,_preview_hash,_target_id,trim(_reason),_mode,_date,plan,auth.uid()) RETURNING * INTO b;
 FOR d IN SELECT DISTINCT (value->>'posting_date')::date FROM jsonb_array_elements(plan->'rows') ORDER BY 1 LOOP
  lines:='[]';
  FOR item IN SELECT value FROM jsonb_array_elements(plan->'rows') WHERE (value->>'posting_date')::date=d ORDER BY value->>'id' LOOP
   lines:=lines||jsonb_build_array(
    jsonb_build_object('account_id',item->>'source_account_id','description','Correction of journal #'||(item->>'journal_number')||' line '||(item->>'id'),'debit_minor',item->>'credit_minor','credit_minor',item->>'debit_minor'),
    jsonb_build_object('account_id',_target_id,'description','Correction from '||(item->>'source_account_code')||'; source line '||(item->>'id'),'debit_minor',item->>'debit_minor','credit_minor',item->>'credit_minor'));
  END LOOP;
  jid:=public.post_journal(jsonb_build_object('company_id',_company_id,'journal_date',d,'currency_code',plan->>'currency','fx_rate_to_base',1,'source_type','manual','source_id',b.id,
   'idempotency_key','transaction_correction:'||b.id||':'||d,'memo','Transaction correction: '||trim(_reason),'lines',lines));
  ids:=array_append(ids,jid);
 END LOOP;
 INSERT INTO public.transaction_correction_items(batch_id,company_id,source_line_id,source_journal_id)
 SELECT b.id,_company_id,(value->>'id')::uuid,(value->>'journal_id')::uuid FROM jsonb_array_elements(plan->'rows');
 UPDATE public.transaction_correction_batches SET journal_ids=ids WHERE id=b.id RETURNING * INTO b;
 PERFORM public.record_audit_event(_company_id,'transaction_correction.applied','transaction_correction_batch',b.id,jsonb_build_object('plan',plan,'journal_ids',ids));
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.apply_transaction_correction(uuid,uuid,text,jsonb,uuid,text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_transaction_correction(uuid,uuid,text,jsonb,uuid,text,date,text) TO authenticated;

CREATE FUNCTION public.undo_transaction_correction(_company_id uuid,_batch_id uuid,_date date,_reason text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.transaction_correction_batches; jid uuid; rev uuid; j public.journals; r public.journals; left_lines jsonb; right_lines jsonb; ids uuid[]:='{}';
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'journals.manual') OR NOT public.has_company_permission(_company_id,'accounting.post') THEN RAISE EXCEPTION 'Manual journal and posting permissions required' USING ERRCODE='42501'; END IF;
 IF _date IS NULL OR _reason IS NULL OR length(trim(_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Undo date and a reason of 5 to 1000 characters are required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text,29));
 SELECT * INTO b FROM public.transaction_correction_batches WHERE company_id=_company_id AND id=_batch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Correction batch not found'; END IF;
 IF b.status='undone' THEN
  IF b.undo_date<>_date OR b.undo_reason<>trim(_reason) THEN RAISE EXCEPTION 'Batch was already undone with different details'; END IF;
  RETURN to_jsonb(b);
 END IF;
 PERFORM 1 FROM public.accounts WHERE company_id=_company_id ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.accounting_periods WHERE company_id=_company_id ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.organisation_lock_policy WHERE company_id=_company_id FOR SHARE;
 FOR jid IN SELECT unnest(b.journal_ids) ORDER BY 1 LOOP
  SELECT * INTO j FROM public.journals WHERE id=jid AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND OR j.status<>'posted' THEN RAISE EXCEPTION 'A correction journal is unavailable for undo'; END IF;
  IF _date<j.journal_date THEN RAISE EXCEPTION 'Undo date cannot precede a correction journal'; END IF;
  IF j.reversed_by_journal_id IS NOT NULL THEN
   SELECT * INTO r FROM public.journals WHERE id=j.reversed_by_journal_id AND company_id=_company_id FOR UPDATE;
   IF NOT FOUND OR r.reverses_journal_id IS DISTINCT FROM j.id OR r.status<>'posted' OR r.reversed_by_journal_id IS NOT NULL OR r.currency_code<>j.currency_code OR r.fx_rate_to_base<>j.fx_rate_to_base THEN RAISE EXCEPTION 'External reversal requires accountant investigation'; END IF;
   SELECT jsonb_agg(jsonb_build_array(account_id,credit_minor,debit_minor) ORDER BY account_id,credit_minor,debit_minor) INTO left_lines FROM public.journal_lines WHERE journal_id=j.id;
   SELECT jsonb_agg(jsonb_build_array(account_id,debit_minor,credit_minor) ORDER BY account_id,debit_minor,credit_minor) INTO right_lines FROM public.journal_lines WHERE journal_id=r.id;
   IF left_lines IS DISTINCT FROM right_lines THEN RAISE EXCEPTION 'External reversal does not exactly offset this correction'; END IF;
   rev:=r.id;
  ELSE
   PERFORM public.assert_journal_date_unlocked(_company_id,_date);
   rev:=public.reverse_journal_on(jid,_date,'transaction_correction_undo:'||b.id||':'||jid);
  END IF;
  ids:=array_append(ids,rev);
 END LOOP;
 UPDATE public.transaction_correction_items SET active=false WHERE batch_id=b.id;
 UPDATE public.transaction_correction_batches SET status='undone',undo_date=_date,undo_reason=trim(_reason),undone_by=auth.uid(),undone_at=now(),undo_journal_ids=ids WHERE id=b.id RETURNING * INTO b;
 PERFORM public.record_audit_event(_company_id,'transaction_correction.undone','transaction_correction_batch',b.id,jsonb_build_object('reason',trim(_reason),'requested_date',_date,'reversal_journal_ids',ids));
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.undo_transaction_correction(uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.undo_transaction_correction(uuid,uuid,date,text) TO authenticated;

-- Avoid orphaned adjustments when an invoice/bill/journal is subsequently reversed.
CREATE FUNCTION private.guard_corrected_journal_reversal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.reversed_by_journal_id IS NULL AND NEW.reversed_by_journal_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.transaction_correction_items WHERE source_journal_id=OLD.id AND active) THEN
   RAISE EXCEPTION 'Undo active transaction corrections before reversing this source journal'; END IF;
  IF EXISTS(SELECT 1 FROM public.transaction_correction_batches b WHERE b.journal_ids @> ARRAY[OLD.reverses_journal_id]) THEN
   RAISE EXCEPTION 'Correction reversals cannot be reversed; create a new correction after undo'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_corrected_journal_reversal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER correction_source_reversal_guard BEFORE UPDATE OF reversed_by_journal_id ON public.journals FOR EACH ROW EXECUTE FUNCTION private.guard_corrected_journal_reversal();
