-- Bounded literal predicates on actual posted journal lines; no user SQL or regex execution.
CREATE FUNCTION private.validate_report_filters(_filters jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE clause jsonb;value jsonb;field text;op text;n integer;v text;a text;b text;
BEGIN
 IF jsonb_typeof(_filters) IS DISTINCT FROM 'object' OR jsonb_typeof(_filters->'clauses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid report filter structure';END IF;
 IF COALESCE(_filters->>'logic','') NOT IN ('and','or') OR jsonb_array_length(_filters->'clauses')>30 OR octet_length(_filters::text)>50000 THEN RAISE EXCEPTION 'Report filter limits exceeded';END IF;
 FOR clause IN SELECT jsonb_array_elements(_filters->'clauses') LOOP
  IF jsonb_typeof(clause) IS DISTINCT FROM 'object' OR jsonb_typeof(clause->'values') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid report filter condition';END IF;
  field:=clause->>'field';op:=clause->>'op';n:=jsonb_array_length(clause->'values');
  IF COALESCE(field,'') NOT IN ('account_id','account_code','account_name','account_type','account_group','journal_date','source_type','currency','status','memo','description') AND COALESCE(field,'') NOT IN ('debit','credit') THEN RAISE EXCEPTION 'Unsupported report filter field';END IF;
  IF COALESCE(op,'') NOT IN ('eq','neq','contains','not_contains','starts_with','ends_with','gt','lt','between','empty','not_empty','in','not_in') OR n>100 THEN RAISE EXCEPTION 'Unsupported report filter operator';END IF;
  IF (op IN ('empty','not_empty') AND n<>0) OR (op='between' AND n<>2) OR (op IN ('in','not_in') AND n<1) OR (op NOT IN ('empty','not_empty','between','in','not_in') AND n<>1) THEN RAISE EXCEPTION 'Choose the required report filter values';END IF;
  IF field IN ('debit','credit','journal_date') AND op IN ('contains','not_contains','starts_with','ends_with') THEN RAISE EXCEPTION 'Text operators do not apply to amounts or dates';END IF;
  IF field NOT IN ('debit','credit','journal_date') AND op IN ('gt','lt','between') THEN RAISE EXCEPTION 'Ordered comparisons require an amount or date';END IF;
  IF field IN ('account_id','account_type','account_group','source_type','currency','status') AND op IN ('contains','not_contains','starts_with','ends_with') THEN RAISE EXCEPTION 'Choose record identifiers with equality or selected-value operators';END IF;
  FOR value IN SELECT jsonb_array_elements(clause->'values') LOOP
   IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Filter values must be text';END IF;
   v:=btrim(value#>>'{}');
   IF length(v) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid report filter value length';END IF;
   IF field IN ('debit','credit') AND v !~ '^-?[0-9]{1,18}(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'Use an exact decimal amount without separators';END IF;
   IF field='currency' AND v !~ '^[A-Za-z]{3}$' THEN RAISE EXCEPTION 'Use a three-letter currency code';END IF;
   IF field='account_id' THEN PERFORM v::uuid;END IF;
   IF field='journal_date' THEN
    IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Use real ISO calendar dates';END IF;
    PERFORM v::date;
   END IF;
  END LOOP;
  IF op='between' THEN
   a:=clause->'values'->>0;b:=clause->'values'->>1;
   IF field IN ('debit','credit') THEN
    IF a::numeric>b::numeric THEN RAISE EXCEPTION 'The lower amount must not exceed the upper amount';END IF;
   ELSIF field='journal_date' THEN
    IF a>b THEN RAISE EXCEPTION 'The start date must not follow the end date';END IF;
   END IF;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.validate_report_filters(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.validate_report_filters(jsonb) TO authenticated;
CREATE FUNCTION private.report_filters_match(_attributes jsonb,_filters jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE clause jsonb;field text;op text;actual text;expected text;upper_value text;matched boolean;empty_value boolean;numeric_field boolean;
BEGIN
 IF jsonb_array_length(_filters->'clauses')=0 THEN RETURN true;END IF;
 FOR clause IN SELECT jsonb_array_elements(_filters->'clauses') LOOP
  field:=clause->>'field';op:=clause->>'op';actual:=lower(btrim(_attributes->>field));expected:=lower(btrim(clause->'values'->>0));upper_value:=lower(btrim(clause->'values'->>1));
  empty_value:=actual IS NULL OR actual='';numeric_field:=field IN ('debit','credit');
  IF op='empty' THEN matched:=empty_value;
  ELSIF op='not_empty' THEN matched:=NOT empty_value;
  ELSIF empty_value THEN matched:=false;
  ELSIF numeric_field THEN
   CASE op
    WHEN 'eq' THEN matched:=actual::numeric=expected::numeric;
    WHEN 'neq' THEN matched:=actual::numeric<>expected::numeric;
    WHEN 'gt' THEN matched:=actual::numeric>expected::numeric;
    WHEN 'lt' THEN matched:=actual::numeric<expected::numeric;
    WHEN 'between' THEN matched:=actual::numeric BETWEEN expected::numeric AND upper_value::numeric;
    WHEN 'in' THEN SELECT EXISTS(SELECT 1 FROM jsonb_array_elements_text(clause->'values') v(value) WHERE actual::numeric=v.value::numeric) INTO matched;
    WHEN 'not_in' THEN SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(clause->'values') v(value) WHERE actual::numeric=v.value::numeric) INTO matched;
    ELSE RAISE EXCEPTION 'Unsupported amount predicate';
   END CASE;
  ELSE
   CASE op
    WHEN 'eq' THEN matched:=actual=expected;
    WHEN 'neq' THEN matched:=actual<>expected;
    WHEN 'contains' THEN matched:=strpos(actual,expected)>0;
    WHEN 'not_contains' THEN matched:=strpos(actual,expected)=0;
    WHEN 'starts_with' THEN matched:=left(actual,length(expected))=expected;
    WHEN 'ends_with' THEN matched:=right(actual,length(expected))=expected;
    WHEN 'gt' THEN matched:=actual>expected;
    WHEN 'lt' THEN matched:=actual<expected;
    WHEN 'between' THEN matched:=actual BETWEEN expected AND upper_value;
    WHEN 'in' THEN SELECT EXISTS(SELECT 1 FROM jsonb_array_elements_text(clause->'values') v(value) WHERE actual=lower(btrim(v.value))) INTO matched;
    WHEN 'not_in' THEN SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(clause->'values') v(value) WHERE actual=lower(btrim(v.value))) INTO matched;
    ELSE RAISE EXCEPTION 'Unsupported text predicate';
   END CASE;
  END IF;
  IF _filters->>'logic'='and' AND NOT matched THEN RETURN false;END IF;
  IF _filters->>'logic'='or' AND matched THEN RETURN true;END IF;
 END LOOP;
 RETURN _filters->>'logic'='and';
END $$;
REVOKE ALL ON FUNCTION private.report_filters_match(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.report_filters_match(jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.report_filtered_balances(_company_id uuid,_from date,_to date,_filters jsonb)
RETURNS TABLE(account_id uuid,debit_minor bigint,credit_minor bigint,line_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE base text;decimals integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501';END IF;
 PERFORM private.assert_reporting_feature(_company_id);PERFORM private.validate_report_filters(_filters);
 IF _from IS NULL OR _to IS NULL OR _from>_to OR _to-_from>3660 THEN RAISE EXCEPTION 'Choose a valid reporting period of at most ten years';END IF;
 IF jsonb_array_length(_filters->'clauses')=0 THEN RETURN QUERY SELECT * FROM public.ledger_balances(_company_id,_from,_to,true);RETURN;END IF;
 SELECT c.base_currency,COALESCE(d.decimal_places,2) INTO base,decimals FROM public.companies c LEFT JOIN public.currency_decimals d ON d.code::text=c.base_currency WHERE c.id=_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company access denied' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.journals j WHERE j.company_id=_company_id AND j.status='posted' AND j.journal_date BETWEEN _from AND _to AND (j.currency_code IS NULL OR (j.currency_code::text<>base AND (j.fx_rate_to_base IS NULL OR j.fx_rate_to_base<=0)))) THEN RAISE EXCEPTION 'A posted journal lacks valid currency conversion metadata';END IF;
 RETURN QUERY
 WITH lines AS (
  SELECT l.account_id,public.report_to_base_minor(l.debit_minor,j.currency_code::text,j.fx_rate_to_base,base) AS debit,
   public.report_to_base_minor(l.credit_minor,j.currency_code::text,j.fx_rate_to_base,base) AS credit,
   a.code,a.name,a.account_type::text AS account_type,a.fs_line,j.journal_date,j.source_type::text AS source_type,j.currency_code::text AS currency,j.status::text AS status,j.memo,l.description
  FROM public.journal_lines l JOIN public.journals j ON j.id=l.journal_id AND j.company_id=_company_id
  JOIN public.accounts a ON a.id=l.account_id AND a.company_id=_company_id
  WHERE l.company_id=_company_id AND j.status='posted' AND j.journal_date BETWEEN _from AND _to
    AND NOT (j.source_type='other' AND COALESCE(j.memo,'') LIKE 'Year-end close%')
 ), selected AS (
  SELECT l.* FROM lines l WHERE private.report_filters_match(jsonb_build_object(
   'account_id',l.account_id::text,'account_code',l.code,'account_name',l.name,'account_type',l.account_type,'account_group',l.fs_line,
   'journal_date',to_char(l.journal_date,'YYYY-MM-DD'),'source_type',l.source_type,'currency',l.currency,'status',l.status,'memo',l.memo,'description',l.description,
   'debit',(l.debit::numeric/power(10::numeric,decimals))::text,'credit',(l.credit::numeric/power(10::numeric,decimals))::text
  ),_filters)
 ) SELECT s.account_id,sum(s.debit)::bigint,sum(s.credit)::bigint,count(*) FROM selected s GROUP BY s.account_id;
END $$;
REVOKE ALL ON FUNCTION public.report_filtered_balances(uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_filtered_balances(uuid,date,date,jsonb) TO authenticated;
CREATE FUNCTION public.get_reporting_filter_options(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM private.assert_reporting_feature(_company_id);
 SELECT jsonb_build_object('currencies',COALESCE((SELECT jsonb_agg(currency ORDER BY currency) FROM(
  SELECT c.base_currency AS currency FROM public.companies c WHERE c.id=_company_id
  UNION SELECT c.currency_code::text FROM public.company_currencies c WHERE c.company_id=_company_id
  UNION SELECT j.currency_code::text FROM public.journals j WHERE j.company_id=_company_id AND j.status='posted'
 ) codes WHERE currency IS NOT NULL),'[]'::jsonb),'sources',to_jsonb(enum_range(NULL::public.journal_source_type))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_reporting_filter_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reporting_filter_options(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_custom_report_facts(_company_id uuid,_from date,_to date,_definition jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; cols jsonb:='[]'; col jsonb; d1 date; d2 date; balances jsonb;
BEGIN
 IF jsonb_typeof(_definition)<>'object' OR octet_length(_definition::text)>100000 OR jsonb_typeof(_definition->'columns')<>'array' OR jsonb_array_length(_definition->'columns') NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Invalid custom report definition'; END IF;
 PERFORM private.validate_report_filters(COALESCE(_definition->'filters','{"logic":"and","clauses":[]}'::jsonb));
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
  SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',b.account_id,'debit_minor',b.debit_minor::text,'credit_minor',b.credit_minor::text,'line_count',b.line_count)),'[]') INTO balances FROM public.report_filtered_balances(_company_id,d1,d2,COALESCE(_definition->'filters','{"logic":"and","clauses":[]}'::jsonb)) b;
  END IF;
  cols:=cols||jsonb_build_array(jsonb_build_object('id',col->>'id','from',d1,'to',d2,'balances',balances));
 END LOOP;
 RETURN result||jsonb_build_object('customColumns',cols,'appliedFilters',COALESCE(_definition->'filters','{"logic":"and","clauses":[]}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.capture_custom_report_facts(uuid,date,date,jsonb) TO authenticated;
