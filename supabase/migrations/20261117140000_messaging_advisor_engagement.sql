-- Advisor engagement conversations + pin/star message helpers.
-- Additive. Does not replace advisors_portal_messages.

CREATE OR REPLACE FUNCTION public.messaging_open_advisor_engagement(
  _company_id UUID,
  _title TEXT,
  _peer_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _conversation_id UUID;
  _settings public.messaging_settings;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.create') THEN
    RAISE EXCEPTION 'missing messaging.create';
  END IF;
  IF _peer_user_id IS NULL OR _peer_user_id = _uid THEN RAISE EXCEPTION 'invalid peer'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _peer_user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'peer not an active member of this organisation';
  END IF;

  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_advisor THEN
    RAISE EXCEPTION 'advisor messaging disabled';
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, title, created_by
  ) VALUES (
    _company_id, 'advisor_engagement', 'advisor',
    COALESCE(NULLIF(btrim(_title), ''), 'Advisor engagement'),
    _uid
  ) RETURNING id INTO _conversation_id;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES
    (_company_id, _conversation_id, 'member', _uid, 'owner', 'active'),
    (_company_id, _conversation_id, 'member', _peer_user_id, 'member', 'active');

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.open_advisor_engagement', 'messaging_conversations',
    _conversation_id::text, jsonb_build_object('peer', _peer_user_id)
  );
  RETURN _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_pin_message(
  _company_id UUID,
  _message_id UUID,
  _pinned BOOLEAN DEFAULT true
)
RETURNS public.messaging_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _msg public.messaging_messages;
  _updated public.messaging_messages;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _msg FROM public.messaging_messages WHERE id = _message_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'message not found'; END IF;
  IF NOT public.messaging_is_active_member(_msg.conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  UPDATE public.messaging_messages
  SET is_pinned = COALESCE(_pinned, true)
  WHERE id = _message_id
  RETURNING * INTO _updated;
  RETURN _updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_star_message(
  _company_id UUID,
  _message_id UUID,
  _starred BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _msg public.messaging_messages;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT * INTO _msg FROM public.messaging_messages WHERE id = _message_id AND company_id = _company_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT public.messaging_is_active_member(_msg.conversation_id, _uid) THEN RETURN false; END IF;

  IF COALESCE(_starred, true) THEN
    INSERT INTO public.messaging_starred_messages (company_id, user_id, message_id)
    VALUES (_company_id, _uid, _message_id)
    ON CONFLICT (user_id, message_id) DO NOTHING;
  ELSE
    DELETE FROM public.messaging_starred_messages
    WHERE user_id = _uid AND message_id = _message_id;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_open_advisor_engagement(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_pin_message(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_star_message(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_open_advisor_engagement(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_pin_message(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_star_message(UUID, UUID, BOOLEAN) TO authenticated;
