-- READY-TO-APPLY. Not applied. Delivery outcomes only. No request or response body is stored.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_list_webhook_deliveries();
--   DROP TABLE IF EXISTS public.platform_webhook_deliveries;

CREATE TABLE public.platform_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  event_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('delivered', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

ALTER TABLE public.platform_webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_webhook_deliveries FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_list_webhook_deliveries()
RETURNS TABLE (id uuid, provider text, event_id text, status text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.require_platform('integrations.view');
  RETURN QUERY
  SELECT d.id, d.provider, d.event_id, d.status, d.created_at
  FROM public.platform_webhook_deliveries d
  ORDER BY d.created_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_webhook_deliveries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_webhook_deliveries() TO authenticated;
