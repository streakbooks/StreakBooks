-- Action Center workflows. Adds only additive tables/RPCs; never posts financial transactions.
-- Refresh runs as the current user, scoped to an active company membership and feature permissions.
CREATE TABLE IF NOT EXISTS public.action_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requested_from uuid NOT NULL REFERENCES auth.users(id),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 160),
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  attachment_id uuid REFERENCES public.document_attachments(id),
  CONSTRAINT action_document_requests_one_state CHECK (NOT (completed_at IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS action_document_requests_recipient_idx
 ON public.action_document_requests (company_id, requested_from, created_at DESC) WHERE completed_at IS NULL AND cancelled_at IS NULL;
ALTER TABLE public.action_document_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_document_requests_read ON public.action_document_requests;
CREATE POLICY action_document_requests_read ON public.action_document_requests
 FOR SELECT TO authenticated USING (
   public.is_company_member(company_id) AND (requested_by = (select auth.uid()) OR requested_from = (select auth.uid()))
 );
REVOKE ALL ON public.action_document_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.action_document_requests TO authenticated;
GRANT ALL ON public.action_document_requests TO service_role;

-- Explicit company-document request, not an inferred 'missing attachment' notification.
CREATE OR REPLACE FUNCTION public.create_action_document_request(
 _company_id uuid, _requested_from uuid, _subject text, _instructions text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id)
     OR NOT public.can_access_attachment(_company_id, 'company', 'manage') THEN
    RAISE EXCEPTION 'Not permitted to request company documents';
  END IF;
  IF _requested_from IS NULL OR _requested_from = auth.uid()
     OR NOT EXISTS (SELECT 1 FROM public.company_members
         WHERE company_id=_company_id AND user_id=_requested_from AND status='active') THEN
    RAISE EXCEPTION 'Choose another active team member';
  END IF;
  IF _subject IS NULL OR length(btrim(_subject)) NOT BETWEEN 3 AND 160
     OR length(coalesce(_instructions,'')) > 2000 THEN
    RAISE EXCEPTION 'Invalid document request';
  END IF;
  INSERT INTO public.action_document_requests
   (company_id, requested_by, requested_from, subject, instructions)
  VALUES (_company_id, auth.uid(), _requested_from, btrim(_subject), coalesce(_instructions,''))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_action_document_request(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_action_document_request(uuid,uuid,text,text) TO authenticated;

-- Completion requires a real company attachment uploaded by the recipient AFTER the request.
CREATE OR REPLACE FUNCTION public.complete_action_document_request(
 _request_id uuid, _attachment_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r public.action_document_requests%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.action_document_requests WHERE id=_request_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR _r.requested_from <> auth.uid()
    OR NOT public.is_company_member(_r.company_id)
    OR NOT public.can_access_attachment(_r.company_id, 'company', 'view')
    OR _r.completed_at IS NOT NULL OR _r.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Document request unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_attachments a
     WHERE a.id=_attachment_id AND a.company_id=_r.company_id
       AND a.entity_type='company' AND a.entity_id=_r.company_id
       AND a.uploaded_by=auth.uid() AND a.created_at >= _r.created_at) THEN
    RAISE EXCEPTION 'Select a company document you uploaded after receiving this request';
  END IF;
  UPDATE public.action_document_requests
     SET completed_at=now(), attachment_id=_attachment_id WHERE id=_request_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_action_document_request(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_action_document_request(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_action_document_request(_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r public.action_document_requests%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.action_document_requests WHERE id=_request_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR _r.requested_by<>auth.uid()
    OR NOT public.is_company_member(_r.company_id) OR _r.completed_at IS NOT NULL
    OR _r.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Document request unavailable';
  END IF;
  UPDATE public.action_document_requests SET cancelled_at=now() WHERE id=_request_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_action_document_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_action_document_request(uuid) TO authenticated;

-- Eligible colleague selector; never returns private credentials.
CREATE OR REPLACE FUNCTION public.list_action_document_recipients(_company_id uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id)
     OR NOT public.can_access_attachment(_company_id,'company','manage') THEN
    RAISE EXCEPTION 'Not permitted to view document recipients';
  END IF;
  RETURN QUERY SELECT m.user_id, coalesce(nullif(btrim(p.full_name),''), 'Team member')::text
    FROM public.company_members m
    LEFT JOIN public.profiles p ON p.id=m.user_id
    WHERE m.company_id=_company_id AND m.status='active' AND m.user_id<>auth.uid()
    ORDER BY 2,1;
END;
$$;
REVOKE ALL ON FUNCTION public.list_action_document_recipients(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_action_document_recipients(uuid) TO authenticated;

-- Recipient only sees alerts within their current permissions, even after role changes.
CREATE OR REPLACE FUNCTION public.can_read_action_notification(_company_id uuid, _category text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN RETURN false; END IF;
  RETURN CASE _category
    WHEN 'bill_approval' THEN public.has_company_permission(_company_id,'purchases.authorise')
    WHEN 'overdue_invoice' THEN public.has_company_permission(_company_id,'sales.view')
    WHEN 'bank_reconciliation' THEN public.has_company_permission(_company_id,'banking.view')
    WHEN 'document_request' THEN public.can_access_attachment(_company_id,'company','view')
    WHEN 'system' THEN true
    ELSE false END;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_action_notification(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_action_notification(uuid,text) TO authenticated;
DROP POLICY IF EXISTS action_notifications_read ON public.action_notifications;
CREATE POLICY action_notifications_read ON public.action_notifications FOR SELECT TO authenticated
 USING (recipient_user_id=(select auth.uid()) AND public.can_read_action_notification(company_id,category));

-- On-demand materialization gives accurate alerts even without a scheduler.
-- A scheduler can also invoke the same business predicates through an approved service-worker later.
CREATE OR REPLACE FUNCTION public.refresh_action_notifications(_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _uid uuid := auth.uid(); _affected integer:=0; _n integer;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation';
  END IF;

  IF public.has_company_permission(_company_id,'purchases.authorise') THEN
    INSERT INTO public.action_notifications
      (company_id,recipient_user_id,event_key,category,priority,title,body,entity_type,entity_id,target_path)
    SELECT _company_id,_uid,'bill_approval:'||b.id::text,'bill_approval',
      CASE WHEN b.due_date<current_date THEN 'high' ELSE 'medium' END,
      left('Bill '||coalesce(nullif(b.bill_number,''),b.id::text)||' awaiting approval',180),
      'Review this supplier bill before it is authorised.',
      'purchase_bill',b.id,'/purchases/bills/'||b.id::text
    FROM public.purchase_bills b
    WHERE b.company_id=_company_id AND b.status='awaiting_approval'
    ORDER BY b.submitted_for_approval_at DESC NULLS LAST, b.id LIMIT 300
    ON CONFLICT (company_id,recipient_user_id,event_key) DO UPDATE SET
      title=EXCLUDED.title,body=EXCLUDED.body,priority=EXCLUDED.priority,
      target_path=EXCLUDED.target_path,resolved_at=NULL;
    GET DIAGNOSTICS _n=ROW_COUNT; _affected:=_affected+_n;
  END IF;

  IF public.has_company_permission(_company_id,'sales.view') THEN
    INSERT INTO public.action_notifications
      (company_id,recipient_user_id,event_key,category,priority,title,body,entity_type,entity_id,target_path)
    SELECT _company_id,_uid,'overdue_invoice:'||i.id::text,'overdue_invoice',
      CASE WHEN i.due_date < current_date - 30 THEN 'high' ELSE 'medium' END,
      left('Invoice '||coalesce(nullif(i.invoice_number,''),i.id::text)||' overdue',180),
      'Invoice remains unpaid after its due date. Review before sending a reminder.',
      'sales_invoice',i.id,'/sales/invoices/'||i.id::text
    FROM public.sales_invoices i
    WHERE i.company_id=_company_id AND i.status IN ('authorised','partly_paid')
      AND i.posted_journal_id IS NOT NULL AND i.due_date<current_date
      AND i.total_minor - coalesce(i.amount_paid_minor,0)-coalesce(i.amount_credited_minor,0)>0
    ORDER BY i.due_date,i.id LIMIT 300
    ON CONFLICT (company_id,recipient_user_id,event_key) DO UPDATE SET
      title=EXCLUDED.title,body=EXCLUDED.body,priority=EXCLUDED.priority,
      target_path=EXCLUDED.target_path,resolved_at=NULL;
    GET DIAGNOSTICS _n=ROW_COUNT; _affected:=_affected+_n;
  END IF;

  IF public.has_company_permission(_company_id,'banking.view') THEN
    INSERT INTO public.action_notifications
      (company_id,recipient_user_id,event_key,category,priority,title,body,entity_type,entity_id,target_path)
    SELECT _company_id,_uid,'bank_reconciliation:'||a.id::text,'bank_reconciliation',
      CASE WHEN count(*)>=100 THEN 'high' ELSE 'medium' END,
      left('Bank review: '||a.name,180),
      count(*)::text||' bank transactions still need categorisation or reconciliation.',
      'bank_account',a.id,'/banking/reconcile'
    FROM public.bank_transactions t
    JOIN public.bank_accounts a ON a.id=t.bank_account_id
      AND a.company_id=t.company_id AND a.is_active
    WHERE t.company_id=_company_id AND t.status IN ('uncategorised','matched')
    GROUP BY a.id,a.name
    ORDER BY count(*) DESC,a.id LIMIT 100
    ON CONFLICT (company_id,recipient_user_id,event_key) DO UPDATE SET
      title=EXCLUDED.title,body=EXCLUDED.body,priority=EXCLUDED.priority,
      target_path=EXCLUDED.target_path,resolved_at=NULL;
    GET DIAGNOSTICS _n=ROW_COUNT; _affected:=_affected+_n;
  END IF;

  IF public.can_access_attachment(_company_id,'company','view') THEN
    INSERT INTO public.action_notifications
      (company_id,recipient_user_id,event_key,category,priority,title,body,entity_type,entity_id,target_path)
    SELECT _company_id,_uid,'document_request:'||r.id::text,'document_request','medium',
      left('Document requested: '||r.subject,180),
      left(r.instructions,2000),'action_document_request',r.id,'/files'
    FROM public.action_document_requests r
    WHERE r.company_id=_company_id AND r.requested_from=_uid
      AND r.completed_at IS NULL AND r.cancelled_at IS NULL
    ORDER BY r.created_at DESC,r.id LIMIT 300
    ON CONFLICT (company_id,recipient_user_id,event_key) DO UPDATE SET
      title=EXCLUDED.title,body=EXCLUDED.body,priority=EXCLUDED.priority,
      target_path=EXCLUDED.target_path,resolved_at=NULL;
    GET DIAGNOSTICS _n=ROW_COUNT; _affected:=_affected+_n;
  END IF;

  -- Resolved items remain visible in history, but disappear from action-required views.
  UPDATE public.action_notifications n SET resolved_at=now()
  WHERE n.company_id=_company_id AND n.recipient_user_id=_uid AND n.resolved_at IS NULL
    AND (
      (n.category='bill_approval' AND NOT EXISTS (
       SELECT 1 FROM public.purchase_bills b WHERE b.company_id=_company_id AND b.id=n.entity_id
         AND b.status='awaiting_approval'))
      OR (n.category='overdue_invoice' AND NOT EXISTS (
       SELECT 1 FROM public.sales_invoices i WHERE i.company_id=_company_id AND i.id=n.entity_id
         AND i.status IN ('authorised','partly_paid') AND i.posted_journal_id IS NOT NULL
         AND i.due_date<current_date AND
           i.total_minor-coalesce(i.amount_paid_minor,0)-coalesce(i.amount_credited_minor,0)>0))
      OR (n.category='bank_reconciliation' AND NOT EXISTS (
       SELECT 1 FROM public.bank_transactions t JOIN public.bank_accounts a
       ON a.id=t.bank_account_id AND a.company_id=t.company_id AND a.is_active
       WHERE t.company_id=_company_id AND t.bank_account_id=n.entity_id
         AND t.status IN ('uncategorised','matched')))
      OR (n.category='document_request' AND NOT EXISTS (
       SELECT 1 FROM public.action_document_requests r
       WHERE r.id=n.entity_id AND r.company_id=_company_id AND r.requested_from=_uid
         AND r.completed_at IS NULL AND r.cancelled_at IS NULL))
    );
  RETURN _affected;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_action_notifications(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_action_notifications(uuid) TO authenticated;

-- Essential query indexes supporting the four detectors.
CREATE INDEX IF NOT EXISTS action_invoice_due_scan_idx ON public.sales_invoices(company_id,due_date)
 WHERE status IN ('authorised','partly_paid') AND posted_journal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS action_bank_review_scan_idx ON public.bank_transactions(company_id,bank_account_id)
 WHERE status IN ('uncategorised','matched');
