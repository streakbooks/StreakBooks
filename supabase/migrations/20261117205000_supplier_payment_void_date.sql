-- Persist void_date on supplier payments for AP statement / as-at honesty (parity with sales receipts).

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS void_date DATE;

COMMENT ON COLUMN public.supplier_payments.void_date IS
  'Calendar date the payment left the AP subledger. Used by supplier statements; null on non-void payments.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_void_date_gte_payment_date'
  ) THEN
    ALTER TABLE public.supplier_payments
      ADD CONSTRAINT supplier_payments_void_date_gte_payment_date
      CHECK (void_date IS NULL OR void_date >= payment_date);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_supplier_payment(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _pay RECORD;
  _alloc RECORD;
  _reason TEXT := NULLIF(left(trim(COALESCE(payload->>'reason', '')), 500), '');
  _date DATE;
  _vj UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _company IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;
  IF NOT public.is_company_member(_company) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT public.has_company_permission(_company, 'purchases.payment') THEN
    RAISE EXCEPTION 'You do not have permission to reverse supplier payments';
  END IF;
  IF _reason IS NULL OR length(_reason) < 3 THEN
    RAISE EXCEPTION 'A void reason is required (at least 3 characters)';
  END IF;

  SELECT * INTO _pay FROM public.supplier_payments
  WHERE id = NULLIF(payload->>'payment_id', '')::UUID AND company_id = _company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _pay.status::TEXT = 'void' THEN RAISE EXCEPTION 'Payment is already voided'; END IF;
  IF _pay.posted_journal_id IS NULL THEN RAISE EXCEPTION 'Payment has no posted journal to reverse'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.money_document_credit_uses u
    JOIN public.money_documents d ON d.id = u.document_id
    WHERE u.source_kind = 'supplier_payment' AND u.source_id = _pay.id AND d.status <> 'void'
  ) THEN
    RAISE EXCEPTION 'This payment has been refunded. Void the refund first.';
  END IF;

  _date := COALESCE(NULLIF(payload->>'void_date', '')::DATE, CURRENT_DATE);
  IF _date < _pay.payment_date THEN
    RAISE EXCEPTION 'Void date cannot be before the payment date';
  END IF;
  IF _date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Void date cannot be in the future';
  END IF;

  FOR _alloc IN
    SELECT a.bill_id, a.amount_minor FROM public.supplier_payment_allocations a
    WHERE a.payment_id = _pay.id ORDER BY a.bill_id
  LOOP
    PERFORM 1 FROM public.purchase_bills WHERE id = _alloc.bill_id FOR UPDATE;
  END LOOP;
  FOR _alloc IN
    SELECT a.bill_id, a.amount_minor FROM public.supplier_payment_allocations a WHERE a.payment_id = _pay.id
  LOOP
    UPDATE public.purchase_bills
    SET amount_paid_minor = GREATEST(0, amount_paid_minor - _alloc.amount_minor),
        status = (CASE
                   WHEN status::TEXT = 'void' THEN status::TEXT
                   WHEN GREATEST(0, amount_paid_minor - _alloc.amount_minor) + amount_credited_minor >= total_minor THEN 'paid'
                   WHEN GREATEST(0, amount_paid_minor - _alloc.amount_minor) + amount_credited_minor > 0 THEN 'partly_paid'
                   ELSE 'authorised' END)::public.purchase_doc_status,
        updated_at = now()
    WHERE id = _alloc.bill_id;
  END LOOP;
  DELETE FROM public.supplier_payment_allocations WHERE payment_id = _pay.id;

  _vj := public.reverse_journal_on(_pay.posted_journal_id, _date, 'supplier_payment:' || _pay.id::TEXT || ':void');

  UPDATE public.supplier_payments
  SET status = 'void',
      unallocated_minor = 0,
      void_journal_id = _vj,
      void_reason = _reason,
      void_date = _date,
      voided_at = now(),
      updated_at = now()
  WHERE id = _pay.id;

  PERFORM public.record_audit_event(
    _company, 'supplier_payment.reverse', 'supplier_payment', _pay.id,
    jsonb_build_object('void_journal_id', _vj, 'reason', _reason, 'void_date', _date)
  );
  RETURN jsonb_build_object('id', _pay.id, 'void_journal_id', _vj, 'void_date', _date);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_supplier_payment(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_supplier_payment(JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
