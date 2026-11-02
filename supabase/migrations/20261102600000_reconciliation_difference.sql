-- READY-TO-APPLY. Not applied. A mismatch cannot be stored with a zero difference.
-- A missing provider list is still not stored. This function does not call a provider.
-- Reverse: drop constraint billing_provider_reconciliations_difference, restore the previous
-- table check, then reapply public.platform_record_provider_reconciliation
-- from 20261102410000_provider_reconciliation.sql.

DO $$
DECLARE _name text;
BEGIN
  SELECT c.conname INTO _name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.billing_provider_reconciliations'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%difference_minor = 0%';
  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.billing_provider_reconciliations DROP CONSTRAINT %I', _name);
  END IF;
END $$;

ALTER TABLE public.billing_provider_reconciliations
  ADD CONSTRAINT billing_provider_reconciliations_difference CHECK (
    (state = 'match' AND difference_minor = 0)
    OR (state = 'mismatch' AND difference_minor IS DISTINCT FROM 0)
  );

CREATE OR REPLACE FUNCTION public.platform_record_provider_reconciliation(
  _company_id uuid, _state text, _difference_minor integer, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _state NOT IN ('match', 'mismatch') OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A missing provider list is not stored';
  END IF;
  IF _state = 'match' AND _difference_minor IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'A match has a zero difference';
  END IF;
  IF _state = 'mismatch' AND _difference_minor = 0 THEN
    RAISE EXCEPTION 'A mismatch cannot have a zero difference';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.billing_provider_reconciliations (company_id, state, difference_minor, created_by)
  VALUES (_company_id, _state, _difference_minor, auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('provider.reconcile', 'company', _company_id::text, NULL,
    jsonb_build_object('state', _state, 'difference', _difference_minor), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_provider_reconciliation(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_provider_reconciliation(uuid, text, integer, text) TO authenticated;
