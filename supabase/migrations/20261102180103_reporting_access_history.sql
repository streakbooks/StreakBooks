-- User-owned navigation metadata. This never stores report balances or changes the ledger.
CREATE TABLE public.report_open_events(
 id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 report_id text NOT NULL CHECK(report_id ~ '^[a-z][a-z0-9-]{0,63}$'),
 view_id uuid REFERENCES public.report_saved_views(id) ON DELETE CASCADE,
 from_date date NOT NULL,to_date date NOT NULL CHECK(to_date>=from_date),opened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX report_open_events_user_company_idx ON public.report_open_events(user_id,company_id,opened_at DESC);
CREATE INDEX report_open_events_company_idx ON public.report_open_events(company_id);
CREATE INDEX report_open_events_view_idx ON public.report_open_events(view_id);
ALTER TABLE public.report_open_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_open_events_owner ON public.report_open_events FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.view'));
CREATE POLICY mfa_aal2_required ON public.report_open_events AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT private.mfa_requirement_met())) WITH CHECK((SELECT private.mfa_requirement_met()));
REVOKE ALL ON public.report_open_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.report_open_events TO authenticated;
CREATE FUNCTION public.record_report_open(_company_id uuid,_report_id text,_view_id uuid,_event_id uuid,_from date,_to date)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actual_id text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501';END IF;
 IF private.reporting_feature_decision(_company_id)->>'allowed' IS DISTINCT FROM 'true' THEN RETURN false;END IF;
 IF _event_id IS NULL OR _from IS NULL OR _to IS NULL OR _from>_to OR _report_id IS NULL OR _report_id !~ '^[a-z][a-z0-9-]{0,63}$' THEN RAISE EXCEPTION 'Invalid report activity';END IF;
 IF _view_id IS NOT NULL THEN
  SELECT report_id INTO actual_id FROM public.report_saved_views WHERE id=_view_id AND company_id=_company_id;
  IF NOT FOUND OR NOT private.report_access(_view_id,false) OR actual_id<>_report_id THEN RAISE EXCEPTION 'Saved report access denied' USING ERRCODE='42501';END IF;
 END IF;
 INSERT INTO public.report_open_events(id,company_id,user_id,report_id,view_id,from_date,to_date)
 VALUES(_event_id,_company_id,auth.uid(),_report_id,_view_id,_from,_to) ON CONFLICT(id) DO NOTHING;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.record_report_open(uuid,text,uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_report_open(uuid,text,uuid,uuid,date,date) TO authenticated;
CREATE FUNCTION public.get_report_activity(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501';END IF;
 WITH visible AS (
  SELECT e.*,COALESCE(e.view_id::text,e.report_id) AS target_key,v.name,COALESCE(v.config ? '_builder',false) AS builder
  FROM public.report_open_events e LEFT JOIN public.report_saved_views v ON v.id=e.view_id AND v.company_id=e.company_id
  WHERE e.company_id=_company_id AND e.user_id=auth.uid() AND (e.view_id IS NULL OR v.id IS NOT NULL)
 ), counts AS (SELECT target_key,count(*) AS opens FROM visible GROUP BY target_key), latest AS (
  SELECT DISTINCT ON(target_key) * FROM visible ORDER BY target_key,opened_at DESC,id DESC
 ), records AS (
  SELECT l.*,c.opens,jsonb_build_object('key',l.target_key,'reportId',l.report_id,'viewId',l.view_id,'name',l.name,'builder',l.builder,'from',l.from_date,'to',l.to_date,'openedAt',l.opened_at,'opens',c.opens) AS item
  FROM latest l JOIN counts c USING(target_key)
 ) SELECT jsonb_build_object(
  'recent',COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM records ORDER BY opened_at DESC,target_key LIMIT 8) r),'[]'::jsonb),
  'frequent',COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM records ORDER BY opens DESC,opened_at DESC,target_key LIMIT 8) f),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_report_activity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_report_activity(uuid) TO authenticated;
