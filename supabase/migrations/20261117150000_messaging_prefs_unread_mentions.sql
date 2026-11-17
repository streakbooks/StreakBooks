-- Notification preferences upsert, mark unread, mention conversation listing.
-- Additive.

CREATE OR REPLACE FUNCTION public.messaging_mark_unread(
  _company_id UUID,
  _conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _max_seq BIGINT;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_conversations c
    WHERE c.id = _conversation_id AND c.company_id = _company_id
  ) THEN RETURN false; END IF;

  SELECT COALESCE(MAX(seq), 0) INTO _max_seq
  FROM public.messaging_messages
  WHERE conversation_id = _conversation_id;

  UPDATE public.messaging_conversation_members
  SET last_read_seq = GREATEST(_max_seq - 1, 0)
  WHERE conversation_id = _conversation_id AND user_id = _uid AND status = 'active';

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_upsert_notification_preferences(
  _company_id UUID,
  _email_enabled BOOLEAN DEFAULT true,
  _push_enabled BOOLEAN DEFAULT false,
  _mention_only BOOLEAN DEFAULT false,
  _digest_frequency TEXT DEFAULT 'off',
  _quiet_hours_start TIME DEFAULT NULL,
  _quiet_hours_end TIME DEFAULT NULL
)
RETURNS public.messaging_notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.messaging_notification_preferences;
  _freq TEXT := COALESCE(NULLIF(_digest_frequency, ''), 'off');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _freq NOT IN ('off', 'daily', 'weekly') THEN RAISE EXCEPTION 'invalid digest frequency'; END IF;

  INSERT INTO public.messaging_notification_preferences (
    company_id, user_id, email_enabled, push_enabled, mention_only,
    digest_frequency, quiet_hours_start, quiet_hours_end, updated_at
  ) VALUES (
    _company_id, _uid,
    COALESCE(_email_enabled, true),
    COALESCE(_push_enabled, false),
    COALESCE(_mention_only, false),
    _freq,
    _quiet_hours_start,
    _quiet_hours_end,
    now()
  )
  ON CONFLICT (company_id, user_id) DO UPDATE SET
    email_enabled = EXCLUDED.email_enabled,
    push_enabled = EXCLUDED.push_enabled,
    mention_only = EXCLUDED.mention_only,
    digest_frequency = EXCLUDED.digest_frequency,
    quiet_hours_start = EXCLUDED.quiet_hours_start,
    quiet_hours_end = EXCLUDED.quiet_hours_end,
    updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_list_mention_conversation_ids(
  _company_id UUID
)
RETURNS TABLE(conversation_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.email), ''), '') AS label
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
  SELECT DISTINCT m.conversation_id
  FROM public.messaging_messages m
  JOIN public.messaging_conversation_members mem
    ON mem.conversation_id = m.conversation_id
   AND mem.user_id = auth.uid()
   AND mem.status = 'active'
  CROSS JOIN me
  WHERE m.company_id = _company_id
    AND m.is_redacted = false
    AND (
      m.body ILIKE '%@everyone%'
      OR (me.label <> '' AND m.body ILIKE '%' || '@' || me.label || '%')
      OR m.body ~* ('(^|\\s)@' || replace(auth.uid()::text, '-', '\\-'))
    );
$$;

REVOKE ALL ON FUNCTION public.messaging_mark_unread(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_upsert_notification_preferences(UUID, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TIME, TIME) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_list_mention_conversation_ids(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_mark_unread(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_upsert_notification_preferences(UUID, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TIME, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_list_mention_conversation_ids(UUID) TO authenticated;
