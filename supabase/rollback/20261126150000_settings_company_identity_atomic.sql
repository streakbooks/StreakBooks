-- Rollback for 20261126150000_settings_company_identity_atomic.sql.
-- Drops only the new RPC; existing organisation and tax data are untouched.
DROP FUNCTION IF EXISTS public.save_company_identity_and_tax(uuid,jsonb,jsonb);
