-- READY-TO-APPLY. Not applied. Stores a fee that was already supplied. It does not call a provider or invent a zero.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_record_provider_fee(uuid, text, text, text, integer, integer, text);
--   DROP TABLE IF EXISTS public.billing_provider_fees;

CREATE TABLE public.billing_provider_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  provider_charge_id text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  gross_minor integer NOT NULL CHECK (gross_minor >= 0),
  fee_minor integer NOT NULL CHECK (fee_minor >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_charge_id)
);

ALTER TABLE public.billing_provider_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_provider_fees FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_record_provider_fee(
  _company_id uuid,
  _provider text,
  _provider_charge_id text,
  _currency text,
  _gross_minor integer,
  _fee_minor integer,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _provider NOT IN ('stripe', 'razorpay') OR length(trim(coalesce(_provider_charge_id, ''))) < 1 THEN
    RAISE EXCEPTION 'Name the provider charge';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter code';
  END IF;
  IF _gross_minor IS NULL OR _fee_minor IS NULL OR _gross_minor < 0 OR _fee_minor < 0 THEN
    RAISE EXCEPTION 'Gross and fee must be stored minor units';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.billing_provider_fees (
    company_id, provider, provider_charge_id, currency, gross_minor, fee_minor, created_by
  ) VALUES (
    _company_id, _provider, trim(_provider_charge_id), _currency, _gross_minor, _fee_minor, auth.uid()
  ) RETURNING id INTO _id;
  PERFORM private.platform_log(
    'fee.record', 'company', _company_id::text, NULL,
    jsonb_build_object('gross', _gross_minor, 'fee', _fee_minor), trim(_reason)
  );
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_provider_fee(uuid, text, text, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_provider_fee(uuid, text, text, text, integer, integer, text) TO authenticated;
