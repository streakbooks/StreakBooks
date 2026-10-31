-- Portal payments, supplier submissions, files, messages, and reminders.
-- Payments post only through public.record_customer_receipt.
-- Supplier bills are inserted as awaiting approval and are not authorised here.

CREATE OR REPLACE FUNCTION public.portal_restore_jwt(_sub TEXT, _claims TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(_claims, ''), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_post_captured_intent(_intent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _intent public.portal_payment_intents%ROWTYPE;
  _inv public.sales_invoices%ROWTYPE;
  _actor UUID;
  _bank UUID;
  _fee_account UUID;
  _date DATE;
  _res JSONB;
  _receipt UUID;
  _prev_sub TEXT := current_setting('request.jwt.claim.sub', true);
  _prev_claims TEXT := current_setting('request.jwt.claims', true);
  _err TEXT;
BEGIN
  SELECT * INTO _intent FROM public.portal_payment_intents WHERE id = _intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF _intent.receipt_id IS NOT NULL THEN
    UPDATE public.portal_payment_intents
    SET status = 'succeeded', last_error = NULL, updated_at = now()
    WHERE id = _intent.id;
    RETURN jsonb_build_object('posted', true, 'receipt_id', _intent.receipt_id, 'already', true);
  END IF;

  SELECT settlement_user_id, settlement_account_id, fee_expense_account_id
    INTO _actor, _bank, _fee_account
  FROM public.portal_settings WHERE company_id = _intent.company_id;
  IF _actor IS NULL OR _bank IS NULL THEN
    UPDATE public.portal_payment_intents
    SET status = 'captured_unposted',
        last_error = 'Set a settlement bank account and settlement user in Settings → Portals.',
        updated_at = now()
    WHERE id = _intent.id;
    RETURN jsonb_build_object('posted', false, 'error', 'Settlement account is not configured');
  END IF;

  SELECT * INTO _inv FROM public.sales_invoices
  WHERE id = _intent.invoice_id AND company_id = _intent.company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  _date := public.portal_company_today(_intent.company_id);

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', _actor::TEXT, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', _actor, 'role', 'authenticated')::TEXT, true);
    IF NOT public.is_company_member(_intent.company_id)
       OR NOT public.has_company_permission(_intent.company_id, 'sales.payment') THEN
      RAISE EXCEPTION 'The settlement user can no longer record customer receipts. Update Settings → Portals.';
    END IF;
    _res := public.record_customer_receipt(jsonb_build_object(
      'company_id', _intent.company_id,
      'contact_id', _intent.contact_id,
      'receipt_date', _date,
      'amount_minor', _intent.amount_minor,
      'bank_account_id', _bank,
      'currency_code', _intent.currency_code,
      'fx_rate_to_base', _inv.fx_rate_to_base,
      'reference', left('Portal ' || COALESCE(_inv.invoice_number, _intent.id::TEXT), 80),
      'memo', left('Online portal payment ' || _intent.id::TEXT, 500),
      'allocations', jsonb_build_array(jsonb_build_object(
        'invoice_id', _intent.invoice_id, 'amount_minor', _intent.amount_minor
      ))
    ));
    PERFORM public.portal_restore_jwt(_prev_sub, _prev_claims);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.portal_restore_jwt(_prev_sub, _prev_claims);
    _err := left(SQLERRM, 500);
    UPDATE public.portal_payment_intents
    SET status = 'captured_unposted', last_error = _err, updated_at = now()
    WHERE id = _intent.id;
    INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
    VALUES (
      _intent.company_id, _intent.id,
      left('A portal payment was captured but not posted: ' || _err, 1000)
    );
    RETURN jsonb_build_object('posted', false, 'error', _err);
  END;

  _receipt := NULLIF(_res->>'receipt_id', '')::UUID;
  IF _intent.fee_minor > 0 AND _fee_account IS NOT NULL AND _intent.fee_journal_id IS NULL THEN
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', _actor::TEXT, true);
      PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', _actor, 'role', 'authenticated')::TEXT, true);
      _intent.fee_journal_id := public.post_journal(jsonb_build_object(
        'company_id', _intent.company_id,
        'journal_date', _date,
        'memo', left('Payment provider fee ' || _intent.id::TEXT, 500),
        'currency_code', _intent.currency_code,
        'fx_rate_to_base', _inv.fx_rate_to_base,
        'source_type', 'expense',
        'source_id', _intent.id,
        'idempotency_key', 'portal-fee:' || _intent.id::TEXT,
        'lines', jsonb_build_array(
          jsonb_build_object('account_id', _fee_account, 'description', 'Provider fee',
            'debit_minor', _intent.fee_minor, 'credit_minor', 0),
          jsonb_build_object('account_id', _bank, 'description', 'Provider fee',
            'debit_minor', 0, 'credit_minor', _intent.fee_minor)
        )
      ));
      PERFORM public.portal_restore_jwt(_prev_sub, _prev_claims);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.portal_restore_jwt(_prev_sub, _prev_claims);
      INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
      VALUES (_intent.company_id, _intent.id, left('Provider fee was not posted: ' || SQLERRM, 1000));
      _intent.fee_journal_id := NULL;
    END;
  ELSIF _intent.fee_minor > 0 AND _fee_account IS NULL THEN
    INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
    VALUES (_intent.company_id, _intent.id, 'A provider fee was reported. Set a fee expense account in Settings → Portals to post it.');
  END IF;

  UPDATE public.portal_payment_intents
  SET status = 'succeeded', receipt_id = _receipt, fee_journal_id = _intent.fee_journal_id,
      last_error = NULL, updated_at = now()
  WHERE id = _intent.id;
  PERFORM public.portal_notify(
    _intent.company_id, _intent.contact_id, 'Payment received',
    'Your payment was applied to the invoice.'
  );
  PERFORM public.portal_audit(
    _intent.company_id, _intent.payer_user_id, 'portal.payment.posted', 'sales_receipt', _receipt,
    jsonb_build_object('intent_id', _intent.id, 'amount_minor', _intent.amount_minor)
  );
  RETURN jsonb_build_object('posted', true, 'receipt_id', _receipt);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_portal_payment(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), '')
  );
  _intent public.portal_payment_intents%ROWTYPE;
  _event UUID;
  _type TEXT := payload->>'event_type';
  _amount BIGINT := NULLIF(payload->>'amount_minor', '')::BIGINT;
  _currency TEXT := upper(COALESCE(payload->>'currency', ''));
  _provider TEXT := payload->>'provider';
  _payment_id TEXT := NULLIF(payload->>'provider_payment_id', '');
  _event_id TEXT := NULLIF(payload->>'provider_event_id', '');
  _fee BIGINT := COALESCE(NULLIF(payload->>'fee_minor', '')::BIGINT, 0);
  _posted JSONB;
  _prev_sub TEXT;
  _prev_claims TEXT;
  _actor UUID;
  _err TEXT;
  _void JSONB;
BEGIN
  IF _role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _event_id IS NULL OR _provider NOT IN ('stripe', 'razorpay', 'linkbooks_sandbox') THEN
    RAISE EXCEPTION 'Payment event is incomplete';
  END IF;
  IF _type NOT IN ('paid', 'failed', 'refunded', 'disputed', 'dispute_won', 'dispute_lost') THEN
    RAISE EXCEPTION 'Unsupported payment event';
  END IF;

  SELECT * INTO _intent FROM public.portal_payment_intents
  WHERE (NULLIF(payload->>'intent_id', '') IS NOT NULL AND id = (payload->>'intent_id')::UUID)
     OR (_payment_id IS NOT NULL AND provider_payment_id = _payment_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment intent not found'; END IF;

  INSERT INTO public.portal_payment_events (intent_id, provider, provider_event_id, event_type)
  VALUES (_intent.id, _provider, _event_id, _type)
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO _event;
  IF _event IS NULL AND NOT (_type = 'paid' AND _intent.status = 'captured_unposted') THEN
    RETURN jsonb_build_object('duplicate', true, 'status', _intent.status, 'receipt_id', _intent.receipt_id);
  END IF;

  IF _payment_id IS NOT NULL AND _intent.provider_payment_id IS NULL THEN
    UPDATE public.portal_payment_intents SET provider_payment_id = _payment_id, updated_at = now()
    WHERE id = _intent.id;
  END IF;
  IF _intent.provider IS NULL THEN
    UPDATE public.portal_payment_intents SET provider = _provider, updated_at = now() WHERE id = _intent.id;
    _intent.provider := _provider;
  END IF;
  IF _intent.provider IS DISTINCT FROM _provider THEN
    RAISE EXCEPTION 'Payment provider does not match this intent';
  END IF;

  IF _type = 'failed' THEN
    IF _intent.status IN ('succeeded', 'refunded', 'disputed') THEN
      RETURN jsonb_build_object('ignored', true, 'status', _intent.status);
    END IF;
    UPDATE public.portal_payment_intents SET status = 'failed', updated_at = now() WHERE id = _intent.id;
    PERFORM public.portal_notify(_intent.company_id, _intent.contact_id, 'Payment was not completed',
      'The payment provider did not complete this payment. The invoice is still open.');
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  IF _type = 'disputed' THEN
    UPDATE public.portal_payment_intents SET status = 'disputed', updated_at = now() WHERE id = _intent.id;
    INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
    VALUES (_intent.company_id, _intent.id, 'The payment provider opened a dispute. The receipt stays on the ledger until you void it or the dispute is lost.');
    PERFORM public.portal_notify(_intent.company_id, _intent.contact_id, 'Payment disputed',
      'The payment provider is reviewing a dispute on this payment.');
    RETURN jsonb_build_object('status', 'disputed');
  END IF;

  IF _type = 'dispute_won' THEN
    UPDATE public.portal_payment_intents
    SET status = CASE WHEN receipt_id IS NULL THEN status ELSE 'succeeded' END, updated_at = now()
    WHERE id = _intent.id;
    INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
    VALUES (_intent.company_id, _intent.id, 'The payment dispute was won. No ledger change was made.');
    RETURN jsonb_build_object('status', 'dispute_won');
  END IF;

  IF _type IN ('refunded', 'dispute_lost') THEN
    IF _amount IS NULL THEN RAISE EXCEPTION 'Refund amount is required'; END IF;
    IF _amount < _intent.amount_minor OR _intent.receipt_id IS NULL THEN
      UPDATE public.portal_payment_intents SET status = 'refund_pending', updated_at = now() WHERE id = _intent.id;
      INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
      VALUES (
        _intent.company_id, _intent.id,
        CASE WHEN _intent.receipt_id IS NULL
          THEN 'The provider reported a refund before a receipt was posted.'
          ELSE 'Partial refund reported. Void or adjust the receipt in Sales; the portal did not change the ledger.'
        END
      );
      RETURN jsonb_build_object('status', 'refund_pending');
    END IF;

    SELECT settlement_user_id INTO _actor FROM public.portal_settings WHERE company_id = _intent.company_id;
    _prev_sub := current_setting('request.jwt.claim.sub', true);
    _prev_claims := current_setting('request.jwt.claims', true);
    BEGIN
      IF _actor IS NULL THEN RAISE EXCEPTION 'No settlement user is configured'; END IF;
      PERFORM set_config('request.jwt.claim.sub', _actor::TEXT, true);
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor, 'role', 'authenticated')::TEXT, true);
      IF NOT public.has_company_permission(_intent.company_id, 'sales.void') THEN
        RAISE EXCEPTION 'The settlement user cannot void receipts';
      END IF;
      _void := public.void_customer_receipt(jsonb_build_object(
        'company_id', _intent.company_id,
        'receipt_id', _intent.receipt_id,
        'reason', left('Payment provider refund ' || _event_id, 500),
        'void_date', public.portal_company_today(_intent.company_id)
      ));
      PERFORM public.portal_restore_jwt(_prev_sub, _prev_claims);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.portal_restore_jwt(_prev_sub, _prev_claims);
      _err := left(SQLERRM, 500);
      UPDATE public.portal_payment_intents SET status = 'refund_pending', last_error = _err, updated_at = now()
      WHERE id = _intent.id;
      INSERT INTO public.portal_staff_alerts (company_id, intent_id, message)
      VALUES (_intent.company_id, _intent.id, left('Refund was not posted: ' || _err, 1000));
      RETURN jsonb_build_object('status', 'refund_pending', 'error', _err);
    END;
    UPDATE public.portal_payment_intents SET status = 'refunded', last_error = NULL, updated_at = now()
    WHERE id = _intent.id;
    PERFORM public.portal_notify(_intent.company_id, _intent.contact_id, 'Payment refunded',
      'The payment was refunded and the receipt was reversed.');
    RETURN jsonb_build_object('status', 'refunded', 'void_journal_id', _void->>'void_journal_id');
  END IF;

  -- paid
  IF _amount IS DISTINCT FROM _intent.amount_minor OR _currency IS DISTINCT FROM btrim(_intent.currency_code::TEXT) THEN
    RAISE EXCEPTION 'Paid amount or currency does not match the invoice payment';
  END IF;
  IF _provider = 'linkbooks_sandbox'
     AND _intent.status NOT IN ('sandbox_confirmed', 'captured_unposted') THEN
    RAISE EXCEPTION 'Sandbox payment has not been confirmed';
  END IF;
  IF NOT COALESCE((SELECT allow_sandbox FROM public.portal_settings WHERE company_id = _intent.company_id), false)
     AND _provider = 'linkbooks_sandbox' THEN
    RAISE EXCEPTION 'Sandbox payments are turned off';
  END IF;
  IF _fee < 0 THEN RAISE EXCEPTION 'Fee cannot be negative'; END IF;
  IF _fee > 0 THEN
    UPDATE public.portal_payment_intents SET fee_minor = _fee, updated_at = now() WHERE id = _intent.id;
  END IF;
  _posted := public.portal_post_captured_intent(_intent.id);
  RETURN _posted || jsonb_build_object('status', CASE WHEN (_posted->>'posted')::BOOLEAN THEN 'succeeded' ELSE 'captured_unposted' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_portal_payment_post(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _intent UUID := NULLIF(payload->>'intent_id', '')::UUID;
  _row public.portal_payment_intents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.has_company_permission(_company, 'sales.payment') THEN
    RAISE EXCEPTION 'You do not have permission to record customer receipts';
  END IF;
  SELECT * INTO _row FROM public.portal_payment_intents
  WHERE id = _intent AND company_id = _company AND status = 'captured_unposted'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'There is no unposted portal payment to retry'; END IF;
  RETURN public.portal_post_captured_intent(_intent);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_create_payment_intent(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _invoice UUID := NULLIF(payload->>'invoice_id', '')::UUID;
  _amount BIGINT := NULLIF(payload->>'amount_minor', '')::BIGINT;
  _key TEXT := left(btrim(COALESCE(payload->>'idempotency_key', '')), 80);
  _inv public.sales_invoices%ROWTYPE;
  _due BIGINT;
  _room BIGINT;
  _existing public.portal_payment_intents%ROWTYPE;
  _id UUID;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'Only a customer can pay an invoice'; END IF;
  IF _key = '' THEN RAISE EXCEPTION 'A payment reference is required'; END IF;
  PERFORM public.portal_rate_limit('pay:' || auth.uid()::TEXT, 15, INTERVAL '15 minutes');
  SELECT * INTO _existing FROM public.portal_payment_intents
  WHERE company_id = _m.company_id AND idempotency_key = _key;
  IF FOUND THEN
    RETURN jsonb_build_object('intent_id', _existing.id, 'amount_minor', _existing.amount_minor,
      'currency', _existing.currency_code, 'status', _existing.status, 'existing', true);
  END IF;

  UPDATE public.portal_payment_intents
  SET status = 'cancelled', updated_at = now()
  WHERE invoice_id = _invoice AND company_id = _m.company_id
    AND (
      (status = 'requires_action' AND created_at < now() - INTERVAL '2 hours')
      OR (status = 'processing' AND created_at < now() - INTERVAL '24 hours')
    );

  SELECT * INTO _inv FROM public.sales_invoices
  WHERE id = _invoice AND company_id = _m.company_id AND contact_id = _m.contact_id
  FOR UPDATE;
  IF NOT FOUND OR _inv.status NOT IN ('authorised', 'partly_paid') THEN
    RAISE EXCEPTION 'This invoice cannot be paid online';
  END IF;
  _due := _inv.total_minor - _inv.amount_paid_minor - _inv.amount_credited_minor;
  _room := _due - public.portal_invoice_hold(_inv.id, NULL);
  IF _amount IS NULL OR _amount <= 0 OR _amount > _room THEN
    RAISE EXCEPTION 'That amount is more than the invoice still allows, including payments already in progress';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_settings
    WHERE company_id = _m.company_id AND settlement_account_id IS NOT NULL AND settlement_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Online payment is not set up yet. Use the payment details on the invoice.';
  END IF;

  INSERT INTO public.portal_payment_intents (
    company_id, contact_id, invoice_id, membership_id, payer_user_id,
    amount_minor, currency_code, status, idempotency_key
  ) VALUES (
    _m.company_id, _m.contact_id, _inv.id, _m.id, auth.uid(),
    _amount, _inv.currency_code, 'requires_action', _key
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object(
    'intent_id', _id, 'amount_minor', _amount, 'currency', _inv.currency_code,
    'status', 'requires_action', 'existing', false,
    'allow_sandbox', COALESCE((SELECT allow_sandbox FROM public.portal_settings WHERE company_id = _m.company_id), false),
    'invoice_number', _inv.invoice_number,
    'company_name', (SELECT name FROM public.companies WHERE id = _m.company_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_attach_provider(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _intent public.portal_payment_intents%ROWTYPE;
  _provider TEXT := payload->>'provider';
  _session TEXT := left(NULLIF(btrim(COALESCE(payload->>'provider_session_id', '')), ''), 200);
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  SELECT * INTO _intent FROM public.portal_payment_intents
  WHERE id = NULLIF(payload->>'intent_id', '')::UUID
    AND membership_id = _m.id AND payer_user_id = auth.uid()
    AND status = 'requires_action'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment session was not found'; END IF;
  IF _provider = 'linkbooks_sandbox' AND NOT COALESCE((
    SELECT allow_sandbox FROM public.portal_settings WHERE company_id = _m.company_id
  ), false) THEN
    RAISE EXCEPTION 'Sandbox payments are turned off';
  END IF;
  IF _provider NOT IN ('stripe', 'razorpay', 'linkbooks_sandbox') OR _session IS NULL THEN
    RAISE EXCEPTION 'Payment provider session is incomplete';
  END IF;
  UPDATE public.portal_payment_intents
  SET provider = _provider, provider_session_id = _session, status = 'processing', updated_at = now()
  WHERE id = _intent.id;
  RETURN jsonb_build_object('intent_id', _intent.id, 'status', 'processing');
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_claim_sandbox(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _intent public.portal_payment_intents%ROWTYPE;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF NOT COALESCE((SELECT allow_sandbox FROM public.portal_settings WHERE company_id = _m.company_id), false) THEN
    RAISE EXCEPTION 'Sandbox payments are turned off';
  END IF;
  SELECT * INTO _intent FROM public.portal_payment_intents
  WHERE id = NULLIF(payload->>'intent_id', '')::UUID
    AND membership_id = _m.id AND payer_user_id = auth.uid()
    AND provider = 'linkbooks_sandbox' AND status = 'processing'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox payment was not found'; END IF;
  UPDATE public.portal_payment_intents SET status = 'sandbox_confirmed', updated_at = now() WHERE id = _intent.id;
  RETURN jsonb_build_object(
    'intent_id', _intent.id, 'amount_minor', _intent.amount_minor, 'currency', _intent.currency_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_restore_jwt(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_post_captured_intent(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_portal_payment(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_portal_payment_post(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_create_payment_intent(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_attach_provider(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_claim_sandbox(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_portal_payment(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_portal_payment_post(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_create_payment_intent(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_attach_provider(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_claim_sandbox(JSONB) TO authenticated;
