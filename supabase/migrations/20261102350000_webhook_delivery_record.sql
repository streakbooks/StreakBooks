-- READY-TO-APPLY. Not applied. Records a delivery outcome. The request body is not stored.
-- The live webhook handler does not call this until the table from 20261102210000 is applied.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_record_webhook_delivery(text, text, text, text);

CREATE FUNCTION public.platform_record_webhook_delivery(
  _provider text, _event_id text, _status text, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('integrations.manage');
  IF _provider NOT IN ('stripe', 'razorpay') OR _status NOT IN ('delivered', 'failed') THEN
    RAISE EXCEPTION 'Name the provider and the outcome';
  END IF;
  IF length(trim(coalesce(_event_id, ''))) < 1 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the event and record a reason';
  END IF;
  INSERT INTO public.platform_webhook_deliveries (provider, event_id, status)
  VALUES (_provider, trim(_event_id), _status)
  ON CONFLICT (provider, event_id) DO UPDATE SET status = EXCLUDED.status
  RETURNING id INTO _id;
  PERFORM private.platform_log(
    'webhook.delivery', 'platform_webhook_delivery', _id::text, NULL,
    jsonb_build_object('status', _status), trim(_reason)
  );
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_webhook_delivery(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_webhook_delivery(text, text, text, text) TO authenticated;
