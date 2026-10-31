-- Final permission hardening: reading and acknowledgement must use identical access rules.
-- Prevents changing alerts that have become inaccessible after role changes or user preferences.
CREATE OR REPLACE FUNCTION public.set_action_notification_state(
 _notification_id uuid, _mark_read boolean DEFAULT NULL, _archive boolean DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _changed integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 UPDATE public.action_notifications n
 SET read_at = CASE
       WHEN _mark_read IS TRUE THEN coalesce(n.read_at,now())
       WHEN _mark_read IS FALSE THEN NULL ELSE n.read_at END,
     archived_at = CASE
       WHEN _archive IS TRUE THEN coalesce(n.archived_at,now())
       WHEN _archive IS FALSE THEN NULL ELSE n.archived_at END
 WHERE n.id=_notification_id
   AND n.recipient_user_id=auth.uid()
   AND public.can_read_action_notification(n.company_id,n.category)
   AND (
     n.priority='critical' OR n.category='system'
     OR coalesce((SELECT p.enabled FROM public.action_notification_preferences p
          WHERE p.company_id=n.company_id AND p.recipient_user_id=auth.uid()
                AND p.category=n.category),true)
   );
 GET DIAGNOSTICS _changed=ROW_COUNT;
 RETURN _changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) TO authenticated;

-- Keep notification preferences from disabling critical or security alerts at query time.
COMMENT ON FUNCTION public.set_action_notification_state(uuid,boolean,boolean) IS
 'Only the authorised recipient can acknowledge/archive an alert visible under current RLS and preferences; financial source objects are unchanged.';
