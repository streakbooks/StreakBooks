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

  RAISE NOTICE 'messaging security structural checks passed';
END $$;
