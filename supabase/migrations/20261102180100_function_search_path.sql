-- READY-TO-APPLY. Not applied to the hosted project.
-- These nine functions had no fixed search_path. They are not security definer.
-- Reverse: ALTER FUNCTION public.<name>(<args>) RESET search_path;

ALTER FUNCTION public.is_valid_iban(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.ops_mask_identifier(text, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.portal_file_is_valid(bytea, text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.portal_line_amounts(numeric, bigint, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.portal_mask_account(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_base_currency_change_after_post() SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_exchange_rate_mutate() SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_is_demo_downgrade() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sales_derive_invoice_status(bigint, bigint, bigint) SET search_path = pg_catalog, public;
