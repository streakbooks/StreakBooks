-- Self-owned communication history; delivery audit inserts use the server-only
-- Supabase service role and cannot be forged through an authenticated RPC.
DROP POLICY IF EXISTS communication_own_outbox_read ON public.email_outbox;
CREATE POLICY communication_own_outbox_read ON public.email_outbox
FOR SELECT TO authenticated
USING (
  entity_type = 'company'
  AND sent_by = (SELECT auth.uid())
  AND public.is_company_member(company_id)
);
