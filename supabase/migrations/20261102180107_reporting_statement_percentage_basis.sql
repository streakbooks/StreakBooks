-- Support documented income/expense/row and BS asset percentage denominators.
-- Capture every requested standard-statement period for preview, saved exports and worker attachments.
CREATE OR REPLACE FUNCTION public.capture_standard_report_facts(_company_id uuid,_from date,_to date,_report_id text,_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE base jsonb;cfg jsonb:=COALESCE(_settings,'{}');p jsonb;periods jsonb;columns jsonb:='[]';facts jsonb;filtered jsonb;
 grouping text:=COALESCE(_settings->>'group','total');comparison text:=COALESCE(_settings->>'compare','none');cursor date;last_day date;step_months integer;label text;fy date;start_date date;end_date date;count_columns integer:=0;days integer;
BEGIN
 IF _report_id NOT IN ('profit-and-loss','balance-sheet') OR _report_id IS NULL OR _from IS NULL OR _to IS NULL OR _from>_to OR _to-_from>3660 OR jsonb_typeof(cfg)<>'object' OR octet_length(cfg::text)>100000 THEN RAISE EXCEPTION 'Invalid standard statement request';END IF;
 IF grouping NOT IN ('total','month','quarter','year') OR comparison NOT IN ('none','prior_period','prior_year','ytd','prior_ytd','custom') THEN RAISE EXCEPTION 'Unsupported statement comparison or grouping';END IF;
 PERFORM private.validate_report_filters(COALESCE(cfg->'filters','{"logic":"and","clauses":[]}'::jsonb));
 IF _report_id='balance-sheet' AND ((COALESCE((cfg->>'incomePercent')::boolean,false) AND COALESCE(cfg->>'percentBasis','income') NOT IN ('assets','row')) OR jsonb_array_length(COALESCE(cfg->'filters'->'clauses','[]'))>0 OR comparison IN ('ytd','prior_ytd')) THEN RAISE EXCEPTION 'This option applies to Profit and Loss only';END IF;
 IF COALESCE(cfg->>'percentBasis','income') NOT IN ('income','expense','row','assets') OR (_report_id='profit-and-loss' AND COALESCE((cfg->>'incomePercent')::boolean,false) AND cfg->>'percentBasis'='assets') THEN RAISE EXCEPTION 'Unsupported percentage denominator';END IF;
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
