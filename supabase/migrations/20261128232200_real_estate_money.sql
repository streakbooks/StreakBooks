-- Collections credit contract liability. Recognition is a separate approved posting.
-- Operating expenses can post. Capitalisable costs cannot.

CREATE OR REPLACE FUNCTION public.realestate_collect(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _existing public.realestate_collections;
  _id UUID;
  _journal UUID;
  _amount BIGINT := (_payload->>'amount_minor')::BIGINT;
  _left BIGINT;
  _take BIGINT;
  _inst public.realestate_instalments;
  _key TEXT := trim(COALESCE(_payload->>'idempotency_key', ''));
  _bank UUID;
  _liability UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.collections.manage');
  PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _key = '' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Collection amount must be positive'; END IF;
  SELECT * INTO _existing FROM public.realestate_collections
  WHERE company_id = _company_id AND idempotency_key = _key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', 'posted', 'replayed', true, 'reason', NULL);
  END IF;
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Open sale not found'; END IF;
  SELECT * INTO _existing FROM public.realestate_collections
  WHERE company_id = _company_id AND idempotency_key = _key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', 'posted', 'replayed', true, 'reason', NULL);
  END IF;
  _bank := public.realestate_internal_account(_company_id, 'bank');
  _liability := public.realestate_internal_account(_company_id, 'contract_liability');
  INSERT INTO public.realestate_collections (
    company_id, sale_id, amount_minor, received_on, idempotency_key, created_by
  ) VALUES (
    _company_id, _sale.id, _amount, (_payload->>'received_on')::DATE, _key, auth.uid()
  ) RETURNING id INTO _id;
  _journal := public.realestate_internal_post(
    _company_id, 'real_estate_deposit', _id, (_payload->>'received_on')::DATE,
    'Customer property deposit ' || _sale.sale_number, _sale.currency_code,
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1), 're-collect-' || _key,
    jsonb_build_array(
      jsonb_build_object('account_id', _bank, 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Deposit received'),
      jsonb_build_object('account_id', _liability, 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Contract liability')
    )
  );
  UPDATE public.realestate_collections SET journal_id = _journal WHERE id = _id;
  UPDATE public.realestate_sales SET collected_minor = collected_minor + _amount WHERE id = _sale.id;
  _left := _amount;
  FOR _inst IN
    SELECT i.* FROM public.realestate_instalments i
    JOIN public.realestate_payment_plans p ON p.id = i.plan_id
    WHERE i.sale_id = _sale.id AND p.status = 'active' AND i.allocated_minor < i.amount_minor
    ORDER BY i.due_on, i.sequence
    FOR UPDATE OF i
  LOOP
    EXIT WHEN _left = 0;
    _take := LEAST(_left, _inst.amount_minor - _inst.allocated_minor);
    UPDATE public.realestate_instalments SET allocated_minor = allocated_minor + _take WHERE id = _inst.id;
    INSERT INTO public.realestate_collection_allocations (company_id, collection_id, instalment_id, amount_minor)
    VALUES (_company_id, _id, _inst.id, _take);
    _left := _left - _take;
  END LOOP;
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'posted', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_refund(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _existing public.realestate_refunds;
  _alloc RECORD;
  _id UUID;
  _journal UUID;
  _amount BIGINT := (_payload->>'amount_minor')::BIGINT;
  _left BIGINT;
  _take BIGINT;
  _key TEXT := trim(COALESCE(_payload->>'idempotency_key', ''));
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.reverse');
  PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _key = '' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Refund amount must be positive'; END IF;
  SELECT * INTO _existing FROM public.realestate_refunds
  WHERE company_id = _company_id AND idempotency_key = _key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', 'posted', 'replayed', true, 'reason', NULL);
  END IF;
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF _sale.recognised_minor > 0 OR _sale.liability_applied_minor > 0 THEN
    RAISE EXCEPTION 'Reverse revenue recognition before refunding this sale';
  END IF;
  IF _amount > _sale.collected_minor THEN
    RAISE EXCEPTION 'Refund exceeds the contract liability still held for this sale';
  END IF;
  _left := _amount;
  FOR _alloc IN
    SELECT a.id, a.amount_minor, a.instalment_id
    FROM public.realestate_collection_allocations a
    JOIN public.realestate_collections c ON c.id = a.collection_id
    JOIN public.realestate_instalments i ON i.id = a.instalment_id
    WHERE c.sale_id = _sale.id
    ORDER BY i.due_on DESC, i.sequence DESC, a.id DESC
    FOR UPDATE OF a
  LOOP
    EXIT WHEN _left = 0;
    _take := LEAST(_left, _alloc.amount_minor);
    IF _take = _alloc.amount_minor THEN
      DELETE FROM public.realestate_collection_allocations WHERE id = _alloc.id;
    ELSE
      UPDATE public.realestate_collection_allocations SET amount_minor = amount_minor - _take WHERE id = _alloc.id;
    END IF;
    UPDATE public.realestate_instalments SET allocated_minor = allocated_minor - _take WHERE id = _alloc.instalment_id;
    _left := _left - _take;
  END LOOP;
  INSERT INTO public.realestate_refunds (
    company_id, sale_id, amount_minor, refunded_on, idempotency_key, created_by
  ) VALUES (
    _company_id, _sale.id, _amount, (_payload->>'refunded_on')::DATE, _key, auth.uid()
  ) RETURNING id INTO _id;
  _journal := public.realestate_internal_post(
    _company_id, 'real_estate_refund', _id, (_payload->>'refunded_on')::DATE,
    'Customer property refund ' || _sale.sale_number, _sale.currency_code,
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1), 're-refund-' || _key,
    jsonb_build_array(
      jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'contract_liability'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Deposit refunded'),
      jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'bank'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Refund paid')
    )
  );
  UPDATE public.realestate_refunds SET journal_id = _journal WHERE id = _id;
  UPDATE public.realestate_sales SET collected_minor = collected_minor - _amount WHERE id = _sale.id;
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'posted', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_recognise(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _existing public.realestate_recognitions;
  _policy TEXT;
  _seg BOOLEAN;
  _mode TEXT := _payload->>'policy';
  _revenue BIGINT := 0;
  _cos BIGINT := 0;
  _open BIGINT;
  _from_liability BIGINT;
  _asset BIGINT;
  _progress INT := NULLIF(_payload->>'progress_bps', '')::INT;
  _estimated BIGINT := COALESCE(NULLIF(_payload->>'estimated_cost_minor', '')::BIGINT, 0);
  _lines JSONB := '[]'::JSONB;
  _id UUID;
  _journal UUID;
  _key TEXT := trim(COALESCE(_payload->>'idempotency_key', ''));
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
  PERFORM public.realestate_internal_require(_company_id, 'realestate.approve');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _key = '' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  SELECT * INTO _existing FROM public.realestate_recognitions
  WHERE company_id = _company_id AND idempotency_key = _key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', 'posted', 'replayed', true, 'reason', NULL);
  END IF;
  SELECT recognition_policy, enforce_segregation INTO _policy, _seg
  FROM public.realestate_settings WHERE company_id = _company_id;
  IF _policy = 'unset' THEN
    RAISE EXCEPTION 'Choose an approved recognition policy before recognising revenue';
  END IF;
  IF _payload->>'trigger' IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'Receiving cash, issuing an invoice, signing an agreement or reaching a milestone does not recognise revenue';
  END IF;
  IF COALESCE((_payload->>'approved')::BOOLEAN, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Revenue recognition needs an explicit approval';
  END IF;
  IF length(trim(COALESCE(_payload->>'calculation_ref', ''))) < 4 THEN
    RAISE EXCEPTION 'A calculation reference is required';
  END IF;
  IF length(trim(COALESCE(_payload->>'evidence_note', ''))) < 12 THEN
    RAISE EXCEPTION 'Describe the evidence that supports this recognition';
  END IF;
  IF _mode IS DISTINCT FROM _policy THEN
    RAISE EXCEPTION 'Recognition must use the organisation policy';
  END IF;
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Open sale not found'; END IF;
  IF _seg AND _sale.created_by = auth.uid() THEN
    RAISE EXCEPTION 'The person who created the sale cannot recognise its revenue while segregation is on';
  END IF;
  _open := _sale.collected_minor - _sale.liability_applied_minor;
  IF _open < 0 THEN RAISE EXCEPTION 'Liability application exceeds collections'; END IF;
  IF _mode = 'point_in_time' THEN
    IF COALESCE((_payload->>'control_transferred')::BOOLEAN, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Point-in-time recognition requires evidence that control of the property has transferred';
    END IF;
    _revenue := (_payload->>'requested_minor')::BIGINT;
    IF _revenue IS NULL OR _revenue <= 0 THEN RAISE EXCEPTION 'Recognition amount must be positive'; END IF;
    IF _sale.recognised_minor + _revenue > _sale.contract_minor THEN
      RAISE EXCEPTION 'Recognition would exceed the contract';
    END IF;
  ELSE
    IF COALESCE((_payload->>'over_time_criteria_met')::BOOLEAN, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Over-time recognition stays off until the qualifying criteria are confirmed';
    END IF;
    IF _progress IS NULL OR _progress <= 0 OR _progress > 10000 THEN
      RAISE EXCEPTION 'Progress must be above 0 and at most 100%%';
    END IF;
    IF _estimated < 0 THEN RAISE EXCEPTION 'Estimated cost must be zero or positive'; END IF;
    _revenue := ((_sale.contract_minor * _progress) / 10000) - _sale.recognised_minor;
    IF _revenue <= 0 THEN RAISE EXCEPTION 'Measured progress does not increase recognised revenue'; END IF;
    _cos := GREATEST(0, ((_estimated * _progress) / 10000) - _sale.cos_recognised_minor);
  END IF;
  _from_liability := LEAST(_revenue, _open);
  _asset := _revenue - _from_liability;
  IF _from_liability > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.realestate_internal_account(_company_id, 'contract_liability'),
      'debit_minor', _from_liability, 'credit_minor', 0, 'description', 'Contract liability applied'
    ));
  END IF;
  IF _asset > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.realestate_internal_account(_company_id, 'contract_asset'),
      'debit_minor', _asset, 'credit_minor', 0, 'description', 'Contract asset'
    ));
  END IF;
  IF _cos > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'cost_of_sales'), 'debit_minor', _cos, 'credit_minor', 0, 'description', 'Cost of property sold'),
      jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'inventory'), 'debit_minor', 0, 'credit_minor', _cos, 'description', 'Development inventory released')
    );
  END IF;
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'account_id', public.realestate_internal_account(_company_id, 'revenue'),
    'debit_minor', 0, 'credit_minor', _revenue, 'description', 'Property sales revenue'
  ));
  INSERT INTO public.realestate_recognitions (
    company_id, sale_id, policy, revenue_minor, liability_minor, asset_minor, cos_minor, progress_bps,
    calculation_ref, evidence_note, idempotency_key, created_by
  ) VALUES (
    _company_id, _sale.id, _mode, _revenue, _from_liability, _asset, _cos, _progress,
    trim(_payload->>'calculation_ref'), trim(_payload->>'evidence_note'), _key, auth.uid()
  ) RETURNING id INTO _id;
  _journal := public.realestate_internal_post(
    _company_id, 'real_estate_revenue', _id, COALESCE(NULLIF(_payload->>'journal_date', '')::DATE, CURRENT_DATE),
    'Property revenue ' || _sale.sale_number, _sale.currency_code,
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1), 're-recognise-' || _key, _lines
  );
  UPDATE public.realestate_recognitions SET journal_id = _journal WHERE id = _id;
  UPDATE public.realestate_sales
  SET recognised_minor = recognised_minor + _revenue,
      liability_applied_minor = liability_applied_minor + _from_liability,
      cos_recognised_minor = cos_recognised_minor + _cos
  WHERE id = _sale.id;
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'posted', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_reverse_recognition(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.realestate_recognitions;
  _sale public.realestate_sales;
  _lines JSONB := '[]'::JSONB;
  _journal UUID;
  _key TEXT := trim(COALESCE(_payload->>'idempotency_key', ''));
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.reverse');
  PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _key = '' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  SELECT * INTO _row FROM public.realestate_recognitions
  WHERE sale_id = _sale.id AND reversed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'There is no recognition to reverse'; END IF;
  IF _row.liability_minor > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.realestate_internal_account(_company_id, 'contract_liability'),
      'debit_minor', 0, 'credit_minor', _row.liability_minor, 'description', 'Restore contract liability'
    ));
  END IF;
  IF _row.asset_minor > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.realestate_internal_account(_company_id, 'contract_asset'),
      'debit_minor', 0, 'credit_minor', _row.asset_minor, 'description', 'Reverse contract asset'
    ));
  END IF;
  IF _row.cos_minor > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'inventory'), 'debit_minor', _row.cos_minor, 'credit_minor', 0, 'description', 'Restore development inventory'),
      jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'cost_of_sales'), 'debit_minor', 0, 'credit_minor', _row.cos_minor, 'description', 'Reverse cost of property sold')
    );
  END IF;
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'account_id', public.realestate_internal_account(_company_id, 'revenue'),
    'debit_minor', _row.revenue_minor, 'credit_minor', 0, 'description', 'Reverse property sales revenue'
  ));
  _journal := public.realestate_internal_post(
    _company_id, 'real_estate_revenue', _row.id, COALESCE(NULLIF(_payload->>'journal_date', '')::DATE, CURRENT_DATE),
    'Reverse property revenue ' || _sale.sale_number, _sale.currency_code,
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1), 're-unrecognise-' || _key, _lines
  );
  UPDATE public.realestate_recognitions
  SET reversal_journal_id = _journal, reversed_at = now()
  WHERE id = _row.id;
  UPDATE public.realestate_sales
  SET recognised_minor = recognised_minor - _row.revenue_minor,
      liability_applied_minor = liability_applied_minor - _row.liability_minor,
      cos_recognised_minor = cos_recognised_minor - _row.cos_minor
  WHERE id = _sale.id;
  RETURN jsonb_build_object('id', _row.id, 'journal_id', _journal, 'status', 'reversed', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_cancel_sale(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _to TEXT := COALESCE(NULLIF(_payload->>'disposition', ''), 'available');
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _to NOT IN ('available', 'cancelled') THEN RAISE EXCEPTION 'Disposition must be available or cancelled'; END IF;
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Open sale not found'; END IF;
  IF _sale.recognised_minor > 0 THEN
    RAISE EXCEPTION 'Reverse revenue recognition before cancelling this sale';
  END IF;
  IF _sale.collected_minor > 0 THEN
    RAISE EXCEPTION 'Refund collections before cancelling this sale';
  END IF;
  UPDATE public.realestate_sales SET status = 'cancelled', cancelled_at = now() WHERE id = _sale.id;
  PERFORM public.realestate_internal_transition(_company_id, _sale.unit_id, _to, COALESCE(_payload->>'reason', 'Sale cancelled'));
  RETURN jsonb_build_object('id', _sale.id, 'journal_id', NULL, 'status', 'cancelled', 'replayed', false, 'reason', NULL);
END;
$$;
