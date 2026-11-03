-- Extend the aal2 restrictive policy (20261029101434_mfa_aal2_rls_enforcement) to the
-- platform/billing tables added by 20261102190000–20261103000000. Idempotent.
SELECT private.apply_mfa_policies();
