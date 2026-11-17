-- Internal announcement-style channels (group variant with conversation_type=channel).
-- Additive.

CREATE OR REPLACE FUNCTION public.messaging_create_channel(
  _company_id UUID,
  _title TEXT,
  _description TEXT DEFAULT NULL,
  _member_user_ids UUID[] DEFAULT '{}'::uuid[]
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
  _peer UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.create_group') THEN
    RAISE EXCEPTION 'missing messaging.create_group';
  END IF;
  IF _title IS NULL OR length(btrim(_title)) < 1 THEN RAISE EXCEPTION 'title required'; END IF;

  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_group_create THEN
    RAISE EXCEPTION 'channel messaging disabled';
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, title, description, created_by
  ) VALUES (
    _company_id, 'channel', 'internal', btrim(_title),
    NULLIF(btrim(COALESCE(_description, '')), ''), _uid
  ) RETURNING id INTO _conversation_id;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES (_company_id, _conversation_id, 'member', _uid, 'owner', 'active');

  IF public.has_company_permission(_company_id, 'messaging.invite_internal') THEN
    FOREACH _peer IN ARRAY COALESCE(_member_user_ids, '{}'::uuid[])
    LOOP
      IF _peer = _uid THEN CONTINUE; END IF;
      IF EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = _company_id AND m.user_id = _peer AND m.status = 'active'
      ) THEN
        INSERT INTO public.messaging_conversation_members (
          company_id, conversation_id, participant_kind, user_id, member_role, status
        ) VALUES (_company_id, _conversation_id, 'member', _peer, 'member', 'active');
      END IF;
    END LOOP;
  END IF;

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.create_channel', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('title', btrim(_title))
  );
  RETURN _conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_create_channel(UUID, TEXT, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_create_channel(UUID, TEXT, TEXT, UUID[]) TO authenticated;
