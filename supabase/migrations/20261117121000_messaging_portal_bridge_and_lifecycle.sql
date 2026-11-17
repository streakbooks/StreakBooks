-- Portal bridge + membership lifecycle for unified messaging.
-- Extends foundation; does not replace portal_messages (read/bridge only).
-- Additive.

CREATE OR REPLACE FUNCTION public.messaging_open_portal_discussion(
  _company_id UUID,
  _portal_role TEXT,
  _contact_id UUID,
  _record_type TEXT,
  _record_id UUID,
  _title TEXT DEFAULT NULL,
  _deep_link_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _settings public.messaging_settings;
  _membership public.portal_memberships;
  _conversation_id UUID;
  _visibility TEXT;
  _conv_type TEXT;
  _participant_kind TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _portal_role NOT IN ('customer', 'supplier') THEN RAISE EXCEPTION 'invalid portal role'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.manage_external')
     AND NOT public.has_company_permission(_company_id, 'messaging.link_records') THEN
    RAISE EXCEPTION 'missing external messaging permission';
  END IF;

  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled THEN RAISE EXCEPTION 'messaging disabled'; END IF;
  IF _portal_role = 'customer' AND NOT _settings.allow_customer THEN
    RAISE EXCEPTION 'customer messaging disabled';
  END IF;
  IF _portal_role = 'supplier' AND NOT _settings.allow_vendor THEN
    RAISE EXCEPTION 'vendor messaging disabled';
  END IF;

  SELECT * INTO _membership
  FROM public.portal_memberships pm
  WHERE pm.company_id = _company_id
    AND pm.contact_id = _contact_id
    AND pm.portal_role = _portal_role
    AND pm.status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'active portal membership required'; END IF;

  _visibility := CASE WHEN _portal_role = 'customer' THEN 'customer' ELSE 'vendor' END;
  _conv_type := CASE WHEN _portal_role = 'customer' THEN 'customer' ELSE 'vendor' END;
  _participant_kind := CASE
    WHEN _portal_role = 'customer' THEN 'portal_customer'
    ELSE 'portal_vendor'
  END;

  SELECT rl.conversation_id INTO _conversation_id
  FROM public.messaging_record_links rl
  JOIN public.messaging_conversations c ON c.id = rl.conversation_id
  WHERE rl.company_id = _company_id
    AND rl.record_type = _record_type
    AND rl.record_id = _record_id
    AND c.visibility = _visibility
  LIMIT 1;

  IF _conversation_id IS NULL THEN
    INSERT INTO public.messaging_conversations (
      company_id, conversation_type, visibility, title, created_by
    ) VALUES (
      _company_id, _conv_type, _visibility,
      COALESCE(NULLIF(btrim(_title), ''), _record_type || ' portal discussion'),
      _uid
    ) RETURNING id INTO _conversation_id;

    INSERT INTO public.messaging_record_links (
      company_id, conversation_id, record_type, record_id, deep_link_path, created_by
    ) VALUES (
      _company_id, _conversation_id, _record_type, _record_id, _deep_link_path, _uid
    );
  END IF;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES (_company_id, _conversation_id, 'member', _uid, 'admin', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, portal_membership_id, member_role, status
  ) VALUES (
    _company_id, _conversation_id, _participant_kind, _membership.user_id, _membership.id, 'member', 'active'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.messaging_conversation_members
  SET status = 'active', left_at = NULL
  WHERE conversation_id = _conversation_id
    AND (
      user_id = _uid
      OR portal_membership_id = _membership.id
    );

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.open_portal', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object(
      'portal_role', _portal_role,
      'contact_id', _contact_id,
      'record_type', _record_type,
      'record_id', _record_id
    )
  );
  RETURN _conversation_id;
END;
$$;

-- When a company member is suspended/removed, revoke active messaging memberships.
CREATE OR REPLACE FUNCTION public.messaging_on_company_member_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' AND (OLD.status IS NOT DISTINCT FROM 'active') THEN
    UPDATE public.messaging_conversation_members
    SET status = 'removed', left_at = now()
    WHERE company_id = NEW.company_id
      AND user_id = NEW.user_id
      AND status = 'active';

    UPDATE public.messaging_conversations c
    SET channel_epoch = c.channel_epoch + 1
    WHERE c.company_id = NEW.company_id
      AND EXISTS (
        SELECT 1 FROM public.messaging_conversation_members m
        WHERE m.conversation_id = c.id AND m.user_id = NEW.user_id AND m.status = 'removed'
          AND m.left_at >= now() - interval '1 minute'
      );

    PERFORM public.messaging_write_audit(
      NEW.company_id, 'membership.revoked_by_company_status', 'company_members', NEW.user_id::text,
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messaging_company_member_status_trg ON public.company_members;
CREATE TRIGGER messaging_company_member_status_trg
  AFTER UPDATE OF status ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.messaging_on_company_member_status();

REVOKE ALL ON FUNCTION public.messaging_open_portal_discussion(UUID, TEXT, UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_open_portal_discussion(UUID, TEXT, UUID, TEXT, UUID, TEXT, TEXT)
  TO authenticated;
