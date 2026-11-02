-- Retain supported URL filters so recent GL, budget and comparative reports reopen faithfully.
ALTER TABLE public.report_open_events ADD COLUMN search_config jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK(jsonb_typeof(search_config)='object' AND octet_length(search_config::text)<=4000);
-- Keep the original six-argument RPC for older callers. A retry never edits its original context.
CREATE FUNCTION public.record_report_open(_company_id uuid,_report_id text,_view_id uuid,_event_id uuid,_from date,_to date,_search jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted boolean;
BEGIN
 IF _search IS NULL OR jsonb_typeof(_search)<>'object' OR octet_length(_search::text)>4000 THEN RAISE EXCEPTION 'Invalid report activity filters';END IF;
 inserted:=public.record_report_open(_company_id,_report_id,_view_id,_event_id,_from,_to);
 IF inserted THEN
  UPDATE public.report_open_events SET search_config=_search WHERE id=_event_id AND company_id=_company_id AND user_id=auth.uid();
 END IF;
 RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.record_report_open(uuid,text,uuid,uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_report_open(uuid,text,uuid,uuid,date,date,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_report_activity(_company_id uuid) RETURNS jsonb
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
  SELECT l.*,c.opens,jsonb_build_object('key',l.target_key,'reportId',l.report_id,'viewId',l.view_id,'name',l.name,'builder',l.builder,'from',l.from_date,'to',l.to_date,'openedAt',l.opened_at,'opens',c.opens,'search',l.search_config) AS item
  FROM latest l JOIN counts c USING(target_key)
 ) SELECT jsonb_build_object(
  'recent',COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM records ORDER BY opened_at DESC,target_key LIMIT 8) r),'[]'::jsonb),
  'frequent',COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM records ORDER BY opens DESC,opened_at DESC,target_key LIMIT 8) f),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_report_activity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_report_activity(uuid) TO authenticated;
