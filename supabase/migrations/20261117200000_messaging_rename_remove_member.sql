-- Rename group conversations and remove internal members.
-- Additive.

CREATE OR REPLACE FUNCTION public.messaging_rename_conversation(
  _company_id UUID,
  _conversation_id UUID,
  _title TEXT
)
RETURNS public.messaging_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _conv public.messaging_conversations;
  _role TEXT;
  _clean TEXT := btrim(COALESCE(_title, ''));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(_clean) < 1 OR length(_clean) > 120 THEN RAISE EXCEPTION 'invalid title'; END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  SELECT * INTO _conv
  FROM public.messaging_conversations c
  WHERE c.id = _conversation_id AND c.company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF _conv.conversation_type = 'dm' THEN RAISE EXCEPTION 'cannot rename direct messages'; END IF;

  SELECT mem.member_role INTO _role
  FROM public.messaging_conversation_members mem
  WHERE mem.conversation_id = _conversation_id AND mem.user_id = _uid AND mem.status = 'active';
  IF _role NOT IN ('owner', 'admin')
     AND NOT public.has_company_permission(_company_id, 'messaging.manage_settings') THEN
    RAISE EXCEPTION 'missing permission to rename';
  END IF;

  UPDATE public.messaging_conversations
  SET title = _clean, updated_at = now()
  WHERE id = _conversation_id
  RETURNING * INTO _conv;

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.rename', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('title', _clean)
  );
  RETURN _conv;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_remove_internal_member(
  _company_id UUID,
  _conversation_id UUID,
  _member_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _actor_role TEXT;
  _target_role TEXT;
  _conv public.messaging_conversations;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _member_user_id IS NULL OR _member_user_id = _uid THEN
    RAISE EXCEPTION 'use leave to remove yourself';
  END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  SELECT * INTO _conv
  FROM public.messaging_conversations c
  WHERE c.id = _conversation_id AND c.company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF _conv.conversation_type = 'dm' THEN RAISE EXCEPTION 'cannot remove members from DMs'; END IF;

  SELECT mem.member_role INTO _actor_role
  FROM public.messaging_conversation_members mem
  WHERE mem.conversation_id = _conversation_id AND mem.user_id = _uid AND mem.status = 'active';
  IF _actor_role NOT IN ('owner', 'admin')
     AND NOT public.has_company_permission(_company_id, 'messaging.invite_internal') THEN
    RAISE EXCEPTION 'missing permission to remove members';
  END IF;

  SELECT mem.member_role INTO _target_role
  FROM public.messaging_conversation_members mem
  WHERE mem.conversation_id = _conversation_id
    AND mem.user_id = _member_user_id
    AND mem.status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;
  IF _target_role = 'owner' AND _actor_role <> 'owner' THEN
    RAISE EXCEPTION 'cannot remove conversation owner';
  END IF;

  UPDATE public.messaging_conversation_members
  SET status = 'removed', left_at = now()
  WHERE conversation_id = _conversation_id
    AND user_id = _member_user_id
    AND status = 'active';

  UPDATE public.messaging_conversations
  SET channel_epoch = channel_epoch + 1, updated_at = now()
  WHERE id = _conversation_id;

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.remove_member', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('member_user_id', _member_user_id)
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_rename_conversation(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_remove_internal_member(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_rename_conversation(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_remove_internal_member(UUID, UUID, UUID) TO authenticated;
