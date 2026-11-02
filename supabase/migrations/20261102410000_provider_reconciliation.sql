-- READY-TO-APPLY. Not applied. Stores a comparison of charges already supplied.
-- A missing provider list is not stored. This function does not call a provider.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_record_provider_reconciliation(uuid, text, integer, text);
--   DROP TABLE IF EXISTS public.billing_provider_reconciliations;

CREATE TABLE public.billing_provider_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('match', 'mismatch')),
  difference_minor integer,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'match' AND difference_minor = 0)
    OR (state = 'mismatch')
  )
);

ALTER TABLE public.billing_provider_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_provider_reconciliations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_record_provider_reconciliation(
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
