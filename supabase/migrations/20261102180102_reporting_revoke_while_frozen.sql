-- Revocation narrows access and must remain possible while new reporting work is frozen.
CREATE OR REPLACE FUNCTION private.reporting_feature_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='report_saved_views' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.access_level='private' AND NEW.firm_id IS NULL
    AND (to_jsonb(NEW)-ARRAY['access_level','firm_id','modified_by','updated_at','version'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['access_level','firm_id','modified_by','updated_at','version']) THEN
    RETURN NEW;
   END IF;
  END IF;
 END IF;
 PERFORM private.assert_reporting_feature(COALESCE(NEW.company_id,OLD.company_id));
 RETURN COALESCE(NEW,OLD);
END $$;
