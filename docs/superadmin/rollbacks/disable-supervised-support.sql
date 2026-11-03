-- Reviewed operator rollback, NOT a migration and NOT executed by this task.
-- Disable access and requests without erasing grants, decisions or audit history.
-- Run with migration privileges after identifying the change in the incident record.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.platform_request_break_glass(uuid,text,timestamptz,uuid),
  private.request_supervised_support(uuid,text,timestamptz,uuid),
  public.platform_support_read(uuid),private.platform_support_read(uuid) FROM authenticated;
-- Makes the version probe unavailable; UI hides new requests after schema cache refresh.
DROP FUNCTION public.platform_supervised_support_list();
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Existing approvals/revocations remain inspectable. Never remove the approval trigger,
-- restore the unguarded legacy grant function, delete audit rows, or drop retained data.
-- Recovery: a reviewed forward migration must restore these EXECUTE grants and recreate
-- ONLY the public list wrapper from 20261103000000 (not replay that whole ALTER migration).
