-- Read-only postflight: review tables must be RLS-scoped and writes RPC-only.
-- Run after 20261106134000_tax_gl_review_sessions.sql.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'public.tax_gl_review_sessions',
    'public.tax_gl_review_events'
  ]) AS table_name LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
        AND c.relname=split_part(t.table_name,'.',2)
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Tax review RLS disabled: %', t.table_name;
    END IF;
    IF has_table_privilege('authenticated',t.table_name,'INSERT')
      OR has_table_privilege('authenticated',t.table_name,'UPDATE')
      OR has_table_privilege('authenticated',t.table_name,'DELETE')
      OR has_table_privilege('anon',t.table_name,'SELECT') THEN
      RAISE EXCEPTION 'Tax review privileges expose a write or anonymous read: %',
        t.table_name;
    END IF;
    IF NOT has_table_privilege('authenticated',t.table_name,'SELECT') THEN
      RAISE EXCEPTION 'Tax review table should permit authenticated RLS-scoped reads: %',
        t.table_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tax_gl_review_sessions'
      AND policyname='Read tax GL review sessions'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tax_gl_review_events'
      AND policyname='Read tax GL review events'
  ) THEN
    RAISE EXCEPTION 'Tax review read policies missing';
  END IF;

  IF has_function_privilege('anon',
    'public.save_tax_gl_review(uuid,date,date,text,uuid,uuid,text,text,uuid,text,integer)',
    'EXECUTE') OR NOT has_function_privilege('authenticated',
    'public.save_tax_gl_review(uuid,date,date,text,uuid,uuid,text,text,uuid,text,integer)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'Tax review RPC execute permission mismatch';
  END IF;
  RAISE NOTICE 'PASS: review RLS, read policies and RPC-only writes';
END $$;
