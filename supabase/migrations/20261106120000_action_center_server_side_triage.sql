-- Smart Action Center: server-side history, priority sorting and complete workload counts.
-- PostgreSQL 15+ security_invoker preserves the existing recipient/company/permission RLS.
-- No financial document, journal or notification state is changed.

CREATE OR REPLACE VIEW public.action_notification_inbox
WITH (security_invoker = true)
AS
SELECT
  id, company_id, title, body, category, priority, target_path,
  entity_type, entity_id, created_at, read_at, archived_at, resolved_at,
  CASE priority
    WHEN 'critical' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    ELSE 3
  END AS priority_rank,
  pg_catalog.lower(title || ' ' || coalesce(body, '')) AS search_text
FROM public.action_notifications;

REVOKE ALL ON public.action_notification_inbox FROM PUBLIC, anon;
GRANT SELECT ON public.action_notification_inbox TO authenticated;
GRANT SELECT ON public.action_notification_inbox TO service_role;

COMMENT ON VIEW public.action_notification_inbox IS
  'RLS-invoker projection for server-filtered notifications, with sortable urgency and searchable text.';

CREATE OR REPLACE FUNCTION public.action_notification_workload(_company_id uuid)
RETURNS TABLE(
  action_count bigint,
  unread_count bigint,
  critical_count bigint,
  completed_count bigint,
  archived_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT
    count(*) FILTER (WHERE n.archived_at IS NULL AND n.resolved_at IS NULL),
    count(*) FILTER (WHERE n.archived_at IS NULL AND n.resolved_at IS NULL AND n.read_at IS NULL),
    count(*) FILTER (WHERE n.archived_at IS NULL AND n.resolved_at IS NULL AND n.priority = 'critical'),
    count(*) FILTER (WHERE n.archived_at IS NULL AND n.resolved_at IS NOT NULL),
    count(*) FILTER (WHERE n.archived_at IS NOT NULL)
  FROM public.action_notifications AS n
  WHERE n.company_id = _company_id
    AND n.recipient_user_id = (select auth.uid())
    AND public.is_company_member(_company_id);
$function$;

REVOKE ALL ON FUNCTION public.action_notification_workload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.action_notification_workload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.action_notification_workload(uuid) TO service_role;

COMMENT ON FUNCTION public.action_notification_workload(uuid) IS
  'Recipient-scoped complete Action Center counts. Runs as invoker and respects notification row level security and preferences.';

CREATE INDEX IF NOT EXISTS action_notifications_history_order_idx
  ON public.action_notifications (recipient_user_id, company_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS action_notifications_priority_order_idx
  ON public.action_notifications (
    recipient_user_id, company_id,
    (CASE priority
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END),
    created_at DESC, id DESC
  )
  WHERE archived_at IS NULL AND resolved_at IS NULL;
