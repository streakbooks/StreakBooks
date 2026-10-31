-- Per-user, per-company preference for OPTIONAL in-app accounting alerts.
-- Critical accounting risk and system/security alerts always remain visible.
CREATE TABLE IF NOT EXISTS public.action_notification_preferences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('bill_approval','overdue_invoice','bank_reconciliation','document_request')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,recipient_user_id,category)
);
ALTER TABLE public.action_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_notification_preferences_owner ON public.action_notification_preferences;
CREATE POLICY action_notification_preferences_owner ON public.action_notification_preferences
 FOR ALL TO authenticated
 USING (recipient_user_id=(select auth.uid()) AND public.is_company_member(company_id))
 WITH CHECK (recipient_user_id=(select auth.uid()) AND public.is_company_member(company_id));
REVOKE ALL ON public.action_notification_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.action_notification_preferences TO authenticated;
GRANT ALL ON public.action_notification_preferences TO service_role;

DROP POLICY IF EXISTS action_notifications_read ON public.action_notifications;
CREATE POLICY action_notifications_read ON public.action_notifications
 FOR SELECT TO authenticated USING (
   recipient_user_id=(select auth.uid()) AND public.can_read_action_notification(company_id,category)
   AND (
     priority='critical' OR category='system' OR
     coalesce((SELECT p.enabled FROM public.action_notification_preferences p
       WHERE p.company_id=action_notifications.company_id
         AND p.recipient_user_id=(select auth.uid()) AND p.category=action_notifications.category
     ), true)
   )
 );
