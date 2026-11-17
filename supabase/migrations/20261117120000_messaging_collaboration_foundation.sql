-- LinkBooks unified messaging foundation (Phases 0–8 schema + core RPCs).
-- Additive. Feature-gated at app layer via messaging_collaboration.
-- Does not drop portal_messages / advisors_* tables.
-- Rollback: disable feature flag; retain tables for audit. Do not DROP without authorization.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'messaging.view'),
  ('owner', 'messaging.send'),
  ('owner', 'messaging.create'),
  ('owner', 'messaging.create_group'),
  ('owner', 'messaging.manage_group'),
  ('owner', 'messaging.invite_internal'),
  ('owner', 'messaging.invite_external'),
  ('owner', 'messaging.share_files'),
  ('owner', 'messaging.link_records'),
  ('owner', 'messaging.manage_external'),
  ('owner', 'messaging.manage_settings'),
  ('owner', 'messaging.view_audit'),
  ('owner', 'messaging.manage_retention'),
  ('admin', 'messaging.view'),
  ('admin', 'messaging.send'),
  ('admin', 'messaging.create'),
  ('admin', 'messaging.create_group'),
  ('admin', 'messaging.manage_group'),
  ('admin', 'messaging.invite_internal'),
  ('admin', 'messaging.invite_external'),
  ('admin', 'messaging.share_files'),
  ('admin', 'messaging.link_records'),
  ('admin', 'messaging.manage_external'),
  ('admin', 'messaging.manage_settings'),
  ('admin', 'messaging.view_audit'),
  ('admin', 'messaging.manage_retention'),
  ('accountant', 'messaging.view'),
  ('accountant', 'messaging.send'),
  ('accountant', 'messaging.create'),
  ('accountant', 'messaging.create_group'),
  ('accountant', 'messaging.manage_group'),
  ('accountant', 'messaging.invite_internal'),
  ('accountant', 'messaging.share_files'),
  ('accountant', 'messaging.link_records'),
  ('bookkeeper', 'messaging.view'),
  ('bookkeeper', 'messaging.send'),
  ('bookkeeper', 'messaging.create'),
  ('bookkeeper', 'messaging.invite_internal'),
  ('bookkeeper', 'messaging.share_files'),
  ('bookkeeper', 'messaging.link_records'),
  ('staff', 'messaging.view'),
  ('staff', 'messaging.send'),
  ('staff', 'messaging.create'),
  ('staff', 'messaging.invite_internal'),
  ('staff', 'messaging.share_files'),
  ('read_only', 'messaging.view')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messaging_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  allow_internal BOOLEAN NOT NULL DEFAULT true,
  allow_employee BOOLEAN NOT NULL DEFAULT true,
  allow_customer BOOLEAN NOT NULL DEFAULT false,
  allow_vendor BOOLEAN NOT NULL DEFAULT false,
  allow_accountant BOOLEAN NOT NULL DEFAULT true,
  allow_advisor BOOLEAN NOT NULL DEFAULT true,
  allow_group_create BOOLEAN NOT NULL DEFAULT true,
  allow_external_invite BOOLEAN NOT NULL DEFAULT false,
  allow_file_share BOOLEAN NOT NULL DEFAULT true,
  allow_ai_assist BOOLEAN NOT NULL DEFAULT false,
  allow_voice_video BOOLEAN NOT NULL DEFAULT false,
  max_attachment_bytes INTEGER NOT NULL DEFAULT 5242880 CHECK (max_attachment_bytes BETWEEN 1 AND 20971520),
  retention_days INTEGER CHECK (retention_days IS NULL OR retention_days BETWEEN 30 AND 3650),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messaging_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL CHECK (conversation_type IN (
    'dm', 'group', 'channel', 'record', 'customer', 'vendor',
    'hr_private', 'payroll_restricted', 'accountant_client', 'advisor_engagement'
  )),
  visibility TEXT NOT NULL CHECK (visibility IN (
    'internal', 'restricted_management', 'hr_private',
    'customer', 'vendor', 'accountant', 'advisor'
  )),
  title TEXT CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  avatar_path TEXT,
  dm_pair_key TEXT,
  channel_epoch INTEGER NOT NULL DEFAULT 1,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT CHECK (last_message_preview IS NULL OR length(last_message_preview) <= 240),
  CONSTRAINT messaging_conversations_dm_pair UNIQUE (company_id, dm_pair_key)
);

CREATE INDEX IF NOT EXISTS messaging_conversations_company_updated_idx
  ON public.messaging_conversations (company_id, last_message_at DESC NULLS LAST, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.messaging_conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  participant_kind TEXT NOT NULL CHECK (participant_kind IN (
    'member', 'portal_customer', 'portal_vendor', 'advisor', 'system'
  )),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  portal_membership_id UUID REFERENCES public.portal_memberships(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'left', 'removed', 'blocked')),
  muted_until TIMESTAMPTZ,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_read_seq BIGINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messaging_members_identity CHECK (
    (participant_kind = 'member' AND user_id IS NOT NULL)
    OR (participant_kind IN ('portal_customer', 'portal_vendor') AND portal_membership_id IS NOT NULL)
    OR (participant_kind = 'advisor' AND user_id IS NOT NULL)
    OR participant_kind = 'system'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS messaging_members_user_active_uidx
  ON public.messaging_conversation_members (conversation_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS messaging_members_portal_active_uidx
  ON public.messaging_conversation_members (conversation_id, portal_membership_id)
  WHERE portal_membership_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS messaging_members_user_inbox_idx
  ON public.messaging_conversation_members (company_id, user_id, status, is_archived);

CREATE TABLE IF NOT EXISTS public.messaging_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN (
    'member', 'portal_customer', 'portal_vendor', 'advisor', 'system'
  )),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
  body_format TEXT NOT NULL DEFAULT 'plain' CHECK (body_format IN ('plain', 'markdown')),
  reply_to_message_id UUID REFERENCES public.messaging_messages(id) ON DELETE SET NULL,
  idempotency_key UUID NOT NULL,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_redacted BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  redacted_at TIMESTAMPTZ,
  UNIQUE (conversation_id, seq),
  UNIQUE (conversation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS messaging_messages_conv_seq_idx
  ON public.messaging_messages (conversation_id, seq DESC);

CREATE TABLE IF NOT EXISTS public.messaging_message_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messaging_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.messaging_message_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messaging_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messaging_record_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (length(record_type) BETWEEN 1 AND 80),
  record_id UUID NOT NULL,
  deep_link_path TEXT CHECK (deep_link_path IS NULL OR length(deep_link_path) <= 400),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS messaging_record_links_lookup_idx
  ON public.messaging_record_links (company_id, record_type, record_id);

CREATE TABLE IF NOT EXISTS public.messaging_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL CHECK (invitee_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(invitee_email) <= 200),
  invitee_kind TEXT NOT NULL CHECK (invitee_kind IN ('member', 'portal_customer', 'portal_vendor', 'advisor')),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messaging_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  mention_only BOOLEAN NOT NULL DEFAULT false,
  digest_frequency TEXT NOT NULL DEFAULT 'off' CHECK (digest_frequency IN ('off', 'daily', 'weekly')),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messaging_user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, blocker_user_id, blocked_user_id),
  CONSTRAINT messaging_blocks_not_self CHECK (blocker_user_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS public.messaging_moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.messaging_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messaging_messages(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messaging_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  entity_type TEXT NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 80),
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messaging_audit_company_idx
  ON public.messaging_audit_events (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.messaging_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'message.created', 'message.edited', 'message.redacted',
    'membership.changed', 'receipt.updated', 'conversation.updated'
  )),
  seq BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messaging_outbox_unprocessed_idx
  ON public.messaging_outbox_events (created_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.messaging_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_type TEXT,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 30 AND 3650),
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messaging_starred_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.messaging_is_enabled(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.messaging_settings WHERE company_id = _company_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.messaging_is_active_member(_conversation_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messaging_conversation_members m
    WHERE m.conversation_id = _conversation_id
      AND m.user_id = _user_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.messaging_dm_pair_key(_a UUID, _b UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _a::text < _b::text THEN _a::text || ':' || _b::text
    ELSE _b::text || ':' || _a::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_next_seq(_conversation_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seq BIGINT;
BEGIN
  SELECT COALESCE(MAX(seq), 0) + 1 INTO _seq
  FROM public.messaging_messages
  WHERE conversation_id = _conversation_id;
  RETURN _seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_write_audit(
  _company_id UUID,
  _action TEXT,
  _entity_type TEXT,
  _entity_id TEXT,
  _detail JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.messaging_audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), _action, _entity_type, _entity_id, COALESCE(_detail, '{}'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.messaging_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_message_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_starred_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.messaging_settings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_conversations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_conversation_members FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_messages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_message_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_message_reactions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_message_receipts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_attachments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_record_links FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_invitations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_notification_preferences FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_user_blocks FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_moderation_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_audit_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_outbox_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_retention_policies FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messaging_starred_messages FROM PUBLIC, anon;

DROP POLICY IF EXISTS messaging_settings_select ON public.messaging_settings;
CREATE POLICY messaging_settings_select ON public.messaging_settings
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS messaging_settings_write ON public.messaging_settings;
CREATE POLICY messaging_settings_write ON public.messaging_settings
  FOR ALL TO authenticated
  USING (public.has_company_permission(company_id, 'messaging.manage_settings'))
  WITH CHECK (public.has_company_permission(company_id, 'messaging.manage_settings'));

DROP POLICY IF EXISTS messaging_conversations_select ON public.messaging_conversations;
CREATE POLICY messaging_conversations_select ON public.messaging_conversations
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.messaging_is_active_member(id)
  );

DROP POLICY IF EXISTS messaging_members_select ON public.messaging_conversation_members;
CREATE POLICY messaging_members_select ON public.messaging_conversation_members
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.messaging_is_active_member(conversation_id)
  );

DROP POLICY IF EXISTS messaging_messages_select ON public.messaging_messages;
DROP POLICY IF EXISTS messaging_messages_select_all_member ON public.messaging_messages;
-- Active members can see message rows including redacted placeholders (body handled in app).
CREATE POLICY messaging_messages_select ON public.messaging_messages
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.messaging_is_active_member(conversation_id)
  );

DROP POLICY IF EXISTS messaging_versions_select ON public.messaging_message_versions;
CREATE POLICY messaging_versions_select ON public.messaging_message_versions
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND EXISTS (
      SELECT 1 FROM public.messaging_messages m
      WHERE m.id = message_id AND public.messaging_is_active_member(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS messaging_reactions_select ON public.messaging_message_reactions;
CREATE POLICY messaging_reactions_select ON public.messaging_message_reactions
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND EXISTS (
      SELECT 1 FROM public.messaging_messages m
      WHERE m.id = message_id AND public.messaging_is_active_member(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS messaging_receipts_select ON public.messaging_message_receipts;
CREATE POLICY messaging_receipts_select ON public.messaging_message_receipts
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.messaging_messages m
      WHERE m.id = message_id AND public.messaging_is_active_member(m.conversation_id)
    ))
  );

DROP POLICY IF EXISTS messaging_attachments_select ON public.messaging_attachments;
CREATE POLICY messaging_attachments_select ON public.messaging_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.messaging_is_active_member(conversation_id)
  );

DROP POLICY IF EXISTS messaging_record_links_select ON public.messaging_record_links;
CREATE POLICY messaging_record_links_select ON public.messaging_record_links
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.messaging_is_active_member(conversation_id)
  );

DROP POLICY IF EXISTS messaging_prefs_own ON public.messaging_notification_preferences;
CREATE POLICY messaging_prefs_own ON public.messaging_notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_company_member(company_id))
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(company_id));

DROP POLICY IF EXISTS messaging_blocks_own ON public.messaging_user_blocks;
CREATE POLICY messaging_blocks_own ON public.messaging_user_blocks
  FOR ALL TO authenticated
  USING (blocker_user_id = auth.uid() AND public.is_company_member(company_id))
  WITH CHECK (blocker_user_id = auth.uid() AND public.is_company_member(company_id));

DROP POLICY IF EXISTS messaging_starred_own ON public.messaging_starred_messages;
CREATE POLICY messaging_starred_own ON public.messaging_starred_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_company_member(company_id))
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(company_id));

DROP POLICY IF EXISTS messaging_audit_select ON public.messaging_audit_events;
CREATE POLICY messaging_audit_select ON public.messaging_audit_events
  FOR SELECT TO authenticated
  USING (public.has_company_permission(company_id, 'messaging.view_audit'));

DROP POLICY IF EXISTS messaging_outbox_select ON public.messaging_outbox_events;
CREATE POLICY messaging_outbox_select ON public.messaging_outbox_events
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.messaging_is_active_member(conversation_id)
  );

DROP POLICY IF EXISTS messaging_retention_select ON public.messaging_retention_policies;
CREATE POLICY messaging_retention_select ON public.messaging_retention_policies
  FOR SELECT TO authenticated
  USING (
    public.has_company_permission(company_id, 'messaging.manage_retention')
    OR public.has_company_permission(company_id, 'messaging.view_audit')
  );

DROP POLICY IF EXISTS messaging_moderation_select ON public.messaging_moderation_events;
CREATE POLICY messaging_moderation_select ON public.messaging_moderation_events
  FOR SELECT TO authenticated
  USING (public.has_company_permission(company_id, 'messaging.view_audit'));

DROP POLICY IF EXISTS messaging_invitations_select ON public.messaging_invitations;
CREATE POLICY messaging_invitations_select ON public.messaging_invitations
  FOR SELECT TO authenticated
  USING (
    public.has_company_permission(company_id, 'messaging.invite_external')
    OR public.has_company_permission(company_id, 'messaging.manage_external')
    OR public.messaging_is_active_member(conversation_id)
  );

GRANT SELECT ON public.messaging_settings TO authenticated;
GRANT SELECT ON public.messaging_conversations TO authenticated;
GRANT SELECT ON public.messaging_conversation_members TO authenticated;
GRANT SELECT ON public.messaging_messages TO authenticated;
GRANT SELECT ON public.messaging_message_versions TO authenticated;
GRANT SELECT ON public.messaging_message_reactions TO authenticated;
GRANT SELECT ON public.messaging_message_receipts TO authenticated;
GRANT SELECT ON public.messaging_attachments TO authenticated;
GRANT SELECT ON public.messaging_record_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_user_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_starred_messages TO authenticated;
GRANT SELECT ON public.messaging_audit_events TO authenticated;
GRANT SELECT ON public.messaging_outbox_events TO authenticated;
GRANT SELECT ON public.messaging_retention_policies TO authenticated;
GRANT SELECT ON public.messaging_moderation_events TO authenticated;
GRANT SELECT ON public.messaging_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messaging_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.messaging_ensure_settings(_company_id UUID)
RETURNS public.messaging_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.messaging_settings;
BEGIN
  INSERT INTO public.messaging_settings (company_id, enabled)
  VALUES (_company_id, false)
  ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO _row FROM public.messaging_settings WHERE company_id = _company_id;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_create_dm(
  _company_id UUID,
  _peer_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _key TEXT;
  _conversation_id UUID;
  _settings public.messaging_settings;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _peer_user_id IS NULL OR _peer_user_id = _uid THEN
    RAISE EXCEPTION 'invalid peer';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.create') THEN
    RAISE EXCEPTION 'missing messaging.create';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _peer_user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'peer not an active member';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.messaging_user_blocks b
    WHERE b.company_id = _company_id
      AND (
        (b.blocker_user_id = _uid AND b.blocked_user_id = _peer_user_id)
        OR (b.blocker_user_id = _peer_user_id AND b.blocked_user_id = _uid)
      )
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled OR NOT _settings.allow_internal THEN
    RAISE EXCEPTION 'messaging disabled';
  END IF;

  _key := public.messaging_dm_pair_key(_uid, _peer_user_id);

  SELECT id INTO _conversation_id
  FROM public.messaging_conversations
  WHERE company_id = _company_id AND dm_pair_key = _key;

  IF _conversation_id IS NOT NULL THEN
    INSERT INTO public.messaging_conversation_members (
      company_id, conversation_id, participant_kind, user_id, member_role, status
    )
    VALUES
      (_company_id, _conversation_id, 'member', _uid, 'member', 'active'),
      (_company_id, _conversation_id, 'member', _peer_user_id, 'member', 'active')
    ON CONFLICT DO NOTHING;
    UPDATE public.messaging_conversation_members
    SET status = 'active', left_at = NULL
    WHERE conversation_id = _conversation_id
      AND user_id IN (_uid, _peer_user_id)
      AND status <> 'active';
    RETURN _conversation_id;
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, dm_pair_key, created_by
  ) VALUES (
    _company_id, 'dm', 'internal', _key, _uid
  ) RETURNING id INTO _conversation_id;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES
    (_company_id, _conversation_id, 'member', _uid, 'member', 'active'),
    (_company_id, _conversation_id, 'member', _peer_user_id, 'member', 'active');

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.create_dm', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('peer', _peer_user_id)
  );
  RETURN _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_create_group(
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
    RAISE EXCEPTION 'group messaging disabled';
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, title, description, created_by
  ) VALUES (
    _company_id, 'group', 'internal', btrim(_title), NULLIF(btrim(COALESCE(_description, '')), ''), _uid
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
        ) VALUES (_company_id, _conversation_id, 'member', _peer, 'member', 'active')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.create_group', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('title', btrim(_title))
  );
  RETURN _conversation_id;
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

  -- Notify other active members via Action Center (minimal preview; not a formal approval).
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

CREATE OR REPLACE FUNCTION public.messaging_mark_read(
  _company_id UUID,
  _conversation_id UUID,
  _seq BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid) THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_conversations c
    WHERE c.id = _conversation_id AND c.company_id = _company_id
  ) THEN RETURN false; END IF;

  UPDATE public.messaging_conversation_members
  SET last_read_seq = GREATEST(last_read_seq, COALESCE(_seq, 0))
  WHERE conversation_id = _conversation_id AND user_id = _uid AND status = 'active';

  INSERT INTO public.messaging_message_receipts (company_id, message_id, user_id, read_at)
  SELECT m.company_id, m.id, _uid, now()
  FROM public.messaging_messages m
  WHERE m.conversation_id = _conversation_id
    AND m.seq <= COALESCE(_seq, 0)
    AND m.author_user_id IS DISTINCT FROM _uid
  ON CONFLICT (message_id, user_id) DO UPDATE
  SET read_at = COALESCE(public.messaging_message_receipts.read_at, excluded.read_at);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_unread_count(_company_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN c.last_message_at IS NULL THEN 0
      WHEN COALESCE(
        (SELECT MAX(m.seq) FROM public.messaging_messages m WHERE m.conversation_id = mem.conversation_id),
        0
      ) > mem.last_read_seq THEN 1
      ELSE 0
    END
  ), 0)::integer
  FROM public.messaging_conversation_members mem
  JOIN public.messaging_conversations c ON c.id = mem.conversation_id
  WHERE mem.company_id = _company_id
    AND mem.user_id = auth.uid()
    AND mem.status = 'active'
    AND mem.is_archived = false
    AND c.company_id = _company_id;
$$;

CREATE OR REPLACE FUNCTION public.messaging_open_record_discussion(
  _company_id UUID,
  _record_type TEXT,
  _record_id UUID,
  _visibility TEXT DEFAULT 'internal',
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
  _conversation_id UUID;
  _settings public.messaging_settings;
  _vis TEXT := COALESCE(_visibility, 'internal');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.link_records') THEN
    RAISE EXCEPTION 'missing messaging.link_records';
  END IF;
  IF _record_type IS NULL OR _record_id IS NULL THEN RAISE EXCEPTION 'record required'; END IF;
  IF _vis NOT IN ('internal', 'restricted_management', 'hr_private', 'customer', 'vendor', 'accountant', 'advisor') THEN
    RAISE EXCEPTION 'invalid visibility';
  END IF;
  IF _vis IN ('customer', 'vendor') AND NOT public.has_company_permission(_company_id, 'messaging.manage_external') THEN
    RAISE EXCEPTION 'external visibility requires messaging.manage_external';
  END IF;

  _settings := public.messaging_ensure_settings(_company_id);
  IF NOT _settings.enabled THEN RAISE EXCEPTION 'messaging disabled'; END IF;

  SELECT rl.conversation_id INTO _conversation_id
  FROM public.messaging_record_links rl
  JOIN public.messaging_conversations c ON c.id = rl.conversation_id
  WHERE rl.company_id = _company_id
    AND rl.record_type = _record_type
    AND rl.record_id = _record_id
    AND c.visibility = _vis
  LIMIT 1;

  IF _conversation_id IS NOT NULL THEN
    INSERT INTO public.messaging_conversation_members (
      company_id, conversation_id, participant_kind, user_id, member_role, status
    ) VALUES (_company_id, _conversation_id, 'member', _uid, 'member', 'active')
    ON CONFLICT DO NOTHING;
    UPDATE public.messaging_conversation_members
    SET status = 'active', left_at = NULL
    WHERE conversation_id = _conversation_id AND user_id = _uid;
    RETURN _conversation_id;
  END IF;

  INSERT INTO public.messaging_conversations (
    company_id, conversation_type, visibility, title, created_by
  ) VALUES (
    _company_id, 'record', _vis,
    COALESCE(NULLIF(btrim(_title), ''), _record_type || ' discussion'),
    _uid
  ) RETURNING id INTO _conversation_id;

  INSERT INTO public.messaging_conversation_members (
    company_id, conversation_id, participant_kind, user_id, member_role, status
  ) VALUES (_company_id, _conversation_id, 'member', _uid, 'owner', 'active');

  INSERT INTO public.messaging_record_links (
    company_id, conversation_id, record_type, record_id, deep_link_path, created_by
  ) VALUES (
    _company_id, _conversation_id, _record_type, _record_id, _deep_link_path, _uid
  );

  PERFORM public.messaging_write_audit(
    _company_id, 'conversation.open_record', 'messaging_conversations', _conversation_id::text,
    jsonb_build_object('record_type', _record_type, 'record_id', _record_id, 'visibility', _vis)
  );
  RETURN _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_update_membership(
  _company_id UUID,
  _conversation_id UUID,
  _action TEXT,
  _muted_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF NOT public.messaging_is_active_member(_conversation_id, _uid)
     AND _action NOT IN ('unarchive') THEN
    -- allow unarchive of previously archived membership
    IF NOT EXISTS (
      SELECT 1 FROM public.messaging_conversation_members
      WHERE conversation_id = _conversation_id AND user_id = _uid
    ) THEN RETURN false; END IF;
  END IF;

  IF _action = 'mute' THEN
    UPDATE public.messaging_conversation_members
    SET muted_until = COALESCE(_muted_until, now() + interval '100 years')
    WHERE conversation_id = _conversation_id AND user_id = _uid;
  ELSIF _action = 'unmute' THEN
    UPDATE public.messaging_conversation_members
    SET muted_until = NULL
    WHERE conversation_id = _conversation_id AND user_id = _uid;
  ELSIF _action = 'archive' THEN
    UPDATE public.messaging_conversation_members
    SET is_archived = true
    WHERE conversation_id = _conversation_id AND user_id = _uid;
  ELSIF _action = 'unarchive' THEN
    UPDATE public.messaging_conversation_members
    SET is_archived = false
    WHERE conversation_id = _conversation_id AND user_id = _uid;
  ELSIF _action = 'star' THEN
    UPDATE public.messaging_conversation_members
    SET is_starred = true
    WHERE conversation_id = _conversation_id AND user_id = _uid;
  ELSIF _action = 'unstar' THEN
    UPDATE public.messaging_conversation_members
    SET is_starred = false
    WHERE conversation_id = _conversation_id AND user_id = _uid;
  ELSIF _action = 'leave' THEN
    UPDATE public.messaging_conversation_members
    SET status = 'left', left_at = now()
    WHERE conversation_id = _conversation_id AND user_id = _uid AND status = 'active';
    UPDATE public.messaging_conversations
    SET channel_epoch = channel_epoch + 1
    WHERE id = _conversation_id;
  ELSE
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_set_enabled(
  _company_id UUID,
  _enabled BOOLEAN
)
RETURNS public.messaging_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.messaging_settings;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'messaging.manage_settings') THEN
    RAISE EXCEPTION 'missing messaging.manage_settings';
  END IF;
  _row := public.messaging_ensure_settings(_company_id);
  UPDATE public.messaging_settings
  SET enabled = COALESCE(_enabled, false),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE company_id = _company_id
  RETURNING * INTO _row;
  PERFORM public.messaging_write_audit(
    _company_id, 'settings.set_enabled', 'messaging_settings', _company_id::text,
    jsonb_build_object('enabled', _enabled)
  );
  RETURN _row;
END;
$$;

-- Enable for demo companies so local QA can exercise messaging without manual settings.
INSERT INTO public.messaging_settings (company_id, enabled, allow_customer, allow_vendor)
SELECT c.id, true, true, true
FROM public.companies c
WHERE c.is_demo IS TRUE
ON CONFLICT (company_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    allow_customer = EXCLUDED.allow_customer,
    allow_vendor = EXCLUDED.allow_vendor,
    updated_at = now();

-- Storage bucket for messaging attachments (private).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'messaging-attachments',
      'messaging-attachments',
      false,
      20971520,
      ARRAY[
        'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
        'text/plain', 'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.messaging_is_enabled(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_is_active_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_create_dm(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_create_group(UUID, TEXT, TEXT, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_send_message(UUID, UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_mark_read(UUID, UUID, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_unread_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_open_record_discussion(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_update_membership(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_set_enabled(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.messaging_ensure_settings(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.messaging_is_enabled(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_is_active_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_create_dm(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_create_group(UUID, TEXT, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_send_message(UUID, UUID, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_mark_read(UUID, UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_unread_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_open_record_discussion(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_update_membership(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_set_enabled(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_ensure_settings(UUID) TO authenticated;
