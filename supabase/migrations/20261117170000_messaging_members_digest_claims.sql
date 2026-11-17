-- Add internal members to group conversations; allow messaging digest send claims.
-- Additive.

ALTER TABLE public.communication_send_claims DROP CONSTRAINT IF EXISTS communication_send_claims_kind_check;
ALTER TABLE public.communication_send_claims
  ADD CONSTRAINT communication_send_claims_kind_check
  CHECK (kind IN ('test_email','digest_manual','digest_scheduled','messaging_digest'));

CREATE OR REPLACE FUNCTION public.messaging_add_internal_members(
  _company_id UUID,
  _conversation_id UUID,
  _member_user_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _conv public.messaging_conversations;
  _peer UUID;
  _added INTEGER := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.invite_internal') THEN
    RAISE EXCEPTION 'missing messaging.invite_internal';
  END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  SELECT * INTO _conv
  FROM public.messaging_conversations c
  WHERE c.id = _conversation_id AND c.company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF _conv.conversation_type NOT IN ('group', 'channel', 'hr_private', 'accountant_client', 'advisor_engagement') THEN
    RAISE EXCEPTION 'cannot add members to this conversation type';
  END IF;

  FOREACH _peer IN ARRAY COALESCE(_member_user_ids, '{}'::uuid[])
  LOOP
    IF _peer = _uid THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id AND m.user_id = _peer AND m.status = 'active'
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.messaging_conversation_members mem
      WHERE mem.conversation_id = _conversation_id
        AND mem.user_id = _peer
        AND mem.status = 'active'
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.messaging_conversation_members
    SET status = 'active', member_role = 'member', left_at = NULL
    WHERE conversation_id = _conversation_id
      AND user_id = _peer
      AND status <> 'active';

    IF FOUND THEN
      _added := _added + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.messaging_conversation_members (
      company_id, conversation_id, participant_kind, user_id, member_role, status
    ) VALUES (_company_id, _conversation_id, 'member', _peer, 'member', 'active');
    _added := _added + 1;
  END LOOP;

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.add_members', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('added', _added)
  );
  RETURN _added;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_add_internal_members(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_add_internal_members(UUID, UUID, UUID[]) TO authenticated;
