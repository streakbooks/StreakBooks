-- The reporting suite remains included; no existing plan version or charge changes.
INSERT INTO public.billing_features(key,label,description,category,module,metering,cost_tag,catalogue_status,default_enabled)
VALUES('reporting','Reporting ecosystem','Custom financial reports, management analysis, review packs and scheduled reporting.','module','reporting','none',NULL,'live',true)
ON CONFLICT(key) DO NOTHING;
INSERT INTO public.feature_dependencies(feature_key,other_key,kind) VALUES('reporting','accounting','requires'),('reporting','budgeting','optional') ON CONFLICT DO NOTHING;
INSERT INTO public.feature_prices(feature_key,model,amount_minor,currency,billing_interval,status,reason)
SELECT 'reporting','included',0,c.currency,i.period,'live','Reporting is included with no incremental charge; preserve existing availability.'
FROM (VALUES('USD'),('GBP'),('AUD'),('NZD'),('INR')) c(currency) CROSS JOIN (VALUES('month'),('year')) i(period)
WHERE NOT EXISTS(SELECT 1 FROM public.feature_prices p WHERE p.feature_key='reporting' AND p.currency=c.currency AND p.billing_interval=i.period AND p.status='live');
INSERT INTO public.platform_audit(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
VALUES(auth.uid(),'reporting.catalogue_registered','feature','reporting',NULL,jsonb_build_object('feature','reporting','model','included','amountMinor',0,'migrationActor',current_user),'Register the reporting suite in the existing catalogue and enforce authoritative entitlements.');

CREATE FUNCTION private.reporting_feature_decision(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE decisions jsonb; decision jsonb; dependency text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN
  RETURN jsonb_build_object('allowed',false,'source','authorization','scope','business','reason','Reporting permission is required.');
 END IF;
 decisions:=public.winning_entitlements(_company_id,auth.uid());
 decision:=COALESCE(decisions->'reporting',jsonb_build_object('allowed',false,'source','default','scope','global','reason','Reporting is not configured.'));
 IF decision->>'allowed' IS DISTINCT FROM 'true' THEN RETURN decision;END IF;
 FOR dependency IN WITH RECURSIVE required(key) AS (
  SELECT other_key FROM public.feature_dependencies WHERE feature_key='reporting' AND kind='requires'
  UNION SELECT d.other_key FROM public.feature_dependencies d JOIN required r ON d.feature_key=r.key WHERE d.kind='requires'
 ) SELECT key FROM required LOOP
  IF decisions->dependency->>'allowed' IS DISTINCT FROM 'true' THEN
   RETURN COALESCE(decisions->dependency,'{}'::jsonb)||jsonb_build_object('allowed',false,'dependency',dependency,'reason','Required feature '||dependency||' is unavailable: '||COALESCE(decisions->dependency->>'reason','No entitlement.'));
  END IF;
 END LOOP;
 RETURN decision;
END $$;
REVOKE ALL ON FUNCTION private.reporting_feature_decision(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.reporting_feature_decision(uuid) TO authenticated,service_role;
CREATE FUNCTION public.get_reporting_feature_access(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id,'reports.view') THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501';END IF;
 RETURN private.reporting_feature_decision(_company_id);
END $$;
REVOKE ALL ON FUNCTION public.get_reporting_feature_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reporting_feature_access(uuid) TO authenticated;
CREATE FUNCTION private.assert_reporting_feature(_company_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE decision jsonb:=private.reporting_feature_decision(_company_id);
BEGIN
 IF decision->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Reporting is unavailable (%): %',COALESCE(decision->>'source','default'),decision->>'reason' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION private.assert_reporting_feature(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.assert_reporting_feature(uuid) TO authenticated,service_role;
CREATE FUNCTION private.reporting_feature_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.assert_reporting_feature(COALESCE(NEW.company_id,OLD.company_id));
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION private.reporting_feature_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reporting_feature_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_saved_views FOR EACH ROW EXECUTE FUNCTION private.reporting_feature_write_guard();
CREATE TRIGGER reporting_feature_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_models FOR EACH ROW EXECUTE FUNCTION private.reporting_feature_write_guard();
CREATE TRIGGER reporting_feature_write_guard BEFORE INSERT ON public.report_comments FOR EACH ROW EXECUTE FUNCTION private.reporting_feature_write_guard();
-- Protect privileged RPCs as well as direct RLS writes. Revoking sharing / disabling schedules stays available.
DO $$ DECLARE signature text; definition text; guard text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.capture_reporting_facts(uuid,date,date)','public.save_report_pack(uuid,jsonb)','public.queue_report_delivery(uuid,jsonb)','public.save_report_schedule(uuid,jsonb)','public.transition_report_pack(uuid,integer,text,text)','public.set_report_access(uuid,text,jsonb,uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  guard:='PERFORM private.assert_reporting_feature(_company_id);';
  IF signature LIKE 'public.transition%' THEN guard:='PERFORM private.assert_reporting_feature((SELECT company_id FROM public.report_packs WHERE id=_id));';END IF;
  IF signature LIKE 'public.set_report%' THEN guard:='IF _level<>''private'' THEN PERFORM private.assert_reporting_feature((SELECT company_id FROM public.report_saved_views WHERE id=_view_id));END IF;';END IF;
  definition:=regexp_replace(definition,'BEGIN','BEGIN '||guard);
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.claim_report_deliveries(integer)'::regprocedure);
 definition:=replace(definition,'IF NOT public.has_company_permission(j.company_id,''reports.export'')','IF private.reporting_feature_decision(j.company_id)->>''allowed'' IS DISTINCT FROM ''true'' OR NOT public.has_company_permission(j.company_id,''reports.export'')');
 EXECUTE definition;
END $$;
