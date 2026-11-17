-- Production hardening: realtime outbox publication + force-closed external portal flags.
-- Additive. Safe to re-run.

-- Ensure clients can subscribe to durable outbox fan-out events.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'messaging_outbox_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_outbox_events;
    END IF;
  END IF;
END $$;

ALTER TABLE public.messaging_outbox_events REPLICA IDENTITY FULL;

-- Fail-closed: never leave customer/vendor portal messaging enabled without explicit unlock.
UPDATE public.messaging_settings
SET
  allow_customer = false,
  allow_vendor = false,
  updated_at = now()
WHERE allow_customer IS TRUE
   OR allow_vendor IS TRUE;
