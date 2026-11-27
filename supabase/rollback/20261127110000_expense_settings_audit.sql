-- Rollback for transactional expense-settings audit. Existing settings/audit rows are untouched.
DROP TRIGGER IF EXISTS expense_management_settings_audit ON public.expense_management_settings;
DROP FUNCTION IF EXISTS public.audit_expense_management_settings();
