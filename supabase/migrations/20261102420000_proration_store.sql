-- READY-TO-APPLY. Not applied. Stores a calculated proration. It cannot record a provider call.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_record_proration(uuid, integer, text);
--   DROP TABLE IF EXISTS public.billing_prorations;

CREATE TABLE public.billing_prorations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  proration_minor integer NOT NULL,
  provider_called boolean NOT NULL DEFAULT false CHECK (provider_called = false),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_prorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_prorations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_record_proration(
  _company_id uuid, _proration_minor integer, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _proration_minor IS NULL OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record an integer proration and a reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.billing_prorations (company_id, proration_minor, created_by)
  VALUES (_company_id, _proration_minor, auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('proration.record', 'company', _company_id::text, NULL,
    jsonb_build_object('proration', _proration_minor, 'providerCalled', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_proration(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_proration(uuid, integer, text) TO authenticated;
