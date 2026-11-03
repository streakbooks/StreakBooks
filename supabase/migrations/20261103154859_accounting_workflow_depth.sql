-- Independent LinkBooks workflow implementation. No posted journals are rewritten.
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS request_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_request_key ON public.purchase_orders(company_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_orders_browse ON public.purchase_orders(company_id,order_date DESC,id DESC);

-- Canonical arithmetic: purchasing truncates extended quantities, sales rounds half up.
CREATE OR REPLACE FUNCTION private.workflow_order_lines(_company uuid,_lines jsonb,_sales boolean DEFAULT false,_inclusive boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l jsonb; a uuid; q numeric; price numeric; discount numeric; rate numeric; extended numeric; net bigint; tax bigint; subtotal numeric:=0; taxes numeric:=0; result jsonb:='[]';
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,CASE WHEN _sales THEN 'sales.draft' ELSE 'purchases.draft' END) THEN RAISE EXCEPTION 'Order access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Add between 1 and 200 order lines'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  a:=(l->>'accountId')::uuid; q:=(l->>'quantity')::numeric; price:=(l->>'unitPriceMinor')::numeric; discount:=coalesce((l->>'discountMinor')::numeric,0); rate:=coalesce((l->>'taxRateBps')::numeric,0);
  IF length(trim(coalesce(l->>'description',''))) NOT BETWEEN 1 AND 2000 OR q IS NULL OR q<=0 OR q>1000000000 OR q<>trunc(q,6) OR price IS NULL OR price<0 OR price<>trunc(price) OR price>9007199254740991 OR discount<0 OR discount<>trunc(discount) OR rate<0 OR rate>10000 OR rate<>trunc(rate) THEN RAISE EXCEPTION 'Invalid order line'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE company_id=_company AND id=a AND is_active AND is_postable AND archived_at IS NULL) THEN RAISE EXCEPTION 'Order account is inactive or outside this organisation'; END IF;
  extended:=CASE WHEN _sales THEN round(q*price) ELSE trunc(q*price) END-discount;
  IF extended<0 OR extended>9007199254740991 THEN RAISE EXCEPTION 'Discount exceeds line amount or amount too large'; END IF;
  IF _inclusive THEN net:=round(extended*10000/(10000+rate)); tax:=extended-net; ELSE net:=extended; tax:=round(net::numeric*rate/10000); END IF;
  subtotal:=subtotal+net; taxes:=taxes+tax;
  result:=result||jsonb_build_array(jsonb_build_object('description',trim(l->>'description'),'account_id',a,'quantity',q,'unit_price_minor',price,'discount_minor',discount,'tax_rate_bps',rate,'net_minor',net,'tax_minor',tax));
 END LOOP;
 IF subtotal+taxes>9007199254740991 THEN RAISE EXCEPTION 'Order total exceeds supported range'; END IF;
 RETURN jsonb_build_object('lines',result,'subtotal_minor',subtotal,'tax_minor',taxes,'total_minor',subtotal+taxes);
END $$;

CREATE OR REPLACE FUNCTION private.save_purchase_order_atomic(_company uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE o public.purchase_orders; id uuid:=nullif(_payload->>'orderId','')::uuid; request uuid:=nullif(_payload->>'requestId','')::uuid; contact uuid:=(_payload->>'contactId')::uuid; lines jsonb; computed jsonb; fingerprint text:=md5(_payload::text); currency text:=upper(trim(_payload->>'currencyCode'));
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 IF id IS NULL AND request IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 IF id IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||request::text,0));
  SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND client_request_id=request;
  IF FOUND THEN IF o.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Request ID already used with different order data'; END IF; RETURN jsonb_build_object('id',o.id,'orderNumber',o.order_number,'version',o.version); END IF;
 ELSE
  SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND purchase_orders.id=id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF o.status<>'draft' OR o.billed_bill_id IS NOT NULL THEN RAISE EXCEPTION 'Only unbilled draft orders can be edited'; END IF;
  IF o.version IS DISTINCT FROM (_payload->>'version')::bigint THEN RAISE EXCEPTION 'Order changed; reload before saving' USING ERRCODE='40001'; END IF;
 END IF;
 IF currency IS NULL OR currency !~ '^[A-Z]{3}$' OR coalesce(_payload->>'orderDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (_payload->>'orderDate')::date IS NULL OR length(coalesce(_payload->>'memo',''))>500 THEN RAISE EXCEPTION 'Invalid order header'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND contacts.id=contact AND kind::text IN ('supplier','both') AND is_active) THEN RAISE EXCEPTION 'Active supplier required in this organisation'; END IF;
 computed:=private.workflow_order_lines(_company,_payload->'lines');
 IF id IS NULL THEN
  INSERT INTO public.purchase_orders(company_id,contact_id,order_number,order_date,currency_code,memo,status,subtotal_minor,tax_minor,total_minor,created_by,client_request_id,request_fingerprint)
  VALUES(_company,contact,public.allocate_document_number(_company,'purchase_order'),(_payload->>'orderDate')::date,currency,nullif(trim(_payload->>'memo'),''),'draft',(computed->>'subtotal_minor')::bigint,(computed->>'tax_minor')::bigint,(computed->>'total_minor')::bigint,auth.uid(),request,fingerprint) RETURNING * INTO o;
  id:=o.id;
 ELSE
  UPDATE public.purchase_orders SET contact_id=contact,order_date=(_payload->>'orderDate')::date,currency_code=currency,memo=nullif(trim(_payload->>'memo'),''),subtotal_minor=(computed->>'subtotal_minor')::bigint,tax_minor=(computed->>'tax_minor')::bigint,total_minor=(computed->>'total_minor')::bigint,version=version+1,updated_at=now() WHERE purchase_orders.id=id AND company_id=_company RETURNING * INTO o;
  DELETE FROM public.purchase_order_lines WHERE order_id=id AND company_id=_company;
 END IF;
 INSERT INTO public.purchase_order_lines(company_id,order_id,line_no,description,account_id,quantity,unit_price_minor,tax_rate_bps,net_minor,tax_minor)
 SELECT _company,id,n::integer,l->>'description',(l->>'account_id')::uuid,(l->>'quantity')::numeric,(l->>'unit_price_minor')::bigint,(l->>'tax_rate_bps')::integer,(l->>'net_minor')::bigint,(l->>'tax_minor')::bigint FROM jsonb_array_elements(computed->'lines') WITH ORDINALITY x(l,n);
 PERFORM public.record_audit_event(_company,CASE WHEN o.version=1 THEN 'purchase_order_created' ELSE 'purchase_order_updated' END,'purchase_order',id,jsonb_build_object('version',o.version,'line_count',jsonb_array_length(computed->'lines')));
 RETURN jsonb_build_object('id',id,'orderNumber',o.order_number,'version',o.version);
END $$;
CREATE OR REPLACE FUNCTION public.save_purchase_order_atomic(_company uuid,_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_purchase_order_atomic(_company,_payload) $$;

CREATE OR REPLACE FUNCTION private.convert_purchase_order_atomic(_company uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders; bill uuid; terms integer; lines jsonb; c jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
 IF o.billed_bill_id IS NOT NULL THEN RETURN jsonb_build_object('billId',o.billed_bill_id); END IF;
 IF o.status NOT IN ('draft','sent') THEN RAISE EXCEPTION 'This order cannot be converted'; END IF;
 SELECT jsonb_agg(jsonb_build_object('description',description,'accountId',account_id,'quantity',quantity,'unitPriceMinor',unit_price_minor,'discountMinor',trunc(quantity*unit_price_minor)-net_minor,'taxRateBps',tax_rate_bps) ORDER BY line_no) INTO lines FROM public.purchase_order_lines WHERE company_id=_company AND order_id=_order;
 c:=private.workflow_order_lines(_company,lines);
 IF (c->>'subtotal_minor')::bigint<>o.subtotal_minor OR (c->>'tax_minor')::bigint<>o.tax_minor THEN RAISE EXCEPTION 'Order totals are inconsistent; correct the draft before conversion'; END IF;
 SELECT greatest(0,coalesce(payment_terms_days,30)) INTO terms FROM public.contacts WHERE company_id=_company AND id=o.contact_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
 INSERT INTO public.purchase_bills(company_id,contact_id,bill_number,bill_date,due_date,payment_terms_days,tax_calculation,currency_code,memo,status,subtotal_minor,tax_minor,total_minor,purchase_order_id,created_by)
 VALUES(_company,o.contact_id,public.allocate_document_number(_company,'purchase_bill'),o.order_date,o.order_date+terms,terms,'exclusive',o.currency_code,coalesce(o.memo,'From purchase order '||o.order_number),'draft',o.subtotal_minor,o.tax_minor,o.total_minor,o.id,auth.uid()) RETURNING id INTO bill;
 INSERT INTO public.purchase_bill_lines(company_id,bill_id,line_no,description,account_id,quantity,unit_price_minor,discount_minor,tax_rate_bps,net_minor,tax_minor)
 SELECT _company,bill,n::integer,l->>'description',(l->>'account_id')::uuid,(l->>'quantity')::numeric,(l->>'unit_price_minor')::bigint,(l->>'discount_minor')::bigint,(l->>'tax_rate_bps')::integer,(l->>'net_minor')::bigint,(l->>'tax_minor')::bigint FROM jsonb_array_elements(c->'lines') WITH ORDINALITY x(l,n);
 UPDATE public.purchase_orders SET billed_bill_id=bill,status='billed',version=version+1,updated_at=now() WHERE company_id=_company AND id=_order;
 PERFORM public.record_audit_event(_company,'purchase_order_converted','purchase_order',_order,jsonb_build_object('bill_id',bill));
 RETURN jsonb_build_object('billId',bill);
END $$;
CREATE OR REPLACE FUNCTION public.convert_purchase_order_atomic(_company uuid,_order uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.convert_purchase_order_atomic(_company,_order) $$;

CREATE TABLE public.sales_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,contact_id uuid NOT NULL REFERENCES public.contacts(id),order_number text NOT NULL,order_date date NOT NULL,currency_code char(3) NOT NULL,fx_rate_to_base numeric NOT NULL CHECK(fx_rate_to_base>0),tax_inclusive boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','invoiced','cancelled')),lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),subtotal_minor bigint NOT NULL,tax_minor bigint NOT NULL,total_minor bigint NOT NULL,memo text,invoice_id uuid REFERENCES public.sales_invoices(id),version bigint NOT NULL DEFAULT 1,client_request_id uuid NOT NULL,request_fingerprint text NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,client_request_id)
);
CREATE INDEX sales_orders_company_date ON public.sales_orders(company_id,order_date DESC,id DESC);
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_orders_read ON public.sales_orders FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'sales.view'));
REVOKE ALL ON public.sales_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sales_orders TO authenticated;
CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard('sales');

CREATE OR REPLACE FUNCTION private.save_sales_order(_company uuid,_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE o public.sales_orders; id uuid:=nullif(_payload->>'orderId','')::uuid; request uuid:=(_payload->>'requestId')::uuid; contact uuid:=(_payload->>'contactId')::uuid; c jsonb; currency text:=upper(trim(_payload->>'currencyCode')); base text; fx numeric; inclusive boolean; fingerprint text:=md5(_payload::text);
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'sales.draft') THEN RAISE EXCEPTION 'Sales access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 IF request IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 IF id IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||request::text,0));
  SELECT * INTO o FROM public.sales_orders WHERE company_id=_company AND client_request_id=request;
  IF FOUND THEN IF o.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Request ID already used with different data'; END IF; RETURN to_jsonb(o); END IF;
 ELSE
  SELECT * INTO o FROM public.sales_orders WHERE company_id=_company AND sales_orders.id=id FOR UPDATE;
  IF NOT FOUND OR o.status<>'draft' OR o.version IS DISTINCT FROM (_payload->>'version')::bigint THEN RAISE EXCEPTION 'Only the current draft can be edited; reload first'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE company_id=_company AND contacts.id=contact AND kind::text IN ('customer','both') AND is_active) THEN RAISE EXCEPTION 'Active customer required in this organisation'; END IF;
 SELECT base_currency INTO base FROM public.companies WHERE companies.id=_company;
 SELECT coalesce(prices_include_tax,false) INTO inclusive FROM public.company_tax_settings WHERE company_id=_company;
 inclusive:=coalesce(inclusive,false);
 fx:=CASE WHEN currency=base THEN 1 ELSE (_payload->>'fxRate')::numeric END;
 IF currency IS NULL OR currency !~ '^[A-Z]{3}$' OR fx IS NULL OR fx<=0 OR fx>1000000000 OR coalesce(_payload->>'orderDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (_payload->>'orderDate')::date IS NULL OR length(coalesce(_payload->>'memo',''))>500 THEN RAISE EXCEPTION 'Invalid order date, currency or exchange rate'; END IF;
 c:=private.workflow_order_lines(_company,_payload->'lines',true,inclusive);
 IF id IS NULL THEN
  INSERT INTO public.sales_orders(company_id,contact_id,order_number,order_date,currency_code,fx_rate_to_base,tax_inclusive,lines,subtotal_minor,tax_minor,total_minor,memo,client_request_id,request_fingerprint,created_by)
  VALUES(_company,contact,public.allocate_document_number(_company,'sales_order'),(_payload->>'orderDate')::date,currency,fx,inclusive,c->'lines',(c->>'subtotal_minor')::bigint,(c->>'tax_minor')::bigint,(c->>'total_minor')::bigint,nullif(trim(_payload->>'memo'),''),request,fingerprint,auth.uid()) RETURNING * INTO o;
 ELSE
  UPDATE public.sales_orders SET contact_id=contact,order_date=(_payload->>'orderDate')::date,currency_code=currency,fx_rate_to_base=fx,tax_inclusive=inclusive,lines=c->'lines',subtotal_minor=(c->>'subtotal_minor')::bigint,tax_minor=(c->>'tax_minor')::bigint,total_minor=(c->>'total_minor')::bigint,memo=nullif(trim(_payload->>'memo'),''),version=version+1,updated_at=now() WHERE sales_orders.id=id RETURNING * INTO o;
 END IF;
 PERFORM public.record_audit_event(_company,'sales_order_saved','sales_order',o.id,jsonb_build_object('version',o.version));
 RETURN to_jsonb(o);
END $$;
CREATE OR REPLACE FUNCTION public.save_sales_order(_company uuid,_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_sales_order(_company,_payload) $$;

CREATE OR REPLACE FUNCTION private.act_sales_order(_company uuid,_order uuid,_version bigint,_action text,_invoice_date date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.sales_orders; invoice uuid; terms integer; inclusive boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'sales.draft') THEN RAISE EXCEPTION 'Sales access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT * INTO o FROM public.sales_orders WHERE company_id=_company AND id=_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
 IF _action='invoice' AND o.invoice_id IS NOT NULL THEN RETURN jsonb_build_object('invoiceId',o.invoice_id); END IF;
 IF o.version IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Order changed; reload first' USING ERRCODE='40001'; END IF;
 IF _action='confirm' AND o.status='draft' THEN UPDATE public.sales_orders SET status='confirmed',version=version+1,updated_at=now() WHERE id=_order;
 ELSIF _action='cancel' AND o.status IN ('draft','confirmed') THEN UPDATE public.sales_orders SET status='cancelled',version=version+1,updated_at=now() WHERE id=_order;
 ELSIF _action='invoice' AND o.status='confirmed' THEN
  IF _invoice_date IS NULL OR NOT isfinite(_invoice_date) OR _invoice_date<o.order_date THEN RAISE EXCEPTION 'Invoice date must be on or after the order date'; END IF;
  SELECT coalesce(prices_include_tax,false) INTO inclusive FROM public.company_tax_settings WHERE company_id=_company;
  IF coalesce(inclusive,false)<>o.tax_inclusive THEN RAISE EXCEPTION 'Tax treatment changed; create a new order using the current treatment'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l LEFT JOIN public.accounts a ON a.id=(l->>'account_id')::uuid AND a.company_id=_company WHERE a.id IS NULL OR NOT a.is_active OR NOT a.is_postable OR a.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'An order account is no longer available'; END IF;
  SELECT greatest(0,coalesce(payment_terms_days,30)) INTO terms FROM public.contacts WHERE company_id=_company AND id=o.contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  INSERT INTO public.sales_invoices(company_id,contact_id,invoice_number,invoice_date,due_date,currency_code,fx_rate_to_base,status,subtotal_minor,tax_minor,total_minor,memo,created_by)
  VALUES(_company,o.contact_id,public.allocate_document_number(_company,'sales_invoice'),_invoice_date,_invoice_date+terms,o.currency_code,o.fx_rate_to_base,'draft',o.subtotal_minor,o.tax_minor,o.total_minor,concat_ws(E'\n',o.memo,'Sales order '||o.order_number),auth.uid()) RETURNING id INTO invoice;
  INSERT INTO public.sales_invoice_lines(company_id,invoice_id,line_order,description,account_id,quantity,unit_price_minor,discount_minor,tax_rate_bps,net_minor,tax_minor,gross_minor)
  SELECT _company,invoice,n::integer,l->>'description',(l->>'account_id')::uuid,(l->>'quantity')::numeric,(l->>'unit_price_minor')::bigint,(l->>'discount_minor')::bigint,(l->>'tax_rate_bps')::integer,(l->>'net_minor')::bigint,(l->>'tax_minor')::bigint,(l->>'net_minor')::bigint+(l->>'tax_minor')::bigint FROM jsonb_array_elements(o.lines) WITH ORDINALITY x(l,n);
  UPDATE public.sales_orders SET status='invoiced',invoice_id=invoice,version=version+1,updated_at=now() WHERE id=_order;
 ELSE RAISE EXCEPTION 'This order action is not allowed'; END IF;
 PERFORM public.record_audit_event(_company,'sales_order_'||_action,'sales_order',_order,jsonb_build_object('invoice_id',invoice));
 RETURN jsonb_build_object('id',_order,'invoiceId',invoice);
END $$;
CREATE OR REPLACE FUNCTION public.act_sales_order(_company uuid,_order uuid,_version bigint,_action text,_invoice_date date DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.act_sales_order(_company,_order,_version,_action,_invoice_date) $$;

CREATE TABLE public.deferral_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('prepaid_expense','deferred_income')),name text NOT NULL,reference text NOT NULL,debit_account_id uuid NOT NULL REFERENCES public.accounts(id),credit_account_id uuid NOT NULL REFERENCES public.accounts(id),total_minor bigint NOT NULL CHECK(total_minor>0),start_date date NOT NULL,periods integer NOT NULL CHECK(periods BETWEEN 1 AND 120),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),client_request_id uuid NOT NULL,request_fingerprint text NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,client_request_id),CHECK(debit_account_id<>credit_account_id)
);
CREATE TABLE public.deferral_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,schedule_id uuid NOT NULL REFERENCES public.deferral_schedules(id),period_no integer NOT NULL,due_on date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),journal_id uuid REFERENCES public.journals(id),posted_on date,UNIQUE(schedule_id,period_no)
);
CREATE INDEX deferral_schedules_company ON public.deferral_schedules(company_id,created_at DESC,id);
CREATE INDEX deferral_entries_due ON public.deferral_entries(company_id,due_on,schedule_id);
ALTER TABLE public.deferral_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deferral_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY deferral_schedules_read ON public.deferral_schedules FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'accounting.view'));
CREATE POLICY deferral_entries_read ON public.deferral_entries FOR SELECT TO authenticated USING(public.has_company_permission(company_id,'accounting.view'));
REVOKE ALL ON public.deferral_schedules FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.deferral_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.deferral_schedules,public.deferral_entries TO authenticated;
CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.deferral_schedules FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard('accounting');
CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.deferral_entries FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard('accounting');

CREATE OR REPLACE FUNCTION private.create_deferral_schedule(_company uuid,_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.deferral_schedules; request uuid:=(_payload->>'requestId')::uuid; fingerprint text:=md5(_payload::text); total numeric:=(_payload->>'totalMinor')::numeric; periods integer:=(_payload->>'periods')::integer; start date:=(_payload->>'startDate')::date; debit uuid:=(_payload->>'debitAccountId')::uuid; credit uuid:=(_payload->>'creditAccountId')::uuid; kind text:=_payload->>'kind'; n integer; month date; due date; debit_type text; credit_type text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'accounting.post') THEN RAISE EXCEPTION 'Accounting access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 IF request IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||request::text,0));
 SELECT * INTO s FROM public.deferral_schedules WHERE company_id=_company AND client_request_id=request;
 IF FOUND THEN IF s.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Request ID already used with different data'; END IF; RETURN to_jsonb(s); END IF;
 IF total IS NULL OR total<>trunc(total) OR total>9007199254740991 OR periods IS NULL OR periods NOT BETWEEN 1 AND 120 OR (_payload->>'periods')::numeric<>periods OR total<periods OR start IS NULL OR coalesce(_payload->>'startDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR debit=credit OR kind IS NULL OR kind NOT IN ('prepaid_expense','deferred_income') OR length(trim(coalesce(_payload->>'name',''))) NOT BETWEEN 1 AND 160 OR length(trim(coalesce(_payload->>'reference',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid schedule: enter a name, source reference, accounts, dates and at least one minor unit per period'; END IF;
 SELECT account_type::text INTO debit_type FROM public.accounts WHERE company_id=_company AND id=debit AND is_active AND is_postable AND archived_at IS NULL;
 SELECT account_type::text INTO credit_type FROM public.accounts WHERE company_id=_company AND id=credit AND is_active AND is_postable AND archived_at IS NULL;
 IF (kind='prepaid_expense' AND (debit_type IS DISTINCT FROM 'expense' OR credit_type IS DISTINCT FROM 'asset')) OR (kind='deferred_income' AND (debit_type IS DISTINCT FROM 'liability' OR credit_type IS DISTINCT FROM 'income')) THEN RAISE EXCEPTION 'Prepayments require expense/asset accounts; deferred income requires liability/income accounts in this organisation'; END IF;
 INSERT INTO public.deferral_schedules(company_id,kind,name,reference,debit_account_id,credit_account_id,total_minor,start_date,periods,client_request_id,request_fingerprint,created_by)
 VALUES(_company,kind,trim(_payload->>'name'),trim(_payload->>'reference'),debit,credit,total,start,periods,request,fingerprint,auth.uid()) RETURNING * INTO s;
 FOR n IN 1..periods LOOP
  month:=(date_trunc('month',start)+(n-1)*interval '1 month')::date;
  due:=month+least(extract(day FROM start)::integer,extract(day FROM (month+interval '1 month - 1 day'))::integer)-1;
  INSERT INTO public.deferral_entries(company_id,schedule_id,period_no,due_on,amount_minor) VALUES(_company,s.id,n,due,CASE WHEN n=periods THEN total-trunc(total/periods)*(periods-1) ELSE trunc(total/periods) END);
 END LOOP;
 PERFORM public.record_audit_event(_company,'deferral_schedule_created','deferral_schedule',s.id,jsonb_build_object('kind',kind,'periods',periods,'total_minor',total));
 RETURN to_jsonb(s);
END $$;
CREATE OR REPLACE FUNCTION public.create_deferral_schedule(_company uuid,_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.create_deferral_schedule(_company,_payload) $$;

CREATE OR REPLACE FUNCTION private.post_deferral_entry(_company uuid,_entry uuid,_posting_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.deferral_entries; s public.deferral_schedules; journal uuid; currency text; today date;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'accounting.post') THEN RAISE EXCEPTION 'Accounting access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 -- All actions use schedule->entry lock order, including cancellation.
 SELECT s1.* INTO s FROM public.deferral_schedules s1 JOIN public.deferral_entries e1 ON e1.schedule_id=s1.id AND e1.company_id=s1.company_id WHERE s1.company_id=_company AND e1.id=_entry FOR UPDATE OF s1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deferral entry not found'; END IF;
 SELECT * INTO e FROM public.deferral_entries WHERE company_id=_company AND id=_entry FOR UPDATE;
 IF e.journal_id IS NOT NULL THEN IF EXISTS(SELECT 1 FROM public.journals WHERE id=e.journal_id AND reversed_by_journal_id IS NOT NULL) THEN RAISE EXCEPTION 'The recognition journal was reversed; review the correction before proceeding'; END IF; RETURN jsonb_build_object('journalId',e.journal_id); END IF;
 IF s.status<>'active' THEN RAISE EXCEPTION 'Schedule is not active'; END IF;
 SELECT base_currency,(now() AT TIME ZONE coalesce(timezone,'UTC'))::date INTO currency,today FROM public.companies WHERE id=_company;
 IF _posting_date IS NULL OR _posting_date<e.due_on OR _posting_date>today THEN RAISE EXCEPTION 'Posting date must be on or after the scheduled date and no later than today'; END IF;
 journal:=public.post_journal(jsonb_build_object('company_id',_company,'journal_date',_posting_date,'currency_code',currency,'fx_rate_to_base',1,'source_type','manual','idempotency_key','deferral:'||e.id,'memo',s.name||' — period '||e.period_no||' — '||s.reference,'lines',jsonb_build_array(jsonb_build_object('account_id',s.debit_account_id,'debit_minor',e.amount_minor,'credit_minor',0),jsonb_build_object('account_id',s.credit_account_id,'debit_minor',0,'credit_minor',e.amount_minor))));
 UPDATE public.deferral_entries SET journal_id=journal,posted_on=_posting_date WHERE id=e.id;
 IF NOT EXISTS(SELECT 1 FROM public.deferral_entries WHERE schedule_id=s.id AND journal_id IS NULL) THEN UPDATE public.deferral_schedules SET status='completed' WHERE id=s.id; END IF;
 PERFORM public.record_audit_event(_company,'deferral_entry_posted','deferral_schedule',s.id,jsonb_build_object('entry_id',e.id,'journal_id',journal,'scheduled_date',e.due_on,'posting_date',_posting_date));
 RETURN jsonb_build_object('journalId',journal);
END $$;
CREATE OR REPLACE FUNCTION public.post_deferral_entry(_company uuid,_entry uuid,_posting_date date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.post_deferral_entry(_company,_entry,_posting_date) $$;

CREATE OR REPLACE FUNCTION private.cancel_deferral_schedule(_company uuid,_schedule uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.deferral_schedules;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'accounting.post') THEN RAISE EXCEPTION 'Accounting access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT * INTO s FROM public.deferral_schedules WHERE company_id=_company AND id=_schedule FOR UPDATE;
 IF NOT FOUND OR s.status<>'active' OR EXISTS(SELECT 1 FROM public.deferral_entries WHERE schedule_id=_schedule AND journal_id IS NOT NULL) THEN RAISE EXCEPTION 'Only entirely unposted active schedules can be cancelled'; END IF;
 UPDATE public.deferral_schedules SET status='cancelled' WHERE id=_schedule;
 PERFORM public.record_audit_event(_company,'deferral_schedule_cancelled','deferral_schedule',_schedule);
END $$;
CREATE OR REPLACE FUNCTION public.cancel_deferral_schedule(_company uuid,_schedule uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.cancel_deferral_schedule(_company,_schedule) $$;

-- Explicit execute surface: no anonymous access to mutation helpers or wrappers.
REVOKE ALL ON FUNCTION private.workflow_order_lines(uuid,jsonb,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.workflow_order_lines(uuid,jsonb,boolean,boolean) TO authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('save_purchase_order_atomic','convert_purchase_order_atomic','save_sales_order','act_sales_order','create_deferral_schedule','post_deferral_entry','cancel_deferral_schedule') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA private TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION private.change_purchase_order_atomic(_company uuid,_order uuid,_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.draft') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_company::text||':workflow-reset',0));
 SELECT * INTO o FROM public.purchase_orders WHERE company_id=_company AND id=_order FOR UPDATE;
 IF NOT FOUND OR o.billed_bill_id IS NOT NULL OR o.status NOT IN ('draft','sent') OR _status IS NULL OR _status NOT IN ('sent','cancelled') OR (_status='sent' AND o.status<>'draft') THEN RAISE EXCEPTION 'This order action is no longer allowed'; END IF;
 UPDATE public.purchase_orders SET status=_status::public.po_status,version=version+1,updated_at=now() WHERE company_id=_company AND id=_order;
 PERFORM public.record_audit_event(_company,'purchase_order_status_changed','purchase_order',_order,jsonb_build_object('from',o.status,'to',_status,'delivery','manual_status_only'));
 RETURN jsonb_build_object('id',_order,'status',_status);
END $$;
CREATE OR REPLACE FUNCTION public.change_purchase_order_atomic(_company uuid,_order uuid,_status text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.change_purchase_order_atomic(_company,_order,_status) $$;
REVOKE ALL ON FUNCTION private.change_purchase_order_atomic(uuid,uuid,text),public.change_purchase_order_atomic(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.change_purchase_order_atomic(uuid,uuid,text),public.change_purchase_order_atomic(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.browse_purchase_orders(_company uuid,_search text DEFAULT '',_status text DEFAULT 'all',_page integer DEFAULT 1,_size integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; pattern text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'purchases.view') THEN RAISE EXCEPTION 'Purchase access denied' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _size IS NULL OR _page NOT BETWEEN 1 AND 100000 OR _size NOT BETWEEN 1 AND 100 OR length(coalesce(_search,''))>100 OR _status IS NULL OR _status NOT IN ('all','draft','sent','partially_received','billed','cancelled') THEN RAISE EXCEPTION 'Invalid order filters'; END IF;
 pattern:='%'||replace(replace(replace(trim(coalesce(_search,'')),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 WITH filtered AS MATERIALIZED(SELECT o.id,o.order_number,o.order_date,o.currency_code,o.status,o.total_minor,o.billed_bill_id,o.version,jsonb_build_object('name',c.name) contacts FROM public.purchase_orders o JOIN public.contacts c ON c.id=o.contact_id AND c.company_id=o.company_id WHERE o.company_id=_company AND (_status='all' OR o.status::text=_status) AND (coalesce(o.order_number,'') ILIKE pattern OR c.name ILIKE pattern OR o.currency_code ILIKE pattern)), page AS(SELECT * FROM filtered ORDER BY order_date DESC,id DESC LIMIT _size OFFSET (_page-1)*_size)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY order_date DESC,id DESC) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'page',_page,'pageSize',_size) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.browse_purchase_orders(uuid,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.browse_purchase_orders(uuid,text,text,integer,integer) TO authenticated;
CREATE INDEX sales_orders_contact ON public.sales_orders(contact_id);
CREATE INDEX sales_orders_invoice ON public.sales_orders(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX deferral_schedules_debit ON public.deferral_schedules(debit_account_id);
CREATE INDEX deferral_schedules_credit ON public.deferral_schedules(credit_account_id);
CREATE INDEX deferral_entries_journal ON public.deferral_entries(journal_id) WHERE journal_id IS NOT NULL;
CREATE INDEX deferral_entries_schedule ON public.deferral_entries(schedule_id);

CREATE INDEX sales_orders_creator ON public.sales_orders(created_by);
CREATE INDEX deferral_schedules_creator ON public.deferral_schedules(created_by);
ALTER TABLE public.deferral_schedules ADD CONSTRAINT deferral_schedules_id_company UNIQUE(id,company_id);
ALTER TABLE public.deferral_entries ADD CONSTRAINT deferral_entries_schedule_company FOREIGN KEY(schedule_id,company_id) REFERENCES public.deferral_schedules(id,company_id);

-- Keep the existing guarded demo reset, clearing new dependencies before its legacy purge.
-- No reset is executed by this migration.
ALTER FUNCTION public.reset_demo_company(uuid) SET SCHEMA private;
ALTER FUNCTION private.reset_demo_company(uuid) RENAME TO reset_demo_company_before_workflows;
REVOKE ALL ON FUNCTION private.reset_demo_company_before_workflows(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.reset_demo_company_with_workflows(_company uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company,'demo.reset') THEN RAISE EXCEPTION 'Demo reset access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company::text||':workflow-reset',0));
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_company AND is_demo) THEN RAISE EXCEPTION 'Reset denied: company is not a demo company'; END IF;
 DELETE FROM public.deferral_entries WHERE company_id=_company;
 DELETE FROM public.deferral_schedules WHERE company_id=_company;
 DELETE FROM public.sales_orders WHERE company_id=_company;
 PERFORM private.reset_demo_company_before_workflows(_company);
END $$;
CREATE OR REPLACE FUNCTION public.reset_demo_company(_company_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.reset_demo_company_with_workflows(_company_id) $$;
REVOKE ALL ON FUNCTION private.reset_demo_company_with_workflows(uuid),public.reset_demo_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.reset_demo_company_with_workflows(uuid),public.reset_demo_company(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
