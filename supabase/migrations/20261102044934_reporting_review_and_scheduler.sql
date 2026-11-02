-- Review corrections and verifiable database scheduling. No recipient is contacted by migration.
CREATE TABLE public.report_model_versions(
 model_id uuid NOT NULL REFERENCES public.report_models(id) ON DELETE CASCADE,version integer NOT NULL,
 config jsonb NOT NULL,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(model_id,version)
);
ALTER TABLE public.report_model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_model_versions_read ON public.report_model_versions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.report_models m WHERE m.id=model_id AND m.owner_id=auth.uid() AND public.has_company_permission(m.company_id,'reports.view')));
GRANT SELECT ON public.report_model_versions TO authenticated;
CREATE FUNCTION private.report_model_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(COALESCE(NEW.company_id,OLD.company_id),'reports.view') THEN RAISE EXCEPTION 'Report model access denied' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.company_id<>OLD.company_id OR NEW.kind<>OLD.kind OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Model identity is immutable';END IF;
  INSERT INTO public.report_model_versions(model_id,version,config,name,created_by) VALUES(OLD.id,OLD.version,OLD.config,OLD.name,auth.uid());
  NEW.version:=OLD.version+1;
 END IF;
 IF TG_OP<>'DELETE' THEN NEW.updated_at:=clock_timestamp();END IF;
 PERFORM public.record_audit_event(COALESCE(NEW.company_id,OLD.company_id),'report.model_'||lower(TG_OP),'report_model',COALESCE(NEW.id,OLD.id),jsonb_build_object('kind',COALESCE(NEW.kind,OLD.kind)));
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER report_model_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_models FOR EACH ROW EXECUTE FUNCTION private.report_model_guard();
REVOKE ALL ON FUNCTION private.report_model_guard() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reporting_worker_token_valid(_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT length(_token)=64 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='linkbooks_reporting_worker_token' AND extensions.digest(decrypted_secret,'sha256')=extensions.digest(_token,'sha256'));
$$;
REVOKE ALL ON FUNCTION public.reporting_worker_token_valid(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reporting_worker_token_valid(text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='linkbooks_reporting_worker_token') THEN
  PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'linkbooks_reporting_worker_token','Internal report worker authentication; generated server-side; never returned to clients');
 END IF;
END $$;
CREATE FUNCTION private.dispatch_report_worker() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text;request_id bigint;
BEGIN
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='linkbooks_reporting_worker_token';
 IF token IS NULL THEN RETURN NULL;END IF;
 SELECT net.http_post(url:='https://ipxflpzfcqwtenodbxwc.supabase.co/functions/v1/reporting-worker',headers:=jsonb_build_object('Content-Type','application/json','x-report-worker-token',token),body:='{"operation":"process"}',timeout_milliseconds:=55000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION private.dispatch_report_worker() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('linkbooks-report-outbox','* * * * *',$job$SELECT public.enqueue_due_report_schedules(now()); SELECT private.dispatch_report_worker();$job$);

CREATE TABLE private.reporting_worker_state(id boolean PRIMARY KEY DEFAULT true CHECK(id),provider_configured boolean NOT NULL,last_seen timestamptz NOT NULL,from_address text);
REVOKE ALL ON private.reporting_worker_state FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.reporting_worker_heartbeat(_configured boolean,_from text DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO private.reporting_worker_state(id,provider_configured,last_seen,from_address) VALUES(true,_configured,now(),left(_from,254)) ON CONFLICT(id) DO UPDATE SET provider_configured=EXCLUDED.provider_configured,last_seen=EXCLUDED.last_seen,from_address=EXCLUDED.from_address;
$$;
REVOKE ALL ON FUNCTION public.reporting_worker_heartbeat(boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reporting_worker_heartbeat(boolean,text) TO service_role;
CREATE FUNCTION public.get_reporting_delivery_status(_company_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.has_company_permission(_company_id,'reports.export') THEN RAISE EXCEPTION 'Report export permission required' USING ERRCODE='42501';END IF;
 RETURN COALESCE((SELECT jsonb_build_object('configured',provider_configured AND last_seen>now()-interval '10 minutes','lastSeen',last_seen,'sender',from_address) FROM private.reporting_worker_state WHERE id),' {"configured":false}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_reporting_delivery_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reporting_delivery_status(uuid) TO authenticated;
