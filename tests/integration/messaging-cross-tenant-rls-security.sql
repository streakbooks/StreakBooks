-- Messaging cross-tenant isolation smoke script (manual / CI postgres harness).
-- Does not weaken RLS. Expect denials for foreign company reads.
-- Requires two seeded companies with distinct members.

-- Example assertions (adapt IDs in harness):
-- 1) User A in company 1 cannot SELECT messaging_messages for company 2 conversation.
-- 2) Removed member cannot SELECT after status=removed.
-- 3) messaging_send_message with forged company_id fails.
-- 4) Portal customer conversation invisible to another portal contact.

DO $$
BEGIN
  RAISE NOTICE 'messaging-cross-tenant-rls-security: structural checks';

  IF to_regclass('public.messaging_conversations') IS NULL THEN
    RAISE EXCEPTION 'messaging_conversations missing — apply messaging migrations first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messaging_messages'
  ) THEN
    RAISE EXCEPTION 'messaging_messages RLS policies missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'messaging_send_message'
  ) THEN
    RAISE EXCEPTION 'messaging_send_message RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'messaging_add_internal_members'
  ) THEN
    RAISE EXCEPTION 'messaging_add_internal_members RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'messaging_set_collaboration_flags'
  ) THEN
    RAISE EXCEPTION 'messaging_set_collaboration_flags RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'messaging_mark_unread'
  ) THEN
    RAISE EXCEPTION 'messaging_mark_unread RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'messaging_block_user'
  ) THEN
    RAISE EXCEPTION 'messaging_block_user RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'messaging_set_retention_days'
  ) THEN
    RAISE EXCEPTION 'messaging_set_retention_days RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'communication_send_claims_kind_check'
      AND pg_get_constraintdef(oid) ILIKE '%messaging_digest%'
  ) THEN
    RAISE EXCEPTION 'messaging_digest claim kind missing from communication_send_claims';
  END IF;

  RAISE NOTICE 'messaging security structural checks passed';
END $$;
