DROP FUNCTION IF EXISTS public.nonprofit_my_donor_statement(DATE, DATE);
DROP FUNCTION IF EXISTS public.nonprofit_record_donor_statements(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.nonprofit_record_donor_statement(UUID, DATE, DATE, UUID, TEXT);
DROP FUNCTION IF EXISTS public.nonprofit_donor_statement(UUID, DATE, DATE, UUID);
DROP FUNCTION IF EXISTS public.np_donor_statement_document(UUID, DATE, DATE, UUID, TEXT);
DROP FUNCTION IF EXISTS public.np_organisation_heading(UUID);
DROP TABLE IF EXISTS public.nonprofit_statement_runs;
