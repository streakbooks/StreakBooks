-- Emergency feature disable; retain every case, note, member association and audit event.
-- Revert the Operations UI first. Re-enable only after reviewing the deployment/migration.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('platform_ops_context','platform_ops_list','platform_ops_detail','platform_ops_lookup','platform_ops_members','platform_ops_member_preview','platform_ops_apply') LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
