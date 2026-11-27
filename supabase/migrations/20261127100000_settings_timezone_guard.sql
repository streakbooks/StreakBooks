-- Keep organisation time zones valid for all writes, including direct RPC/table
-- paths that do not pass through the application-level Intl validator.
CREATE OR REPLACE FUNCTION public.validate_company_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.timezone IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names AS zones
       WHERE zones.name = NEW.timezone
     ) THEN
    RAISE EXCEPTION 'Invalid organisation timezone' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_company_timezone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_validate_timezone ON public.companies;
CREATE TRIGGER companies_validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_company_timezone();
