-- Advisors AD-10 foundation security smoke checks.
-- Run against a Postgres with Advisors migrations AD-01…AD-10 applied.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.advisors_clients') IS NULL THEN
    RAISE EXCEPTION 'advisors_clients missing — apply Advisors management migration';
  END IF;
  IF to_regprocedure('public.platform_advisors_attach_checkout(uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'platform_advisors_attach_checkout missing';
  END IF;
  IF to_regprocedure('public.advisors_portal_home()') IS NULL THEN
    RAISE EXCEPTION 'advisors_portal_home missing — apply AD-09';
  END IF;
  IF to_regprocedure('public.advisors_reclaim_stale_reminders(interval)') IS NULL THEN
    RAISE EXCEPTION 'advisors_reclaim_stale_reminders missing — apply AD-10';
  END IF;
END $$;

-- Direct client writes must remain revoked for authenticated on Advisors CRM tables.
DO $$
DECLARE
  _has_insert BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'advisors_clients'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) INTO _has_insert;
  IF _has_insert THEN
    RAISE EXCEPTION 'authenticated must not INSERT advisors_clients directly';
  END IF;
END $$;

-- Platform / portal RPCs must not be executable by anon (explicit anon grants, not only PUBLIC).
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.platform_advisors_attach_checkout(uuid, uuid, text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute platform_advisors_attach_checkout';
  END IF;
  IF has_function_privilege('anon', 'public.advisors_portal_home()', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute advisors_portal_home';
  END IF;
  IF has_function_privilege('anon', 'public.advisors_claim_due_reminders(integer)', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute advisors_claim_due_reminders';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.platform_advisors_attach_checkout(uuid, uuid, text)', 'execute') THEN
    RAISE EXCEPTION 'authenticated must execute platform_advisors_attach_checkout';
  END IF;
END $$;

-- Public booking RPC remains available to anon (rate-limited in function body).
DO $$
BEGIN
  IF NOT has_function_privilege('anon', 'public.advisors_book_appointment(jsonb)', 'execute') THEN
    RAISE EXCEPTION 'anon must execute advisors_book_appointment';
  END IF;
  IF NOT has_function_privilege('anon', 'public.advisors_list_available_slots(date, text, uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must execute advisors_list_available_slots';
  END IF;
END $$;

ROLLBACK;
