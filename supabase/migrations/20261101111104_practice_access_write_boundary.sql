-- All firm grant changes must include provenance, cleanup and audit atomically.
-- Existing SELECT policies remain; application and platform writes use authorized RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.firm_client_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.practice_tasks FROM PUBLIC;
