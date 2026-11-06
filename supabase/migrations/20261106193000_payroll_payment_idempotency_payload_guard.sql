-- Preserve original Payroll payment behavior while rejecting a reused
-- idempotency key when dates, amounts, account, currency or allocations differ.
-- This is an in-place replacement of the existing SECURITY DEFINER RPC.
-- No payment rows or existing accounting entries are modified.

CREATE OR REPLACE FUNCTION public.record_payroll_payment(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _company_id UUID;
  _date DATE;
  _method TEXT;
  _amount BIGINT;
  _bank UUID;
  _currency TEXT;
  _ref TEXT;
  _memo TEXT;
  _idem TEXT;
  _allocs JSONB;
  _a JSONB;
  _payslip_id UUID;
  _amt BIGINT;
  _alloc_sum BIGINT := 0;
  _settings public.payroll_settings;
  _slip RECORD;
  _seen UUID[] := '{}';
  _pay_id UUID;
  _jid UUID;
  _existing RECORD;
  _incoming_allocs JSONB;
  _existing_allocs JSONB;
  _unalloc BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  _company_id := NULLIF(payload->>'company_id', '')::UUID;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.pay') THEN
    RAISE EXCEPTION 'You do not have permission to record payroll payments';
  END IF;

  _date := NULLIF(payload->>'payment_date', '')::DATE;
  _method := NULLIF(trim(payload->>'payment_method'), '');
  _amount := NULLIF(payload->>'amount_minor', '')::BIGINT;
  _bank := NULLIF(payload->>'clearing_account_id', '')::UUID;
  _ref := NULLIF(left(trim(COALESCE(payload->>'reference', '')), 80), '');
  _memo := NULLIF(left(trim(COALESCE(payload->>'memo', '')), 500), '');
  _idem := NULLIF(left(trim(COALESCE(payload->>'idempotency_key', '')), 100), '');
  _allocs := COALESCE(payload->'allocations', '[]'::jsonb);
  _currency := upper(COALESCE(NULLIF(payload->>'currency_code', ''), (
    SELECT payroll_currency FROM public.payroll_settings WHERE company_id = _company_id
  )));

  IF _date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  IF _method IS NULL OR _method NOT IN ('bank_transfer', 'cash', 'cheque', 'manual', 'other') THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  IF _bank IS NULL THEN RAISE EXCEPTION 'Clearing account is required'; END IF;
  IF NOT public.sales_is_deposit_account(_company_id, _bank) THEN
    RAISE EXCEPTION 'Clearing account must be an active bank or cash account';
  END IF;
  IF jsonb_typeof(_allocs) <> 'array' THEN RAISE EXCEPTION 'allocations must be an array'; END IF;

  IF _idem IS NOT NULL THEN
    SELECT id, journal_id, unallocated_minor, payment_date, payment_method,
           amount_minor, clearing_account_id, currency, reference, memo, status
    INTO _existing
    FROM public.payroll_payments
    WHERE company_id = _company_id AND idempotency_key = _idem
    FOR UPDATE;
    IF FOUND THEN
      -- Canonical allocation ordering permits equivalent retries but prevents
      -- reusing a key to settle different payslips or amounts.
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'payslip_id', (a.value->>'payslip_id')::uuid::text,
          'amount_minor', (a.value->>'amount_minor')::bigint
        ) ORDER BY (a.value->>'payslip_id')::uuid, (a.value->>'amount_minor')::bigint
      ), '[]'::jsonb) INTO _incoming_allocs
      FROM jsonb_array_elements(_allocs) AS a;

      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('payslip_id', a.payslip_id::text, 'amount_minor', a.amount_minor)
        ORDER BY a.payslip_id, a.amount_minor
      ), '[]'::jsonb) INTO _existing_allocs
      FROM public.payroll_payment_allocations a
      WHERE a.payment_id = _existing.id;

      IF _date IS DISTINCT FROM _existing.payment_date
         OR _method IS DISTINCT FROM _existing.payment_method
         OR _amount IS DISTINCT FROM _existing.amount_minor
         OR _bank IS DISTINCT FROM _existing.clearing_account_id
         OR _currency IS DISTINCT FROM _existing.currency
         OR _ref IS DISTINCT FROM _existing.reference
         OR _memo IS DISTINCT FROM _existing.memo
         OR _incoming_allocs IS DISTINCT FROM _existing_allocs
      THEN
        RAISE EXCEPTION 'Payroll idempotency key already used for different payment details'
          USING ERRCODE = '23505';
      END IF;

      IF _existing.status IS DISTINCT FROM 'posted' THEN
        RAISE EXCEPTION 'Payroll payment was reversed; use a new idempotency key for a new settlement'
          USING ERRCODE = '23505';
      END IF;

      RETURN jsonb_build_object(
        'payment_id', _existing.id,
        'journal_id', _existing.journal_id,
        'unallocated_minor', _existing.unallocated_minor,
        'replayed', TRUE
      );
    END IF;
  END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.net_pay_liability_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure net pay liability account in payroll settings';
  END IF;

  FOR _a IN SELECT value FROM jsonb_array_elements(_allocs)
  LOOP
    _payslip_id := NULLIF(_a->>'payslip_id', '')::UUID;
    _amt := NULLIF(_a->>'amount_minor', '')::BIGINT;
    IF _payslip_id IS NULL THEN RAISE EXCEPTION 'Allocation missing payslip_id'; END IF;
    IF _amt IS NULL OR _amt <= 0 THEN RAISE EXCEPTION 'Allocation amounts must be positive'; END IF;
    IF _payslip_id = ANY (_seen) THEN RAISE EXCEPTION 'Each payslip can only appear once'; END IF;
    _seen := _seen || _payslip_id;
    _alloc_sum := _alloc_sum + _amt;
  END LOOP;
  IF _alloc_sum > _amount THEN RAISE EXCEPTION 'Allocations exceed payment amount'; END IF;
  _unalloc := _amount - _alloc_sum;

  IF cardinality(_seen) > 0 THEN
    PERFORM 1 FROM public.payroll_payslips
    WHERE id = ANY (_seen) AND company_id = _company_id
    ORDER BY id FOR UPDATE;

    FOR _a IN SELECT value FROM jsonb_array_elements(_allocs)
    LOOP
      _payslip_id := (_a->>'payslip_id')::UUID;
      _amt := (_a->>'amount_minor')::BIGINT;
      SELECT p.*, re.net_minor AS employee_net, r.status AS run_status, r.accrual_journal_id
      INTO _slip
      FROM public.payroll_payslips p
      JOIN public.payroll_run_employees re ON re.id = p.run_employee_id
      JOIN public.payroll_runs r ON r.id = p.run_id
      WHERE p.id = _payslip_id AND p.company_id = _company_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Payslip not found'; END IF;
      IF _slip.run_status NOT IN ('posted', 'paid', 'complete') OR _slip.accrual_journal_id IS NULL THEN
        RAISE EXCEPTION 'Payslip run must be posted before payment';
      END IF;
      IF _amt > _slip.employee_net - _slip.amount_paid_minor THEN
        RAISE EXCEPTION 'Allocation exceeds outstanding net pay for payslip %', _slip.payslip_number;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.payroll_payments (
    company_id, payment_date, payment_method, amount_minor, unallocated_minor,
    currency, reference, memo, clearing_account_id, status, idempotency_key, created_by
  ) VALUES (
    _company_id, _date, _method, _amount, _unalloc,
    _currency, _ref, _memo, _bank, 'posted', _idem, _uid
  ) RETURNING id INTO _pay_id;

  _jid := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _date,
    'memo', COALESCE(_memo, 'Payroll payment'),
    'currency_code', _currency,
    'fx_rate_to_base', 1,
    'source_type', 'payroll',
    'source_id', _pay_id,
    'idempotency_key', COALESCE(_idem, 'payroll-payment:' || _pay_id::TEXT) || ':post',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'account_id', _settings.net_pay_liability_account_id,
        'description', COALESCE(_memo, 'Net pay'),
        'debit_minor', _amount,
        'credit_minor', 0
      ),
      jsonb_build_object(
        'account_id', _bank,
        'description', COALESCE(_memo, 'Payroll payment'),
        'debit_minor', 0,
        'credit_minor', _amount
      )
    )
  ));

  UPDATE public.payroll_payments SET journal_id = _jid, updated_at = now() WHERE id = _pay_id;

  FOR _a IN SELECT value FROM jsonb_array_elements(_allocs)
  LOOP
    _payslip_id := (_a->>'payslip_id')::UUID;
    _amt := (_a->>'amount_minor')::BIGINT;

    SELECT p.id, p.run_id, p.run_employee_id, re.net_minor
    INTO _slip
    FROM public.payroll_payslips p
    JOIN public.payroll_run_employees re ON re.id = p.run_employee_id
    WHERE p.id = _payslip_id AND p.company_id = _company_id;

    INSERT INTO public.payroll_payment_allocations (
      company_id, payment_id, payslip_id, run_id, run_employee_id, amount_minor
    ) VALUES (
      _company_id, _pay_id, _payslip_id, _slip.run_id, _slip.run_employee_id, _amt
    );

    UPDATE public.payroll_payslips SET
      amount_paid_minor = amount_paid_minor + _amt,
      payment_status = public.payroll_derive_payslip_payment_status(re.net_minor, amount_paid_minor + _amt)
    FROM public.payroll_run_employees re
    WHERE payroll_payslips.id = _payslip_id AND re.id = payroll_payslips.run_employee_id;

    PERFORM public.payroll_refresh_run_payment_status(_slip.run_id);
  END LOOP;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.payment.recorded', 'payroll_payment', _pay_id,
    jsonb_build_object('amount_minor', _amount, 'journal_id', _jid, 'allocated_minor', _alloc_sum)
  );

  RETURN jsonb_build_object(
    'payment_id', _pay_id,
    'journal_id', _jid,
    'unallocated_minor', _unalloc,
    'replayed', FALSE
  );
END;
$function$;
