-- Trusted producer API. Only service_role may publish; browser clients cannot forge alerts.
-- Event key must identify a specific source event/version, not just an entity ID.
CREATE OR REPLACE FUNCTION public.publish_action_notification(
  _company_id uuid, _recipient_user_id uuid, _event_key text,
  _category text, _priority text, _title text, _body text,
  _entity_type text DEFAULT NULL, _entity_id uuid DEFAULT NULL,
  _target_path text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  -- SECURITY DEFINER changes current_user to the function owner. The executable
  -- privilege is restricted to service_role below; do not check current_user here.
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _recipient_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Recipient is not an active organisation member';
  END IF;
  INSERT INTO public.action_notifications (
    company_id, recipient_user_id, event_key, category, priority,
    title, body, entity_type, entity_id, target_path
  ) VALUES (
    _company_id, _recipient_user_id, _event_key, _category, _priority,
    _title, _body, _entity_type, _entity_id, _target_path
  )
  ON CONFLICT (company_id, recipient_user_id, event_key)
  DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
                priority = EXCLUDED.priority, target_path = EXCLUDED.target_path
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_action_notification(uuid,uuid,text,text,text,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_action_notification(uuid,uuid,text,text,text,text,text,text,uuid,text) TO service_role;

COMMENT ON FUNCTION public.publish_action_notification(uuid,uuid,text,text,text,text,text,text,uuid,text)
 IS 'Server-only, idempotent notification event publisher. Source workflow authorization and recipient selection are the responsibility of the trusted producer.';
