-- Scheduled, opt-in email digests. Access to confidential alert content is revalidated.
-- This migration is additive. Cron and provider credentials must be configured separately.
ALTER TABLE public.communication_send_claims DROP CONSTRAINT IF EXISTS communication_send_claims_kind_check;
ALTER TABLE public.communication_send_claims
 ADD CONSTRAINT communication_send_claims_kind_check
 CHECK (kind IN ('test_email','digest_manual','digest_scheduled'));

CREATE TABLE IF NOT EXISTS public.communication_scheduled_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient text NOT NULL,
 frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
 scheduled_at timestamptz NOT NULL,
 alert_count integer NOT NULL CHECK (alert_count BETWEEN 1 AND 25),
 provider text NOT NULL DEFAULT 'resend',
 provider_message_id text,
 state text NOT NULL CHECK (state IN ('accepted','failed')),
 error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communication_scheduled_deliveries_recent_idx
 ON public.communication_scheduled_deliveries(company_id,user_id,created_at DESC);
ALTER TABLE public.communication_scheduled_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_scheduled_deliveries_recipient ON public.communication_scheduled_deliveries;
CREATE POLICY communication_scheduled_deliveries_recipient
 ON public.communication_scheduled_deliveries FOR SELECT TO authenticated
 USING (user_id=(select auth.uid()) AND public.is_company_member(company_id));
REVOKE ALL ON public.communication_scheduled_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.communication_scheduled_deliveries TO authenticated;
GRANT ALL ON public.communication_scheduled_deliveries TO service_role;

-- Do not trust stored notification records alone: recheck source status, membership,
-- effective role rights (including grants/denials), and user preferences at send time.
CREATE OR REPLACE FUNCTION private.communication_user_can(
 _company uuid,_user uuid,_permission text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.company_members m WHERE m.company_id=_company AND m.user_id=_user AND m.status='active'
   AND (
     EXISTS (SELECT 1 FROM public.role_permissions rp
       WHERE rp.role=m.role AND rp.permission=_permission)
     OR EXISTS (SELECT 1 FROM public.member_permission_adjustments a
       WHERE a.company_id=_company AND a.user_id=_user AND a.permission=_permission AND a.effect='grant' AND m.role<>'owner')
   )
 ) AND NOT EXISTS (
    SELECT 1 FROM public.member_permission_adjustments a
      JOIN public.company_members m ON m.company_id=a.company_id AND m.user_id=a.user_id
    WHERE a.company_id=_company AND a.user_id=_user AND a.permission=_permission
      AND a.effect='deny' AND m.role<>'owner'
 ) AND NOT EXISTS (
    SELECT 1 FROM public.platform_user_controls u WHERE u.user_id=_user
      AND (u.status<>'active' OR u.require_mfa)
 );
$$;
REVOKE ALL ON FUNCTION private.communication_user_can(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.communication_user_can(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_scheduled_digest_items(_company uuid,_user uuid)
RETURNS TABLE (title text, body text, priority text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT n.title,n.body,n.priority
 FROM public.action_notifications n
 WHERE n.company_id=_company AND n.recipient_user_id=_user
   AND n.archived_at IS NULL AND n.resolved_at IS NULL
   AND EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=_company AND m.user_id=_user AND m.status='active')
   AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id=_company AND NOT c.is_demo)
   AND (
     n.priority='critical' OR n.category='system'
     OR coalesce((SELECT p.enabled FROM public.action_notification_preferences p
       WHERE p.company_id=_company AND p.recipient_user_id=_user AND p.category=n.category),true)
   )
   AND CASE n.category
     WHEN 'bill_approval' THEN
       private.communication_user_can(_company,_user,'purchases.authorise')
       AND EXISTS (SELECT 1 FROM public.purchase_bills b WHERE b.company_id=_company AND b.id=n.entity_id AND b.status='awaiting_approval')
     WHEN 'overdue_invoice' THEN
       private.communication_user_can(_company,_user,'sales.view')
       AND EXISTS (SELECT 1 FROM public.sales_invoices i WHERE i.company_id=_company AND i.id=n.entity_id
         AND i.status IN ('authorised','partly_paid') AND i.posted_journal_id IS NOT NULL
         AND i.due_date<(now() AT TIME ZONE (SELECT coalesce(nullif(c.timezone,''),'UTC') FROM public.companies c WHERE c.id=_company))::date
         AND i.total_minor-coalesce(i.amount_paid_minor,0)-coalesce(i.amount_credited_minor,0)>0)
     WHEN 'bank_reconciliation' THEN
       private.communication_user_can(_company,_user,'banking.view')
       AND EXISTS (SELECT 1 FROM public.bank_transactions t JOIN public.bank_accounts a
           ON a.id=t.bank_account_id AND a.company_id=t.company_id AND a.is_active
         WHERE t.company_id=_company AND t.bank_account_id=n.entity_id AND t.status IN ('uncategorised','matched'))
     WHEN 'document_request' THEN
       EXISTS (SELECT 1 FROM public.action_document_requests r
         WHERE r.id=n.entity_id AND r.company_id=_company AND r.requested_from=_user
           AND r.completed_at IS NULL AND r.cancelled_at IS NULL)
     WHEN 'system' THEN TRUE
     ELSE FALSE
   END
 ORDER BY CASE n.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
   WHEN 'medium' THEN 2 ELSE 3 END, n.created_at DESC LIMIT 25;
$$;
REVOKE ALL ON FUNCTION public.get_scheduled_digest_items(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduled_digest_items(uuid,uuid) TO service_role;

COMMENT ON FUNCTION public.get_scheduled_digest_items(uuid,uuid) IS
 'Service-only digest reader. Rechecks active membership, financial source state, current role rights and per-recipient category preferences.';
