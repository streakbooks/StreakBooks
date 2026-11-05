-- Contact follow-up reminders in the existing Smart Action Center.
-- This migration does NOT send email or push messages.
-- Alerts are opt-in per user and organisation; a daily cron also runs when users are offline.

ALTER TABLE public.action_notifications
  DROP CONSTRAINT IF EXISTS action_notifications_category_check;
ALTER TABLE public.action_notifications
  ADD CONSTRAINT action_notifications_category_check
  CHECK (category = ANY (ARRAY[
    'bill_approval','overdue_invoice','bank_reconciliation','document_request',
    'system','contact_followup'
  ]));

ALTER TABLE public.action_notification_preferences
  DROP CONSTRAINT IF EXISTS action_notification_preferences_category_check;
ALTER TABLE public.action_notification_preferences
  ADD CONSTRAINT action_notification_preferences_category_check
  CHECK (category = ANY (ARRAY[
    'bill_approval','overdue_invoice','bank_reconciliation','document_request',
    'contact_followup'
  ]));

-- Preserve every existing category's permissions. Contact reminders are visible
-- only to current members, and only to each alert's existing recipient under RLS.
CREATE OR REPLACE FUNCTION public.can_read_action_notification(
  _company_id uuid, _category text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RETURN false;
  END IF;
  RETURN CASE _category
    WHEN 'bill_approval' THEN public.has_company_permission(_company_id,'purchases.authorise')
    WHEN 'overdue_invoice' THEN public.has_company_permission(_company_id,'sales.view')
    WHEN 'bank_reconciliation' THEN public.has_company_permission(_company_id,'banking.view')
    WHEN 'document_request' THEN public.can_access_attachment(_company_id,'company','view')
    WHEN 'contact_followup' THEN true
    WHEN 'system' THEN true
    ELSE false
  END;
END;
$function$;

-- Only server-owned helpers may insert in the inbox. This function cannot be
-- invoked directly from the client. The unique event key makes it idempotent.
CREATE OR REPLACE FUNCTION private.sync_contact_followups(
  _company_id uuid, _recipient_user_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _inserted integer := 0;
  _resolved integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('contact-followup:' || _company_id::text || ':' || _recipient_user_id::text)
  );

  INSERT INTO public.action_notifications (
    company_id, recipient_user_id, event_key, category, priority,
    title, body, entity_type, entity_id, target_path
  )
  SELECT
    t.company_id, t.assigned_to, 'contact_followup:' || t.id::text,
    'contact_followup',
    CASE WHEN t.due_on < local_time.today THEN 'high'
         WHEN t.due_on = local_time.today THEN 'medium'
         ELSE 'low' END,
    pg_catalog.left('Contact follow-up: ' || t.title, 180),
    'You have an open contact follow-up task. Review it in the contact timeline.',
    'contact_interaction', t.id,
    '/contacts/' || t.contact_id::text || '?tab=timeline'
  FROM public.contact_interactions t
  JOIN public.companies c ON c.id = t.company_id
  JOIN public.company_members m
    ON m.company_id = t.company_id
   AND m.user_id = t.assigned_to
   AND m.status = 'active'
  JOIN public.action_notification_preferences p
    ON p.company_id = t.company_id
   AND p.recipient_user_id = t.assigned_to
   AND p.category = 'contact_followup'
   AND p.enabled IS TRUE
  CROSS JOIN LATERAL (
    SELECT (pg_catalog.now() AT TIME ZONE
      coalesce(nullif(c.timezone,''),'UTC'))::date AS today
  ) local_time
  WHERE t.company_id = _company_id
    AND t.assigned_to = _recipient_user_id
    AND t.kind = 'task'
    AND t.completed_at IS NULL
    AND (
      (t.remind_on IS NOT NULL AND t.remind_on <= local_time.today)
      OR (t.due_on IS NOT NULL AND t.due_on <= local_time.today + 7)
    )
  ON CONFLICT (company_id, recipient_user_id, event_key)
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    priority = EXCLUDED.priority,
    target_path = EXCLUDED.target_path,
    resolved_at = NULL
  WHERE public.action_notifications.resolved_at IS NOT NULL
     OR public.action_notifications.title IS DISTINCT FROM EXCLUDED.title
     OR public.action_notifications.priority IS DISTINCT FROM EXCLUDED.priority
     OR public.action_notifications.target_path IS DISTINCT FROM EXCLUDED.target_path;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  -- Reassignment, completion, opt-out and membership revocation all resolve
  -- old alerts, without removing the user's history or changing read/archive.
  UPDATE public.action_notifications n
  SET resolved_at = pg_catalog.now()
  WHERE n.company_id = _company_id
    AND n.recipient_user_id = _recipient_user_id
    AND n.category = 'contact_followup'
    AND n.resolved_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.contact_interactions t
      JOIN public.companies c ON c.id = t.company_id
      JOIN public.company_members m
        ON m.company_id = t.company_id
       AND m.user_id = t.assigned_to
       AND m.status = 'active'
      JOIN public.action_notification_preferences p
        ON p.company_id = t.company_id
       AND p.recipient_user_id = t.assigned_to
       AND p.category = 'contact_followup'
       AND p.enabled IS TRUE
      WHERE t.company_id = _company_id
        AND t.id = n.entity_id
        AND t.kind = 'task'
        AND t.assigned_to = _recipient_user_id
        AND t.completed_at IS NULL
        AND (
          (t.remind_on IS NOT NULL AND
           t.remind_on <= (pg_catalog.now() AT TIME ZONE
            coalesce(nullif(c.timezone,''),'UTC'))::date)
          OR (t.due_on IS NOT NULL AND
           t.due_on <= (pg_catalog.now() AT TIME ZONE
            coalesce(nullif(c.timezone,''),'UTC'))::date + 7)
        )
    );
  GET DIAGNOSTICS _resolved = ROW_COUNT;
  RETURN _inserted + _resolved;
END;
$function$;
REVOKE ALL ON FUNCTION private.sync_contact_followups(uuid,uuid)
  FROM PUBLIC, anon, authenticated;

-- Immediate self-only refresh when the user opens the Action Center.
CREATE OR REPLACE FUNCTION public.refresh_my_contact_followups(
  _company_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You are not an active member of this organisation';
  END IF;
  RETURN private.sync_contact_followups(_company_id, _uid);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_my_contact_followups(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_my_contact_followups(uuid) TO authenticated;

-- Offline scheduled delivery: daily server-side materialisation in the
-- Action Center, not email/push transport. Never invent a recipient: only
-- explicit opt-in preferences and existing alert owners are scanned.
CREATE OR REPLACE FUNCTION private.refresh_scheduled_contact_followups()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  item record;
  total integer := 0;
BEGIN
  FOR item IN
    SELECT DISTINCT pair.company_id, pair.recipient_user_id
    FROM (
      SELECT p.company_id, p.recipient_user_id
      FROM public.action_notification_preferences p
      WHERE p.category = 'contact_followup' AND p.enabled IS TRUE
      UNION
      SELECT n.company_id, n.recipient_user_id
      FROM public.action_notifications n
      WHERE n.category = 'contact_followup' AND n.resolved_at IS NULL
    ) pair
  LOOP
    total := total + private.sync_contact_followups(
      item.company_id, item.recipient_user_id
    );
  END LOOP;
  RETURN total;
END;
$function$;
REVOKE ALL ON FUNCTION private.refresh_scheduled_contact_followups()
  FROM PUBLIC, anon, authenticated;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'linkbooks-contact-followup-action-center'
  ) THEN
    PERFORM cron.schedule(
      'linkbooks-contact-followup-action-center',
      '10 0 * * *',
      'SELECT private.refresh_scheduled_contact_followups();'
    );
  END IF;
END;
$block$;
