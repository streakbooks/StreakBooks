-- Messaging attachments storage policies, edit/react/redact, portal participant send/list,
-- HR private open, accountant-client open, formal approval request notification.
-- Additive. Does not drop legacy portal_messages.

-- ---------------------------------------------------------------------------
-- Storage access helper + policies for messaging-attachments
-- Path: {company_id}/{conversation_id}/{uuid}-{filename}
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.messaging_can_access_attachment_path(_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parts TEXT[] := string_to_array(_name, '/');
  _company_id UUID;
  _conversation_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF array_length(_parts, 1) IS DISTINCT FROM 3 THEN RETURN false; END IF;
  IF _parts[1] !~ '^[0-9a-fA-F-]{36}$' OR _parts[2] !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  _company_id := _parts[1]::UUID;
  _conversation_id := _parts[2]::UUID;
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_conversations c
    WHERE c.id = _conversation_id AND c.company_id = _company_id
  ) THEN
    RETURN false;
  END IF;
  RETURN public.messaging_is_active_member(_conversation_id, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_can_access_attachment_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_can_access_attachment_path(TEXT) TO authenticated;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS messaging_attachments_storage_select ON storage.objects;
  CREATE POLICY messaging_attachments_storage_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'messaging-attachments'
      AND public.messaging_can_access_attachment_path(name)
    );

  DROP POLICY IF EXISTS messaging_attachments_storage_insert ON storage.objects;
  CREATE POLICY messaging_attachments_storage_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'messaging-attachments'
      AND public.messaging_can_access_attachment_path(name)
    );

  DROP POLICY IF EXISTS messaging_attachments_storage_delete ON storage.objects;
  CREATE POLICY messaging_attachments_storage_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'messaging-attachments'
      AND public.messaging_can_access_attachment_path(name)
      AND public.has_company_permission(
        (string_to_array(name, '/'))[1]::UUID,
        'messaging.share_files'
      )
    );
END $$;

CREATE OR REPLACE FUNCTION public.messaging_register_attachment(
  _company_id UUID,
  _conversation_id UUID,
  _message_id UUID,
  _storage_path TEXT,
  _file_name TEXT,
  _mime_type TEXT,
  _byte_size INTEGER
)
RETURNS public.messaging_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.messaging_attachments;
  _settings public.messaging_settings;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.share_files')
     AND NOT EXISTS (
       SELECT 1 FROM public.portal_memberships pm
       WHERE pm.company_id = _company_id AND pm.user_id = _uid AND pm.status = 'active'
     ) THEN
    RAISE EXCEPTION 'missing messaging.share_files';
  END IF;
  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_file_share THEN
    RAISE EXCEPTION 'file sharing disabled';
  END IF;
  IF _byte_size IS NULL OR _byte_size < 1 OR _byte_size > _settings.max_attachment_bytes THEN
    RAISE EXCEPTION 'invalid attachment size';
  END IF;
  IF NOT public.messaging_can_access_attachment_path(_storage_path) THEN
    RAISE EXCEPTION 'invalid storage path';
  END IF;
  IF _message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messaging_messages m
    WHERE m.id = _message_id AND m.conversation_id = _conversation_id
  ) THEN
    RAISE EXCEPTION 'invalid message';
  END IF;

  INSERT INTO public.messaging_attachments (
    company_id, conversation_id, message_id, uploaded_by, storage_path, file_name, mime_type, byte_size
  ) VALUES (
    _company_id, _conversation_id, _message_id, _uid, _storage_path, _file_name, _mime_type, _byte_size
  ) RETURNING * INTO _row;

  PERFORM public.messaging_write_audit(
    _company_id, 'attachment.register', 'messaging_attachments', _row.id::text,
    jsonb_build_object('conversation_id', _conversation_id, 'file_name', _file_name)
  );
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_edit_message(
  _company_id UUID,
  _message_id UUID,
  _body TEXT
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
  IF _body IS NULL OR length(btrim(_body)) < 1 OR length(btrim(_body)) > 8000 THEN
    RAISE EXCEPTION 'invalid body';
  END IF;
  SELECT * INTO _msg FROM public.messaging_messages WHERE id = _message_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'message not found'; END IF;
  IF _msg.author_user_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'only author can edit'; END IF;
  IF _msg.is_redacted THEN RAISE EXCEPTION 'redacted messages cannot be edited'; END IF;
  IF NOT public.messaging_is_active_member(_msg.conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  INSERT INTO public.messaging_message_versions (company_id, message_id, body, edited_by)
  VALUES (_company_id, _message_id, _msg.body, _uid);

  UPDATE public.messaging_messages
  SET body = btrim(_body), is_edited = true, edited_at = now()
  WHERE id = _message_id
  RETURNING * INTO _updated;

  INSERT INTO public.messaging_outbox_events (
    company_id, conversation_id, message_id, event_type, seq, payload
  ) VALUES (
    _company_id, _msg.conversation_id, _message_id, 'message.edited', _msg.seq,
    jsonb_build_object('conversation_id', _msg.conversation_id, 'message_id', _message_id, 'seq', _msg.seq)
  );
  RETURN _updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_redact_message(
  _company_id UUID,
  _message_id UUID
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
  IF _msg.author_user_id IS DISTINCT FROM _uid
     AND NOT public.has_company_permission(_company_id, 'messaging.manage_group') THEN
    RAISE EXCEPTION 'not allowed to redact';
  END IF;

  INSERT INTO public.messaging_message_versions (company_id, message_id, body, edited_by)
  VALUES (_company_id, _message_id, _msg.body, _uid);

  UPDATE public.messaging_messages
  SET body = '[Message removed]', is_redacted = true, redacted_at = now(), is_edited = true, edited_at = now()
  WHERE id = _message_id
  RETURNING * INTO _updated;

  INSERT INTO public.messaging_outbox_events (
    company_id, conversation_id, message_id, event_type, seq, payload
  ) VALUES (
    _company_id, _msg.conversation_id, _message_id, 'message.redacted', _msg.seq,
    jsonb_build_object('conversation_id', _msg.conversation_id, 'message_id', _message_id)
  );
  RETURN _updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_react_message(
  _company_id UUID,
  _message_id UUID,
  _emoji TEXT
)
RETURNS public.messaging_message_reactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _msg public.messaging_messages;
  _row public.messaging_message_reactions;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _emoji IS NULL OR length(_emoji) < 1 OR length(_emoji) > 16 THEN
    RAISE EXCEPTION 'invalid emoji';
  END IF;
  SELECT * INTO _msg FROM public.messaging_messages WHERE id = _message_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'message not found'; END IF;
  IF NOT public.messaging_is_active_member(_msg.conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;

  INSERT INTO public.messaging_message_reactions (company_id, message_id, user_id, emoji)
  VALUES (_company_id, _message_id, _uid, _emoji)
  ON CONFLICT (message_id, user_id, emoji) DO UPDATE SET emoji = EXCLUDED.emoji
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- Portal participant: open invoice discussion + send (no company_member required).
CREATE OR REPLACE FUNCTION public.messaging_portal_open_invoice_discussion(
  _membership_id UUID,
  _invoice_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _m public.portal_memberships;
  _inv RECORD;
  _settings public.messaging_settings;
  _conversation_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _m FROM public.portal_memberships WHERE id = _membership_id;
  IF NOT FOUND OR _m.status <> 'active' OR _m.user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'portal access denied';
  END IF;
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'customer portal required'; END IF;

  _settings := public.messaging_ensure_settings(_m.company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_customer THEN
    RAISE EXCEPTION 'customer messaging disabled';
  END IF;

  SELECT id, company_id, contact_id, invoice_number
  INTO _inv
  FROM public.sales_invoices
  WHERE id = _invoice_id AND company_id = _m.company_id AND contact_id = _m.contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not available'; END IF;

  SELECT rl.conversation_id INTO _conversation_id
  FROM public.messaging_record_links rl
  JOIN public.messaging_conversations c ON c.id = rl.conversation_id
  WHERE rl.company_id = _m.company_id
    AND rl.record_type = 'sales_invoice'
    AND rl.record_id = _invoice_id
    AND c.visibility = 'customer'
  LIMIT 1;

  IF _conversation_id IS NULL THEN
    INSERT INTO public.messaging_conversations (
      company_id, conversation_type, visibility, title, created_by
    ) VALUES (
      _m.company_id, 'customer', 'customer',
      COALESCE('Invoice ' || _inv.invoice_number, 'Invoice discussion'),
      _uid
    ) RETURNING id INTO _conversation_id;

    INSERT INTO public.messaging_record_links (
      company_id, conversation_id, record_type, record_id, deep_link_path, created_by
    ) VALUES (
      _m.company_id, _conversation_id, 'sales_invoice', _invoice_id,
      '/portal/app/invoices/' || _invoice_id::text, _uid
    );
  END IF;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, portal_membership_id, member_role, status
  ) VALUES (
    _m.company_id, _conversation_id, 'portal_customer', _uid, _m.id, 'member', 'active'
  ) ON CONFLICT DO NOTHING;

  UPDATE public.messaging_conversation_members
  SET status = 'active', left_at = NULL
  WHERE conversation_id = _conversation_id AND portal_membership_id = _m.id;

  RETURN _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_portal_open_po_discussion(
  _membership_id UUID,
  _order_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _m public.portal_memberships;
  _po RECORD;
  _settings public.messaging_settings;
  _conversation_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _m FROM public.portal_memberships WHERE id = _membership_id;
  IF NOT FOUND OR _m.status <> 'active' OR _m.user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'portal access denied';
  END IF;
  IF _m.portal_role <> 'supplier' THEN RAISE EXCEPTION 'supplier portal required'; END IF;

  _settings := public.messaging_ensure_settings(_m.company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_vendor THEN
    RAISE EXCEPTION 'vendor messaging disabled';
  END IF;

  SELECT id, company_id, contact_id, order_number
  INTO _po
  FROM public.purchase_orders
  WHERE id = _order_id AND company_id = _m.company_id AND contact_id = _m.contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not available'; END IF;

  SELECT rl.conversation_id INTO _conversation_id
  FROM public.messaging_record_links rl
  JOIN public.messaging_conversations c ON c.id = rl.conversation_id
  WHERE rl.company_id = _m.company_id
    AND rl.record_type = 'purchase_order'
    AND rl.record_id = _order_id
    AND c.visibility = 'vendor'
  LIMIT 1;

  IF _conversation_id IS NULL THEN
    INSERT INTO public.messaging_conversations (
      company_id, conversation_type, visibility, title, created_by
    ) VALUES (
      _m.company_id, 'vendor', 'vendor',
      COALESCE('PO ' || _po.order_number, 'Purchase order discussion'),
      _uid
    ) RETURNING id INTO _conversation_id;

    INSERT INTO public.messaging_record_links (
      company_id, conversation_id, record_type, record_id, deep_link_path, created_by
    ) VALUES (
      _m.company_id, _conversation_id, 'purchase_order', _order_id,
      '/portal/app/orders/' || _order_id::text, _uid
    );
  END IF;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, portal_membership_id, member_role, status
  ) VALUES (
    _m.company_id, _conversation_id, 'portal_vendor', _uid, _m.id, 'member', 'active'
  ) ON CONFLICT DO NOTHING;

  UPDATE public.messaging_conversation_members
  SET status = 'active', left_at = NULL
  WHERE conversation_id = _conversation_id AND portal_membership_id = _m.id;

  RETURN _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_portal_send_message(
  _membership_id UUID,
  _conversation_id UUID,
  _body TEXT,
  _idempotency_key UUID
)
RETURNS public.messaging_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _m public.portal_memberships;
  _existing public.messaging_messages;
  _msg public.messaging_messages;
  _seq BIGINT;
  _preview TEXT;
  _author_kind TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'idempotency_key required'; END IF;
  IF _body IS NULL OR length(btrim(_body)) < 1 OR length(btrim(_body)) > 8000 THEN
    RAISE EXCEPTION 'invalid body';
  END IF;

  SELECT * INTO _m FROM public.portal_memberships WHERE id = _membership_id;
  IF NOT FOUND OR _m.status <> 'active' OR _m.user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'portal access denied';
  END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_conversations c
    WHERE c.id = _conversation_id AND c.company_id = _m.company_id
      AND c.visibility IN ('customer', 'vendor')
  ) THEN
    RAISE EXCEPTION 'conversation unavailable';
  END IF;

  SELECT * INTO _existing
  FROM public.messaging_messages
  WHERE conversation_id = _conversation_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN RETURN _existing; END IF;

  _author_kind := CASE WHEN _m.portal_role = 'customer' THEN 'portal_customer' ELSE 'portal_vendor' END;
  _seq := public.messaging_next_seq(_conversation_id);
  _preview := left(btrim(_body), 240);

  INSERT INTO public.messaging_messages (
    company_id, conversation_id, seq, author_user_id, author_kind,
    body, body_format, idempotency_key
  ) VALUES (
    _m.company_id, _conversation_id, _seq, _uid, _author_kind,
    btrim(_body), 'plain', _idempotency_key
  ) RETURNING * INTO _msg;

  UPDATE public.messaging_conversations
  SET last_message_at = _msg.created_at, last_message_preview = _preview, updated_at = now()
  WHERE id = _conversation_id;

  UPDATE public.messaging_conversation_members
  SET last_read_seq = _seq
  WHERE conversation_id = _conversation_id AND user_id = _uid AND status = 'active';

  INSERT INTO public.messaging_outbox_events (
    company_id, conversation_id, message_id, event_type, seq, payload
  ) VALUES (
    _m.company_id, _conversation_id, _msg.id, 'message.created', _seq,
    jsonb_build_object('conversation_id', _conversation_id, 'seq', _seq, 'message_id', _msg.id)
  );

  -- Dual-write to legacy portal_messages for continuity of /portal/app/messages list.
  INSERT INTO public.portal_messages (
    company_id, contact_id, author_user_id, author_role, body, invoice_id
  )
  SELECT
    _m.company_id,
    _m.contact_id,
    _uid,
    CASE WHEN _m.portal_role = 'customer' THEN 'customer' ELSE 'supplier' END,
    btrim(_body),
    (
      SELECT rl.record_id FROM public.messaging_record_links rl
      WHERE rl.conversation_id = _conversation_id AND rl.record_type = 'sales_invoice'
      LIMIT 1
    );

  INSERT INTO public.action_notifications (
    company_id, recipient_user_id, event_key, category, priority,
    title, body, entity_type, entity_id, target_path
  )
  SELECT
    _m.company_id,
    mem.user_id,
    'messaging-portal:' || _msg.id::text,
    'system',
    'high',
    'Portal message',
    _preview,
    'messaging_conversation',
    _conversation_id,
    '/messages?conversation=' || _conversation_id::text
  FROM public.messaging_conversation_members mem
  WHERE mem.conversation_id = _conversation_id
    AND mem.status = 'active'
    AND mem.participant_kind = 'member'
    AND mem.user_id IS NOT NULL
    AND mem.user_id <> _uid
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

CREATE OR REPLACE FUNCTION public.messaging_open_hr_private(
  _company_id UUID,
  _title TEXT,
  _peer_user_id UUID DEFAULT NULL
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
  IF NOT (
    public.has_company_permission(_company_id, 'hr.self_service')
    OR public.has_company_permission(_company_id, 'hr.view')
    OR public.has_company_permission(_company_id, 'messaging.create')
  ) THEN
    RAISE EXCEPTION 'missing HR messaging permission';
  END IF;
  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_employee THEN
    RAISE EXCEPTION 'employee messaging disabled';
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, title, created_by
  ) VALUES (
    _company_id, 'hr_private', 'hr_private',
    COALESCE(NULLIF(btrim(_title), ''), 'Private HR discussion'),
    _uid
  ) RETURNING id INTO _conversation_id;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES (_company_id, _conversation_id, 'member', _uid, 'owner', 'active');

  IF _peer_user_id IS NOT NULL AND _peer_user_id <> _uid THEN
    IF EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id AND m.user_id = _peer_user_id AND m.status = 'active'
    ) THEN
      INSERT INTO public.messaging_conversation_members (
        company_id, conversation_id, participant_kind, user_id, member_role, status
      ) VALUES (_company_id, _conversation_id, 'member', _peer_user_id, 'member', 'active');
    END IF;
  END IF;

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.open_hr_private', 'messaging_conversations', _conversation_id::text,
    '{}'::jsonb
  );
  RETURN _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_open_accountant_client(
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
  IF NOT _settings.enabled OR NOT _settings.allow_accountant THEN
    RAISE EXCEPTION 'accountant messaging disabled';
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, title, created_by
  ) VALUES (
    _company_id, 'accountant_client', 'accountant',
    COALESCE(NULLIF(btrim(_title), ''), 'Accountant discussion'),
    _uid
  ) RETURNING id INTO _conversation_id;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES
    (_company_id, _conversation_id, 'member', _uid, 'owner', 'active'),
    (_company_id, _conversation_id, 'member', _peer_user_id, 'member', 'active');

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.open_accountant_client', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('peer', _peer_user_id)
  );
  RETURN _conversation_id;
END;
$$;

-- Formal approval request from chat context: creates Action Center item only.
-- Never posts, pays, or changes document state.
CREATE OR REPLACE FUNCTION public.messaging_request_formal_approval(
  _company_id UUID,
  _conversation_id UUID,
  _assignee_user_id UUID,
  _kind TEXT,
  _record_type TEXT,
  _record_id UUID,
  _note TEXT,
  _target_path TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _notification_id UUID;
  _event_key TEXT;
  _safe_note TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'not a conversation member';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _assignee_user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'assignee not an active member';
  END IF;
  IF _kind IS NULL OR length(_kind) < 1 OR length(_kind) > 80 THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;
  _safe_note := left(COALESCE(NULLIF(btrim(_note), ''), 'Review requested from Messages'), 500);
  _event_key := 'messaging-approval:' || _conversation_id::text || ':' || _record_id::text || ':' || _assignee_user_id::text || ':' || _kind;

  INSERT INTO public.action_notifications (
    company_id, recipient_user_id, event_key, category, priority,
    title, body, entity_type, entity_id, target_path, action_kind
  ) VALUES (
    _company_id,
    _assignee_user_id,
    _event_key,
    'system',
    'high',
    'Approval request from Messages',
    _safe_note,
    COALESCE(NULLIF(_record_type, ''), 'messaging_conversation'),
    COALESCE(_record_id, _conversation_id),
    COALESCE(
      NULLIF(_target_path, ''),
      '/messages?conversation=' || _conversation_id::text
    ),
    'review'
  )
  ON CONFLICT (company_id, recipient_user_id, event_key)
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    target_path = EXCLUDED.target_path,
    read_at = NULL,
    archived_at = NULL,
    resolved_at = NULL
  RETURNING id INTO _notification_id;

  PERFORM public.messaging_write_audit(
    _company_id, 'approval.request', 'action_notifications', _notification_id::text,
    jsonb_build_object(
      'kind', _kind,
      'conversation_id', _conversation_id,
      'assignee', _assignee_user_id,
      'record_type', _record_type,
      'record_id', _record_id
    )
  );
  RETURN _notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_register_attachment(UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_edit_message(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_redact_message(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_react_message(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_portal_open_invoice_discussion(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_portal_open_po_discussion(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_portal_send_message(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_open_hr_private(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_open_accountant_client(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_request_formal_approval(UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.messaging_register_attachment(UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_edit_message(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_redact_message(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_react_message(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_portal_open_invoice_discussion(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_portal_open_po_discussion(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_portal_send_message(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_open_hr_private(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_open_accountant_client(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_request_formal_approval(UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
