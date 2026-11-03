-- READY-TO-APPLY. Not applied. A payment source is recorded once. A repeat does not add to the total.
-- Reverse: reapply public.platform_record_lifetime_payment from 20261102360000_lifetime_value.sql.

CREATE OR REPLACE FUNCTION public.platform_record_lifetime_payment(
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
  IF EXISTS (
    SELECT 1 FROM public.billing_lifetime_payments
    WHERE company_id = _company_id AND source_id = trim(_source_id)
  ) THEN
    RAISE EXCEPTION 'That payment is already recorded';
  END IF;
  INSERT INTO public.billing_lifetime_payments (company_id, currency, amount_minor, source_id, created_by)
  VALUES (_company_id, _currency, _amount_minor, trim(_source_id), auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('lifetime.record', 'company', _company_id::text, NULL,
    jsonb_build_object('amount', _amount_minor, 'currency', _currency), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_lifetime_payment(uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_lifetime_payment(uuid, text, integer, text, text) TO authenticated;
