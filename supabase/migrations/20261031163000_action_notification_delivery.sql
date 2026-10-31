-- Notification delivery and document request lifecycle event hook.
GRANT SELECT (resolved_at,entity_id,event_key,action_kind) ON public.action_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_document_request_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   INSERT INTO public.action_notifications
     (company_id,recipient_user_id,event_key,category,priority,title,body,entity_type,entity_id,target_path)
   VALUES (
     NEW.company_id,NEW.requested_from,'document_request:'||NEW.id::text,
     'document_request','medium',left('Document requested: '||NEW.subject,180),
     NEW.instructions,'action_document_request',NEW.id,'/files')
   ON CONFLICT (company_id,recipient_user_id,event_key) DO NOTHING;
 ELSIF NEW.completed_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
   UPDATE public.action_notifications SET resolved_at=coalesce(NEW.completed_at,NEW.cancelled_at)
   WHERE company_id=NEW.company_id AND recipient_user_id=NEW.requested_from
     AND event_key='document_request:'||NEW.id::text AND resolved_at IS NULL;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_document_request_lifecycle() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS action_document_request_notify ON public.action_document_requests;
CREATE TRIGGER action_document_request_notify
AFTER INSERT OR UPDATE OF completed_at,cancelled_at ON public.action_document_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_document_request_lifecycle();

-- Postgres Changes is used for lightweight inbox refresh signals, with row-level security.
-- On platforms without a supabase_realtime publication the polling fallback remains operational.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
   AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public'
        AND tablename='action_notifications'
   ) THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.action_notifications;
 END IF;
END $$;
