-- Basic Global Payroll Batch 1: foundation security smoke checks.
-- Run against an isolated Postgres with StreakBooks migrations applied.
-- Expects helper roles/fixtures from the standard workflow harness when available.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.payroll_settings') IS NULL THEN
    RAISE EXCEPTION 'payroll_settings missing — apply 20261105153212_basic_global_payroll_foundation.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'journal_source_type' AND e.enumlabel = 'payroll'
  ) THEN
    RAISE EXCEPTION 'journal_source_type.payroll missing — apply 20261105153211_journal_source_type_payroll.sql';
  END IF;
END $$;

-- Direct client writes must remain revoked for authenticated.
DO $$
DECLARE
  _has_insert BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'payroll_settings'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) INTO _has_insert;
  IF _has_insert THEN
    RAISE EXCEPTION 'authenticated must not INSERT payroll_settings directly';
  END IF;
END $$;

-- Permission seeds exist for payroll.view / payroll.settings.edit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'owner' AND permission = 'payroll.settings.edit'
  ) THEN
    RAISE EXCEPTION 'owner payroll.settings.edit seed missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = 'staff' AND permission = 'payroll.settings.edit'
  ) THEN
    RAISE EXCEPTION 'staff must not receive payroll.settings.edit by default';
  END IF;
END $$;

-- RPC execute grants are present for authenticated.
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.get_payroll_settings_page(uuid)', 'execute') THEN
    RAISE EXCEPTION 'get_payroll_settings_page execute grant missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.save_payroll_settings(uuid, jsonb)', 'execute') THEN
    RAISE EXCEPTION 'save_payroll_settings execute grant missing';
  END IF;
END $$;

-- Payment details must never be directly readable by authenticated clients.
DO $$
DECLARE
  _has_select BOOLEAN;
BEGIN
  IF to_regclass('public.payroll_employee_payment_details') IS NULL THEN
    RAISE EXCEPTION 'payroll_employee_payment_details missing — apply 20261105160709_basic_global_payroll_employees.sql';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'payroll_employee_payment_details'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ) INTO _has_select;
  IF _has_select THEN
    RAISE EXCEPTION 'authenticated must not have SELECT on payroll_employee_payment_details';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payroll_employee_payment_details'
      AND policyname = 'No direct read of employee payment details'
  ) THEN
    RAISE EXCEPTION 'payment details deny SELECT policy missing';
  END IF;
END $$;

-- Payslip and payment tables are org-scoped via payroll.view (when present).
DO $$
BEGIN
  IF to_regclass('public.payroll_payslips') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'payroll_payslips'
        AND policyname = 'Payroll viewers can read payslips'
    ) THEN
      RAISE EXCEPTION 'payroll_payslips RLS policy missing';
    END IF;
  END IF;
  IF to_regclass('public.payroll_payments') IS NOT NULL THEN
    IF NOT has_function_privilege('authenticated', 'public.record_payroll_payment(jsonb)', 'execute') THEN
      RAISE EXCEPTION 'record_payroll_payment execute grant missing';
    END IF;
    IF has_function_privilege('anon', 'public.export_payroll_bank_csv_rows(uuid, uuid)', 'execute') THEN
      RAISE EXCEPTION 'anon must not execute export_payroll_bank_csv_rows';
    END IF;
  END IF;
END $$;

ROLLBACK;
