-- READY-TO-APPLY. Not applied. Updating a delivery outcome records the previous status.
-- The live webhook handler still does not call this. No request body is stored.
-- Reverse: reapply public.platform_record_webhook_delivery from 20261102350000_webhook_delivery_record.sql.

CREATE OR REPLACE FUNCTION public.platform_record_webhook_delivery(
  _provider text, _event_id text, _status text, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _previous text;
BEGIN
  PERFORM private.require_platform('integrations.manage');
  IF _provider NOT IN ('stripe', 'razorpay') OR _status NOT IN ('delivered', 'failed') THEN
    RAISE EXCEPTION 'Name the provider and the outcome';
  END IF;
  IF length(trim(coalesce(_event_id, ''))) < 1 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the event and record a reason';
  END IF;
  SELECT d.id, d.status INTO _id, _previous
  FROM public.platform_webhook_deliveries d
  WHERE d.provider = _provider AND d.event_id = trim(_event_id)
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.platform_webhook_deliveries SET status = _status WHERE id = _id;
  ELSE
    INSERT INTO public.platform_webhook_deliveries (provider, event_id, status)
    VALUES (_provider, trim(_event_id), _status)
    RETURNING id INTO _id;
  END IF;
  PERFORM private.platform_log(
    'webhook.delivery', 'platform_webhook_delivery', _id::text,
    CASE WHEN _previous IS NULL THEN NULL ELSE jsonb_build_object('status', _previous) END,
    jsonb_build_object('status', _status), trim(_reason)
  );
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_record_webhook_delivery(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_webhook_delivery(text, text, text, text) TO authenticated;
