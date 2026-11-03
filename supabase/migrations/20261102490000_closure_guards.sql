-- READY-TO-APPLY. Not applied. One pending closure per business. Approval archives only a real business that is still open.
-- Reverse: drop index company_closure_one_pending, then reapply the two functions
-- from 20261102220000_company_closure.sql.

CREATE UNIQUE INDEX company_closure_one_pending
  ON public.company_closure_requests (company_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.platform_request_closure(_company_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('businesses.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND NOT is_demo) THEN
    RAISE EXCEPTION 'That business cannot be closed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_closure_requests
    WHERE company_id = _company_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'That business already has a pending closure';
  END IF;
  BEGIN
    INSERT INTO public.company_closure_requests (company_id, requester_id, status, reason)
    VALUES (_company_id, auth.uid(), 'pending', trim(_reason))
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That business already has a pending closure';
  END;
  PERFORM private.platform_log('closure.request', 'company', _company_id::text, NULL,
    jsonb_build_object('request', _id), trim(_reason));
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_decide_closure(_request_id uuid, _decision text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.company_closure_requests%ROWTYPE;
BEGIN
  PERFORM private.require_platform('businesses.manage');
  IF _decision NOT IN ('archived', 'rejected') OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record an archive or reject decision and a reason';
  END IF;
  SELECT * INTO _row FROM public.company_closure_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'pending' THEN
    RAISE EXCEPTION 'That closure request is no longer pending';
  END IF;
  IF _row.requester_id = auth.uid() THEN
    RAISE EXCEPTION 'A second person must decide this request';
  END IF;
  IF _decision = 'archived' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.companies WHERE id = _row.company_id AND NOT is_demo
    ) THEN
      RAISE EXCEPTION 'That business cannot be closed';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.companies WHERE id = _row.company_id AND archived_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'That business is already closed';
    END IF;
  END IF;
  UPDATE public.company_closure_requests
  SET status = _decision, approver_id = auth.uid()
  WHERE id = _request_id;
  IF _decision = 'archived' THEN
    INSERT INTO public.platform_tenant_controls (company_id, status)
    VALUES (_row.company_id, 'archived')
    ON CONFLICT (company_id) DO UPDATE SET status = 'archived', updated_at = now();
    UPDATE public.companies
    SET archived_at = now()
    WHERE id = _row.company_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'That business is already closed'; END IF;
  END IF;
  PERFORM private.platform_log('closure.decide', 'company', _row.company_id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', _decision), trim(_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_closure(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_closure(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_closure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_decide_closure(uuid, text, text) TO authenticated;
