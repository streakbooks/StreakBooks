-- Extend the aal2 restrictive policy (20261029101434_mfa_aal2_rls_enforcement) to RLS
-- tables created since, e.g. fixed_asset_import_refs. Idempotent.
SELECT private.apply_mfa_policies();
