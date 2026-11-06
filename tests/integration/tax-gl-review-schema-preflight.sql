-- Read-only preflight for the tax GL review migration.
-- Run on staging before 20261106134000_tax_gl_review_sessions.sql.
DO $$
DECLARE
  missing text := '';
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('companies','id'), ('accounts','id'), ('accounts','company_id'),
    ('company_members','company_id'), ('company_members','user_id'),
    ('company_members','status')
  ) AS required(table_name,column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=item.table_name
        AND column_name=item.column_name
    ) THEN
      missing := missing || 'public.' || item.table_name ||
        '.' || item.column_name || E'\n';
    END IF;
  END LOOP;

  IF to_regclass('auth.users') IS NULL THEN
    missing := missing || 'auth.users' || E'\n';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    missing := missing || 'auth.uid()' || E'\n';
  END IF;
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    missing := missing || 'public.is_company_member(uuid)' || E'\n';
  END IF;
  IF to_regprocedure('public.has_company_permission(uuid,text)') IS NULL THEN
    missing := missing || 'public.has_company_permission(uuid,text)' || E'\n';
  END IF;
  IF missing<>'' THEN
    RAISE EXCEPTION 'Tax GL review migration prerequisites missing:%',
      E'\n'||missing;
  END IF;

  RAISE NOTICE 'PASS: Tax GL review prerequisites exist';
END $$;
