-- Fair confirmation polling: old unresolved messages cannot starve newer accepted jobs.
ALTER TABLE public.report_deliveries ADD COLUMN next_status_check_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX report_deliveries_confirmation_idx ON public.report_deliveries(next_status_check_at,id) WHERE status='accepted';
CREATE FUNCTION public.claim_report_delivery_confirmations(_limit integer DEFAULT 25)
RETURNS TABLE(id uuid,provider_id text) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH due AS (
  SELECT d.id FROM public.report_deliveries d WHERE d.status='accepted' AND d.provider_id IS NOT NULL AND d.next_status_check_at<=now()
  ORDER BY d.next_status_check_at,d.id LIMIT LEAST(GREATEST(_limit,1),100) FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.report_deliveries d SET next_status_check_at=now()+interval '1 minute' FROM due WHERE d.id=due.id
  RETURNING d.id,d.provider_id
 ) SELECT * FROM claimed;
$$;
REVOKE ALL ON FUNCTION public.claim_report_delivery_confirmations(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_delivery_confirmations(integer) TO service_role;
