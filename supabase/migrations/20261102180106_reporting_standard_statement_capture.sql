-- Capture every requested standard-statement period for preview, saved exports and worker attachments.
CREATE FUNCTION public.capture_standard_report_facts(_company_id uuid,_from date,_to date,_report_id text,_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE base jsonb;cfg jsonb:=COALESCE(_settings,'{}');p jsonb;periods jsonb;columns jsonb:='[]';facts jsonb;filtered jsonb;
 grouping text:=COALESCE(_settings->>'group','total');comparison text:=COALESCE(_settings->>'compare','none');cursor date;last_day date;step_months integer;label text;fy date;start_date date;end_date date;count_columns integer:=0;days integer;
BEGIN
 IF _report_id NOT IN ('profit-and-loss','balance-sheet') OR _report_id IS NULL OR _from IS NULL OR _to IS NULL OR _from>_to OR _to-_from>3660 OR jsonb_typeof(cfg)<>'object' OR octet_length(cfg::text)>100000 THEN RAISE EXCEPTION 'Invalid standard statement request';END IF;
 IF grouping NOT IN ('total','month','quarter','year') OR comparison NOT IN ('none','prior_period','prior_year','ytd','prior_ytd','custom') THEN RAISE EXCEPTION 'Unsupported statement comparison or grouping';END IF;
 PERFORM private.validate_report_filters(COALESCE(cfg->'filters','{"logic":"and","clauses":[]}'::jsonb));
 IF _report_id='balance-sheet' AND (COALESCE((cfg->>'incomePercent')::boolean,false) OR jsonb_array_length(COALESCE(cfg->'filters'->'clauses','[]'))>0 OR comparison IN ('ytd','prior_ytd')) THEN RAISE EXCEPTION 'This option applies to Profit and Loss only';END IF;
 base:=public.capture_reporting_facts(_company_id,_from,_to);fy:=(base->>'fyStart')::date;
 periods:=jsonb_build_array(jsonb_build_object('label',CASE WHEN _report_id='balance-sheet' THEN 'As at' ELSE 'Selected period' END,'from',_from,'to',_to));
 IF grouping<>'total' THEN
  cursor:=date_trunc(grouping,_from)::date;step_months:=CASE grouping WHEN 'month' THEN 1 WHEN 'quarter' THEN 3 ELSE 12 END;
  WHILE cursor<=_to LOOP
   count_columns:=count_columns+1;IF count_columns>24 THEN RAISE EXCEPTION 'Choose a shorter period; at most 24 period columns are supported';END IF;
   last_day:=(cursor+make_interval(months=>step_months)-interval '1 day')::date;
   label:=CASE grouping WHEN 'month' THEN to_char(cursor,'Mon YYYY') WHEN 'quarter' THEN 'Q'||extract(quarter from cursor)::integer||' '||extract(year from cursor)::integer ELSE extract(year from cursor)::integer::text END;
   periods:=periods||jsonb_build_array(jsonb_build_object('label',label,'from',GREATEST(cursor,_from),'to',LEAST(last_day,_to)));
   cursor:=(cursor+make_interval(months=>step_months))::date;
  END LOOP;
 END IF;
 IF comparison<>'none' THEN
  CASE comparison
   WHEN 'prior_period' THEN
    IF _report_id='balance-sheet' THEN start_date:=(date_trunc('month',_to)-interval '1 day')::date;end_date:=start_date;
    ELSE days:=_to-_from+1;end_date:=_from-1;start_date:=_from-days;END IF;label:='Previous period';
   WHEN 'prior_year' THEN start_date:=(_from-interval '1 year')::date;end_date:=(_to-interval '1 year')::date;label:='Previous year';
   WHEN 'ytd' THEN start_date:=fy;end_date:=_to;label:='Financial year to date';
   WHEN 'prior_ytd' THEN start_date:=(fy-interval '1 year')::date;end_date:=(_to-interval '1 year')::date;label:='Previous financial year to date';
   WHEN 'custom' THEN
    IF COALESCE(cfg->>'compareFrom','')!~'^\d{4}-\d{2}-\d{2}$' OR COALESCE(cfg->>'compareTo','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose custom comparison dates';END IF;
    start_date:=(cfg->>'compareFrom')::date;end_date:=(cfg->>'compareTo')::date;label:='Custom comparison';
  END CASE;
  IF start_date IS NULL OR end_date IS NULL OR start_date>end_date OR end_date-start_date>3660 THEN RAISE EXCEPTION 'Invalid comparison period';END IF;
  periods:=periods||jsonb_build_array(jsonb_build_object('label',label,'from',start_date,'to',end_date));
 END IF;
 FOR p IN SELECT jsonb_array_elements(periods) LOOP
  start_date:=(p->>'from')::date;end_date:=(p->>'to')::date;
  -- Each BS column has its own fiscal-year earnings split, never a reused current-year split.
  IF _report_id='balance-sheet' THEN
   facts:=public.capture_reporting_facts(_company_id,end_date,end_date);start_date:=(facts->>'fyStart')::date;
  ELSE
   IF start_date=_from AND end_date=_to THEN facts:=base;ELSE facts:=public.capture_reporting_facts(_company_id,start_date,end_date);END IF;
   IF jsonb_array_length(COALESCE(cfg->'filters'->'clauses','[]'))>0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') INTO filtered
    FROM public.report_filtered_balances(_company_id,start_date,end_date,cfg->'filters') b;
    facts:=jsonb_set(facts,'{period}',filtered);
   END IF;
  END IF;
  columns:=columns||jsonb_build_array(jsonb_build_object('label',p->>'label','from',start_date,'to',end_date,'fyStart',facts->'fyStart','period',facts->'period','bsPrior',facts->'bsPrior','bsCurrent',facts->'bsCurrent'));
 END LOOP;
 RETURN base||jsonb_build_object('standardColumns',columns,'appliedFilters',COALESCE(cfg->'filters','{"logic":"and","clauses":[]}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_standard_report_facts(uuid,date,date,text,jsonb) TO authenticated;

-- Persist bounded customization metadata so recent-report links reopen the complete view.
ALTER TABLE public.report_open_events DROP CONSTRAINT report_open_events_search_config_check;
ALTER TABLE public.report_open_events ADD CONSTRAINT report_open_events_search_config_check
 CHECK(jsonb_typeof(search_config)='object' AND octet_length(search_config::text)<=262144);
CREATE OR REPLACE FUNCTION public.record_report_open(_company_id uuid,_report_id text,_view_id uuid,_event_id uuid,_from date,_to date,_search jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted boolean;
BEGIN
 IF _search IS NULL OR jsonb_typeof(_search)<>'object' OR octet_length(_search::text)>262144 THEN RAISE EXCEPTION 'Invalid report activity filters';END IF;
 inserted:=public.record_report_open(_company_id,_report_id,_view_id,_event_id,_from,_to);
 IF inserted THEN UPDATE public.report_open_events SET search_config=_search WHERE id=_event_id AND company_id=_company_id AND user_id=auth.uid();END IF;
 RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.record_report_open(uuid,text,uuid,uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_report_open(uuid,text,uuid,uuid,date,date,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_report_delivery(_company_id uuid, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.report_packs; v public.report_saved_views; facts jsonb; definition jsonb; id uuid; recipient text; recipients jsonb;
BEGIN PERFORM private.assert_reporting_feature(_company_id);
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.export') THEN RAISE EXCEPTION 'Report export permission required' USING ERRCODE='42501'; END IF;
 recipients:=_payload->'recipients';
 IF jsonb_typeof(recipients)<>'array' OR jsonb_array_length(recipients) NOT BETWEEN 1 AND 25 OR length(trim(_payload->>'subject')) NOT BETWEEN 1 AND 200 OR length(COALESCE(_payload->>'message',''))>10000 THEN RAISE EXCEPTION 'Invalid delivery message'; END IF;
 FOR recipient IN SELECT jsonb_array_elements_text(recipients) LOOP IF recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' OR length(recipient)>254 THEN RAISE EXCEPTION 'Invalid recipient address'; END IF;END LOOP;
 IF _payload ? 'packId' THEN
  SELECT * INTO p FROM public.report_packs WHERE report_packs.id=(_payload->>'packId')::uuid AND company_id=_company_id FOR UPDATE;
  IF NOT FOUND OR p.status NOT IN ('published','delivered') OR p.owner_id<>auth.uid() THEN RAISE EXCEPTION 'Only the owner can deliver a published pack' USING ERRCODE='42501'; END IF;
  facts:=p.snapshot;definition:=jsonb_build_object('name',p.name,'config',p.config);
 ELSE
  SELECT * INTO v FROM public.report_saved_views WHERE report_saved_views.id=(_payload->>'viewId')::uuid AND company_id=_company_id;
  IF NOT FOUND OR NOT private.report_access(v.id,false) OR v.user_id<>auth.uid() THEN RAISE EXCEPTION 'Only the report owner can deliver this report' USING ERRCODE='42501'; END IF;
  IF v.report_id NOT IN ('profit-and-loss','balance-sheet','trial-balance','cash-summary','cash-flow-indirect') AND NOT (v.config ? '_builder') THEN RAISE EXCEPTION 'Email export is not supported for this report type'; END IF;
  facts:=CASE WHEN v.config ? '_builder' THEN public.capture_custom_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,v.config->'_builder') WHEN v.config ? 'settings' AND v.report_id IN ('profit-and-loss','balance-sheet') THEN public.capture_standard_report_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date,v.report_id,(v.config->>'settings')::jsonb) ELSE public.capture_reporting_facts(_company_id,(_payload->>'from')::date,(_payload->>'to')::date) END;
  definition:=jsonb_build_object('name',v.name,'reportId',v.report_id,'config',v.config);
 END IF;
 INSERT INTO public.report_deliveries(company_id,owner_id,pack_id,view_id,recipients,subject,message,facts,definition)
 VALUES(_company_id,auth.uid(),p.id,v.id,recipients,trim(_payload->>'subject'),COALESCE(_payload->>'message',''),facts,definition) RETURNING report_deliveries.id INTO id;
 PERFORM public.record_audit_event(_company_id,'report.delivery_queued','report_delivery',id,jsonb_build_object('pack_id',p.id,'view_id',v.id,'recipient_count',jsonb_array_length(recipients)));
 RETURN id;
END $function$

