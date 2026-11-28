-- Drop only objects introduced by 20261126200000_reminder_settings_audit.sql.
DROP TRIGGER IF EXISTS company_reminder_settings_audit ON public.company_reminder_settings;
DROP FUNCTION IF EXISTS public.audit_company_reminder_settings_change();
