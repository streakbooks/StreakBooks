-- READY-TO-APPLY. Not applied. Subscription payments already supplied. No rows means unavailable, not zero.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_lifetime_value(uuid);
--   DROP FUNCTION IF EXISTS public.platform_record_lifetime_payment(uuid, text, integer, text, text);
--   DROP TABLE IF EXISTS public.billing_lifetime_payments;

CREATE TABLE public.billing_lifetime_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  source_id text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_id)
);

ALTER TABLE public.billing_lifetime_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_lifetime_payments FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_record_lifetime_payment(
  _company_id uuid, _currency text, _amount_minor integer, _source_id text, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _currency !~ '^[A-Z]{3}$' OR length(trim(coalesce(_source_id, ''))) < 1 THEN
    RAISE EXCEPTION 'Name the currency and the payment';
  END IF;
  IF _amount_minor IS NULL OR _amount_minor < 0 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a non-negative amount and a reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.billing_lifetime_payments (company_id, currency, amount_minor, source_id, created_by)
  VALUES (_company_id, _currency, _amount_minor, trim(_source_id), auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('lifetime.record', 'company', _company_id::text, NULL,
    jsonb_build_object('amount', _amount_minor, 'currency', _currency), trim(_reason));
  RETURN _id;
END;
$$;

CREATE FUNCTION public.platform_lifetime_value(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _currencies integer; _total bigint; _currency text;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT count(DISTINCT currency), coalesce(sum(amount_minor), 0), min(currency)
  INTO _currencies, _total, _currency
  FROM public.billing_lifetime_payments WHERE company_id = _company_id;
  IF _currencies = 0 THEN
    RETURN jsonb_build_object('status', 'unavailable', 'minor', NULL, 'currency', NULL);
  END IF;
  IF _currencies > 1 THEN
    RETURN jsonb_build_object('status', 'unseparated', 'minor', NULL, 'currency', NULL);
  END IF;
  RETURN jsonb_build_object('status', 'stored', 'minor', _total, 'currency', _currency);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_lifetime_payment(uuid, text, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_lifetime_value(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_lifetime_payment(uuid, text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_lifetime_value(uuid) TO authenticated;
