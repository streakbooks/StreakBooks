-- Calculated columns contain no independently supplied financial facts. They are evaluated by the bounded report parser.
CREATE OR REPLACE FUNCTION public.capture_custom_report_facts(_company_id uuid,_from date,_to date,_definition jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; cols jsonb:='[]'; col jsonb; d1 date; d2 date; balances jsonb;
BEGIN
 IF jsonb_typeof(_definition)<>'object' OR octet_length(_definition::text)>100000 OR jsonb_typeof(_definition->'columns')<>'array' OR jsonb_array_length(_definition->'columns') NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Invalid custom report definition'; END IF;
 result:=public.capture_reporting_facts(_company_id,_from,_to);
 FOR col IN SELECT value FROM jsonb_array_elements(_definition->'columns') LOOP
  d1:=_from;d2:=_to;
  CASE col->>'mode'
   WHEN 'period' THEN NULL;
   WHEN 'calculated' THEN NULL;
   WHEN 'prior_period' THEN d2:=_from-1;d1:=_from-(_to-_from+1);
   WHEN 'prior_year' THEN d1:=(_from-interval '1 year')::date;d2:=(_to-interval '1 year')::date;
   WHEN 'month' THEN
    IF abs(COALESCE((col->>'monthOffset')::integer,0))>120 THEN RAISE EXCEPTION 'Month offset exceeds ten years'; END IF;
    d1:=(date_trunc('month',_from)+make_interval(months=>COALESCE((col->>'monthOffset')::integer,0)))::date;d2:=(d1+interval '1 month - 1 day')::date;
   WHEN 'fixed' THEN d1:=(col->>'from')::date;d2:=(col->>'to')::date;
   ELSE RAISE EXCEPTION 'Unsupported report column';
  END CASE;
  IF d1 IS NULL OR d2 IS NULL OR d1>d2 OR d2-d1>3660 THEN RAISE EXCEPTION 'Invalid column period';END IF;
  IF col->>'mode'='calculated' THEN balances:='[]'::jsonb;ELSE
  SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') INTO balances FROM public.ledger_balances(_company_id,d1,d2,true) b;
  END IF;
  cols:=cols||jsonb_build_array(jsonb_build_object('id',col->>'id','from',d1,'to',d2,'balances',balances));
 END LOOP;
 RETURN result||jsonb_build_object('customColumns',cols);
END $$;
REVOKE ALL ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) TO authenticated;
