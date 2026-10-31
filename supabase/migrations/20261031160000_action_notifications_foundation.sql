-- Smart Action Center: additive notification foundation.
-- Recipient-scoped notifications, deduplication and durable read/archive state.
CREATE TABLE IF NOT EXISTS public.action_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('bill_approval','overdue_invoice','bank_reconciliation','document_request','system')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  body text NOT NULL DEFAULT '',
  entity_type text,
  entity_id uuid,
  target_path text,
  action_kind text NOT NULL DEFAULT 'review' CHECK (action_kind IN ('review','open')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT action_notifications_event_key_nonempty CHECK (length(event_key) BETWEEN 1 AND 240),
  CONSTRAINT action_notifications_target_path_safe CHECK (target_path IS NULL OR target_path ~ '^/[a-zA-Z0-9/_?=&.%-]*$'),
  CONSTRAINT action_notifications_unique_event UNIQUE (company_id, recipient_user_id, event_key)
);
CREATE INDEX IF NOT EXISTS action_notifications_inbox_idx
 ON public.action_notifications (recipient_user_id, company_id, created_at DESC)
 WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS action_notifications_unread_idx
 ON public.action_notifications (recipient_user_id, company_id, created_at DESC)
 WHERE read_at IS NULL AND archived_at IS NULL;
ALTER TABLE public.action_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_notifications_read ON public.action_notifications;
CREATE POLICY action_notifications_read ON public.action_notifications
 FOR SELECT TO authenticated
 USING (recipient_user_id = auth.uid() AND public.is_company_member(company_id));
REVOKE ALL ON public.action_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.action_notifications TO authenticated;
GRANT ALL ON public.action_notifications TO service_role;

-- Only a recipient can change their own read/archive state.
-- Acknowledging a notification NEVER approves or posts a financial document.
CREATE OR REPLACE FUNCTION public.set_action_notification_state(
  _notification_id uuid,
  _mark_read boolean DEFAULT NULL,
  _archive boolean DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _changed integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.action_notifications n
  SET read_at = CASE WHEN _mark_read IS TRUE THEN COALESCE(n.read_at, now())
                     WHEN _mark_read IS FALSE THEN NULL ELSE n.read_at END,
      archived_at = CASE WHEN _archive IS TRUE THEN COALESCE(n.archived_at, now())
                         WHEN _archive IS FALSE THEN NULL ELSE n.archived_at END
  WHERE n.id = _notification_id
    AND n.recipient_user_id = auth.uid()
    AND public.is_company_member(n.company_id);
  GET DIAGNOSTICS _changed = ROW_COUNT;
  RETURN _changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) TO authenticated;

COMMENT ON TABLE public.action_notifications IS
 'Durable recipient-specific action alerts. Insertion is restricted to trusted server-side event producers; notification state never changes accounting records.';
),
  CONSTRAINT action_notifications_unique_event UNIQUE (company_id, recipient_user_id, event_key)
);
CREATE INDEX IF NOT EXISTS action_notifications_inbox_idx
 ON public.action_notifications (recipient_user_id, company_id, created_at DESC)
 WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS action_notifications_unread_idx
 ON public.action_notifications (recipient_user_id, company_id, created_at DESC)
 WHERE read_at IS NULL AND archived_at IS NULL;
ALTER TABLE public.action_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_notifications_read ON public.action_notifications;
CREATE POLICY action_notifications_read ON public.action_notifications
 FOR SELECT TO authenticated
 USING (recipient_user_id = auth.uid() AND public.is_company_member(company_id));
REVOKE ALL ON public.action_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.action_notifications TO authenticated;
GRANT ALL ON public.action_notifications TO service_role;

-- Only a recipient can change their own read/archive state.
-- Acknowledging a notification NEVER approves or posts a financial document.
CREATE OR REPLACE FUNCTION public.set_action_notification_state(
  _notification_id uuid,
  _mark_read boolean DEFAULT NULL,
  _archive boolean DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _changed integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.action_notifications n
  SET read_at = CASE WHEN _mark_read IS TRUE THEN COALESCE(n.read_at, now())
                     WHEN _mark_read IS FALSE THEN NULL ELSE n.read_at END,
      archived_at = CASE WHEN _archive IS TRUE THEN COALESCE(n.archived_at, now())
                         WHEN _archive IS FALSE THEN NULL ELSE n.archived_at END
  WHERE n.id = _notification_id
    AND n.recipient_user_id = auth.uid()
    AND public.is_company_member(n.company_id);
  GET DIAGNOSTICS _changed = ROW_COUNT;
  RETURN _changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) TO authenticated;

COMMENT ON TABLE public.action_notifications IS
 'Durable recipient-specific action alerts. Insertion is restricted to trusted server-side event producers; notification state never changes accounting records.';
