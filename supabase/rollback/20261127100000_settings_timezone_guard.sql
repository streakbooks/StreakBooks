-- Rollback for the company time-zone validation trigger. Existing company rows are untouched.
DROP TRIGGER IF EXISTS companies_validate_timezone ON public.companies;
DROP FUNCTION IF EXISTS public.validate_company_timezone();
