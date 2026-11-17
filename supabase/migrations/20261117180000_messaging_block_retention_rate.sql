-- Block/unblock peers, retention days, and send rate limiting.
-- Additive. Replaces messaging_send_message only to inject rate limit while preserving
-- outbox + action_notifications fan-out from the foundation migration.

CREATE OR REPLACE FUNCTION public.messaging_block_user(
  _company_id UUID,
  _blocked_user_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _blocked_user_id IS NULL OR _blocked_user_id = _uid THEN RAISE EXCEPTION 'invalid peer'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _blocked_user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'peer not in company';
  END IF;

  INSERT INTO public.messaging_user_blocks (
    company_id, blocker_user_id, blocked_user_id, reason
  ) VALUES (
    _company_id, _uid, _blocked_user_id, NULLIF(btrim(COALESCE(_reason, '')), '')
  )
  ON CONFLICT (company_id, blocker_user_id, blocked_user_id) DO UPDATE
    SET reason = EXCLUDED.reason;

  PERFORM public.messaging_write_audit(
    _company_id, 'user.block', 'messaging_user_blocks', _blocked_user_id::text,
    jsonb_build_object('reason', COALESCE(_reason, ''))
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_unblock_user(
  _company_id UUID,
  _blocked_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  DELETE FROM public.messaging_user_blocks
  WHERE company_id = _company_id
    AND blocker_user_id = _uid
    AND blocked_user_id = _blocked_user_id;

  PERFORM public.messaging_write_audit(
    _company_id, 'user.unblock', 'messaging_user_blocks', _blocked_user_id::text,
    '{}'::jsonb
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_set_retention_days(
  _company_id UUID,
  _retention_days INTEGER
)
RETURNS public.messaging_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.messaging_settings;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.manage_retention') THEN
    RAISE EXCEPTION 'missing messaging.manage_retention';
  END IF;
  IF _retention_days IS NOT NULL AND (_retention_days < 30 OR _retention_days > 3650) THEN
    RAISE EXCEPTION 'retention_days must be between 30 and 3650, or null';
  END IF;

  _row := public.messaging_ensure_settings(_company_id);
  UPDATE public.messaging_settings
  SET retention_days = _retention_days
  WHERE company_id = _company_id
  RETURNING * INTO _row;

  PERFORM public.messaging_write_audit(
    _company_id, 'settings.retention', 'messaging_settings', _company_id::text,
    jsonb_build_object('retention_days', _retention_days)
  );
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_send_message(
  _company_id UUID,
  _conversation_id UUID,
  _body TEXT,
  _idempotency_key UUID,
  _reply_to_message_id UUID DEFAULT NULL,
  _body_format TEXT DEFAULT 'plain'
)
RETURNS public.messaging_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _settings public.messaging_settings;
  _existing public.messaging_messages;
  _msg public.messaging_messages;
  _seq BIGINT;
  _preview TEXT;
  _recent INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'idempotency_key required'; END IF;
  IF _body IS NULL OR length(btrim(_body)) < 1 THEN RAISE EXCEPTION 'empty body'; END IF;
  IF length(btrim(_body)) > 8000 THEN RAISE EXCEPTION 'body too long'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.send') THEN
    RAISE EXCEPTION 'missing messaging.send';
  END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_conversations c
    WHERE c.id = _conversation_id AND c.company_id = _company_id AND c.is_archived = false
  ) THEN
    RAISE EXCEPTION 'conversation unavailable';
  END IF;

  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled THEN RAISE EXCEPTION 'messaging disabled'; END IF;

  SELECT COUNT(*)::INTEGER INTO _recent
  FROM public.messaging_messages m
  WHERE m.company_id = _company_id
    AND m.author_user_id = _uid
    AND m.created_at > now() - interval '1 minute';
  IF COALESCE(_recent, 0) >= 30 THEN
    RAISE EXCEPTION 'rate limited: too many messages in one minute';
  END IF;

  SELECT * INTO _existing
  FROM public.messaging_messages
  WHERE conversation_id = _conversation_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN RETURN _existing; END IF;

  IF _reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messaging_messages m
    WHERE m.id = _reply_to_message_id AND m.conversation_id = _conversation_id
  ) THEN
    RAISE EXCEPTION 'invalid reply target';
  END IF;

  _seq := public.messaging_next_seq(_conversation_id);
  _preview := left(btrim(_body), 240);

  INSERT INTO public.messaging_messages (
    company_id, conversation_id, seq, author_user_id, author_kind,
    body, body_format, reply_to_message_id, idempotency_key
  ) VALUES (
    _company_id, _conversation_id, _seq, _uid, 'member',
    btrim(_body), COALESCE(NULLIF(_body_format, ''), 'plain'), _reply_to_message_id, _idempotency_key
  ) RETURNING * INTO _msg;

  UPDATE public.messaging_conversations
  SET last_message_at = _msg.created_at,
      last_message_preview = _preview,
      updated_at = now()
  WHERE id = _conversation_id;

  UPDATE public.messaging_conversation_members
  SET last_read_seq = _seq
  WHERE conversation_id = _conversation_id AND user_id = _uid AND status = 'active';

  INSERT INTO public.messaging_outbox_events (
    company_id, conversation_id, message_id, event_type, seq, payload
  ) VALUES (
    _company_id, _conversation_id, _msg.id, 'message.created', _seq,
    jsonb_build_object('conversation_id', _conversation_id, 'seq', _seq, 'message_id', _msg.id)
  );

  INSERT INTO public.action_notifications (
    company_id, recipient_user_id, event_key, category, priority,
    title, body, entity_type, entity_id, target_path
  )
  SELECT
    _company_id,
    m.user_id,
    'messaging:' || _msg.id::text,
    'system',
    'medium',
    'New message',
    _preview,
    'messaging_conversation',
    _conversation_id,
    '/messages?conversation=' || _conversation_id::text
  FROM public.messaging_conversation_members m
  WHERE m.conversation_id = _conversation_id
    AND m.status = 'active'
    AND m.user_id IS NOT NULL
    AND m.user_id <> _uid
    AND (m.muted_until IS NULL OR m.muted_until < now())
  ON CONFLICT (company_id, recipient_user_id, event_key) DO NOTHING;

  RETURN _msg;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO _existing
    FROM public.messaging_messages
    WHERE conversation_id = _conversation_id AND idempotency_key = _idempotency_key;
    IF FOUND THEN RETURN _existing; END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_block_user(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_unblock_user(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_set_retention_days(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_block_user(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_unblock_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_set_retention_days(UUID, INTEGER) TO authenticated;
