-- Member message reporting into moderation events.
-- Additive.

CREATE OR REPLACE FUNCTION public.messaging_report_message(
  _company_id UUID,
  _message_id UUID,
  _reason TEXT DEFAULT 'reported'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _msg public.messaging_messages;
  _id UUID;
  _detail TEXT := left(btrim(COALESCE(_reason, 'reported')), 500);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.view') THEN
    RAISE EXCEPTION 'missing messaging.view';
  END IF;

  SELECT * INTO _msg
  FROM public.messaging_messages m
  WHERE m.id = _message_id AND m.company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'message not found'; END IF;
  IF NOT public.messaging_is_active_member(_msg.conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  INSERT INTO public.messaging_moderation_events (
    company_id, conversation_id, message_id, actor_user_id, event_type, detail
  ) VALUES (
    _company_id,
    _msg.conversation_id,
    _msg.id,
    _uid,
    'message.report',
    jsonb_build_object('reason', _detail)
  )
  RETURNING id INTO _id;

  PERFORM public.messaging_write_audit(
    _company_id, 'message.report', 'messaging_messages', _message_id::text,
    jsonb_build_object('reason', _detail)
  );
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_report_message(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_report_message(UUID, UUID, TEXT) TO authenticated;
