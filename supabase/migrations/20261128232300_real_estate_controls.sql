-- Brokers, commissions, classified costs, budgets, workspace and row security.

CREATE OR REPLACE FUNCTION public.realestate_create_broker(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.commissions.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF length(trim(COALESCE(_payload->>'name', ''))) = 0 THEN RAISE EXCEPTION 'Broker name is required'; END IF;
  IF NULLIF(_payload->>'contact_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = (_payload->>'contact_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Contact is not in this organisation';
  END IF;
  INSERT INTO public.realestate_brokers (company_id, contact_id, name, kind)
  VALUES (
    _company_id, NULLIF(_payload->>'contact_id', '')::UUID, trim(_payload->>'name'),
    COALESCE(NULLIF(_payload->>'kind', ''), 'broker')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_save_commission_rule(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.commissions.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_brokers
    WHERE id = (_payload->>'broker_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Broker not found';
  END IF;
  INSERT INTO public.realestate_commission_rules (
    company_id, broker_id, project_id, name, basis, rate_bps, fixed_minor, withholding_bps, tiers, trigger_event
  ) VALUES (
    _company_id, (_payload->>'broker_id')::UUID, NULLIF(_payload->>'project_id', '')::UUID,
    trim(_payload->>'name'), COALESCE(_payload->>'basis', 'contract'),
    COALESCE((_payload->>'rate_bps')::INT, 0), COALESCE((_payload->>'fixed_minor')::BIGINT, 0),
    COALESCE((_payload->>'withholding_bps')::INT, 0), COALESCE(_payload->'tiers', '[]'::jsonb),
    COALESCE(NULLIF(_payload->>'trigger_event', ''), 'manual')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'saved', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_suggest_commission(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _rule public.realestate_commission_rules;
  _broker UUID := (_payload->>'broker_id')::UUID;
  _base BIGINT;
  _gross BIGINT := 0;
  _previous BIGINT := 0;
  _covered BIGINT := 0;
  _slice BIGINT;
  _tier JSONB;
  _shares JSONB;
  _bps_sum INT := 0;
  _elem JSONB;
  _assigned BIGINT := 0;
  _count INT;
  _index INT := 0;
  _share_gross BIGINT;
  _withholding BIGINT;
  _net BIGINT;
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.commissions.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Open sale not found'; END IF;
  SELECT * INTO _rule FROM public.realestate_commission_rules
  WHERE company_id = _company_id AND broker_id = _broker
    AND (project_id = _sale.project_id OR project_id IS NULL)
  ORDER BY (project_id IS NULL), created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No commission rule covers this broker and project'; END IF;
  _base := CASE WHEN _rule.basis = 'collected' THEN _sale.collected_minor ELSE _sale.contract_minor END;
  IF jsonb_array_length(_rule.tiers) > 0 THEN
    FOR _tier IN
      SELECT value FROM jsonb_array_elements(_rule.tiers) ORDER BY (value->>'upto_minor')::BIGINT
    LOOP
      _slice := LEAST(_base, (_tier->>'upto_minor')::BIGINT) - _previous;
      IF _slice > 0 THEN
        _gross := _gross + (_slice * (_tier->>'rate_bps')::INT) / 10000;
        _covered := _covered + _slice;
      END IF;
      _previous := (_tier->>'upto_minor')::BIGINT;
      EXIT WHEN _covered >= _base;
    END LOOP;
    _gross := _gross + _rule.fixed_minor;
    IF _covered < _base THEN RAISE EXCEPTION 'Commission tiers do not cover the base amount'; END IF;
  ELSE
    _gross := _rule.fixed_minor + (_base * _rule.rate_bps) / 10000;
  END IF;
  _shares := COALESCE(_payload->'shares', '[]'::jsonb);
  IF jsonb_array_length(_shares) = 0 THEN
    _shares := jsonb_build_array(jsonb_build_object('broker_id', _broker, 'bps', 10000));
  END IF;
  SELECT COALESCE(SUM((value->>'bps')::INT), 0) INTO _bps_sum FROM jsonb_array_elements(_shares);
  IF _bps_sum <> 10000 THEN RAISE EXCEPTION 'Commission shares must total 100%%'; END IF;
  _count := jsonb_array_length(_shares);
  FOR _elem IN SELECT value FROM jsonb_array_elements(_shares) LOOP
    _index := _index + 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.realestate_brokers
      WHERE id = (_elem->>'broker_id')::UUID AND company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'A commission share names a broker outside this organisation';
    END IF;
    IF _index < _count THEN
      _share_gross := (_gross * (_elem->>'bps')::INT) / 10000;
      _assigned := _assigned + _share_gross;
    ELSE
      _share_gross := _gross - _assigned;
    END IF;
    _withholding := (_share_gross * _rule.withholding_bps) / 10000;
    _net := _share_gross - _withholding;
    INSERT INTO public.realestate_commission_accruals (
      company_id, sale_id, broker_id, rule_id, gross_minor, withholding_minor, net_minor, status, created_by
    ) VALUES (
      _company_id, _sale.id, (_elem->>'broker_id')::UUID, _rule.id, _share_gross, _withholding, _net,
      'suggested', auth.uid()
    ) RETURNING id INTO _id;
  END LOOP;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'suggested', 'replayed', false, 'reason', _gross::TEXT);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This broker already has a live commission on the sale';
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_approve_commission(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.realestate_commission_accruals;
  _seg BOOLEAN;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.approve');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _row FROM public.realestate_commission_accruals
  WHERE id = (_payload->>'accrual_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'suggested' THEN RAISE EXCEPTION 'Suggested commission not found'; END IF;
  SELECT enforce_segregation INTO _seg FROM public.realestate_settings WHERE company_id = _company_id;
  IF _seg AND _row.created_by = auth.uid() THEN
    RAISE EXCEPTION 'A different person must approve this commission';
  END IF;
  UPDATE public.realestate_commission_accruals
  SET status = 'approved', approved_by = auth.uid()
  WHERE id = _row.id;
  RETURN jsonb_build_object('id', _row.id, 'journal_id', NULL, 'status', 'approved', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_post_commission(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.realestate_commission_accruals;
  _sale public.realestate_sales;
  _key TEXT := trim(COALESCE(_payload->>'idempotency_key', ''));
  _lines JSONB;
  _journal UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _key = '' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  SELECT * INTO _row FROM public.realestate_commission_accruals
  WHERE id = (_payload->>'accrual_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
  IF _row.status = 'posted' AND _row.idempotency_key = _key THEN
    RETURN jsonb_build_object('id', _row.id, 'journal_id', _row.journal_id, 'status', 'posted', 'replayed', true, 'reason', NULL);
  END IF;
  IF _row.status <> 'approved' THEN RAISE EXCEPTION 'Approve the commission before posting it'; END IF;
  IF _row.gross_minor = 0 THEN RAISE EXCEPTION 'A zero commission is not posted'; END IF;
  SELECT * INTO _sale FROM public.realestate_sales WHERE id = _row.sale_id;
  _lines := jsonb_build_array(jsonb_build_object(
    'account_id', public.realestate_internal_account(_company_id, 'commission_expense'),
    'debit_minor', _row.gross_minor, 'credit_minor', 0, 'description', 'Commission expense'
  ));
  IF _row.net_minor > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.realestate_internal_account(_company_id, 'commission_payable'),
      'debit_minor', 0, 'credit_minor', _row.net_minor, 'description', 'Commission payable'
    ));
  END IF;
  IF _row.withholding_minor > 0 THEN
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.realestate_internal_account(_company_id, 'withholding_payable'),
      'debit_minor', 0, 'credit_minor', _row.withholding_minor, 'description', 'Commission withholding'
    ));
  END IF;
  _journal := public.realestate_internal_post(
    _company_id, 'real_estate_commission', _row.id, COALESCE(NULLIF(_payload->>'journal_date', '')::DATE, CURRENT_DATE),
    'Commission ' || _sale.sale_number, _sale.currency_code,
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1), 're-commission-' || _key, _lines
  );
  UPDATE public.realestate_commission_accruals
  SET status = 'posted', journal_id = _journal, idempotency_key = _key
  WHERE id = _row.id;
  RETURN jsonb_build_object('id', _row.id, 'journal_id', _journal, 'status', 'posted', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_record_cost(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _journal UUID;
  _class TEXT := _payload->>'classification';
  _amount BIGINT := (_payload->>'amount_minor')::BIGINT;
  _post BOOLEAN := COALESCE((_payload->>'post')::BOOLEAN, false);
  _key TEXT := NULLIF(trim(COALESCE(_payload->>'idempotency_key', '')), '');
  _existing public.realestate_costs;
  _currency TEXT;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.costs.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _class NOT IN (
    'capitalisable', 'wip', 'inventory', 'fixed_asset', 'investment_property',
    'operating_expense', 'prepayment', 'accrual'
  ) THEN
    RAISE EXCEPTION 'Cost classification is required';
  END IF;
  IF _post AND _class <> 'operating_expense' THEN
    RAISE EXCEPTION 'Capitalisable and inventory costs stay unposted until a capitalisation approval exists';
  END IF;
  IF _post AND _key IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;
  IF _key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.realestate_costs
    WHERE company_id = _company_id AND idempotency_key = _key;
    IF FOUND THEN
      RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', 'saved', 'replayed', true, 'reason', NULL);
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_projects
    WHERE id = (_payload->>'project_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  SELECT currency_code INTO _currency FROM public.realestate_projects
  WHERE id = (_payload->>'project_id')::UUID;
  INSERT INTO public.realestate_costs (
    company_id, project_id, phase_id, category, classification, amount_minor, incurred_on,
    vendor_name, notes, idempotency_key, created_by
  ) VALUES (
    _company_id, (_payload->>'project_id')::UUID, NULLIF(_payload->>'phase_id', '')::UUID,
    trim(_payload->>'category'), _class, _amount, (_payload->>'incurred_on')::DATE,
    COALESCE(_payload->>'vendor_name', ''), COALESCE(_payload->>'notes', ''), _key, auth.uid()
  ) RETURNING id INTO _id;
  IF _post THEN
    PERFORM public.realestate_internal_require(_company_id, 'realestate.post');
    _journal := public.realestate_internal_post(
      _company_id, 'real_estate_cost', _id, (_payload->>'incurred_on')::DATE,
      'Project operating cost', _currency, COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
      're-cost-' || _key,
      jsonb_build_array(
        jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'operating_expense'), 'debit_minor', _amount, 'credit_minor', 0, 'description', _payload->>'category'),
        jsonb_build_object('account_id', public.realestate_internal_account(_company_id, 'operating_payable'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Operating cost payable')
      )
    );
    UPDATE public.realestate_costs SET journal_id = _journal WHERE id = _id;
  END IF;
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', CASE WHEN _post THEN 'posted' ELSE 'recorded' END, 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_save_budget(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _version INT;
  _line JSONB;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.budgets.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_projects
    WHERE id = (_payload->>'project_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO _version
  FROM public.realestate_budgets WHERE project_id = (_payload->>'project_id')::UUID;
  INSERT INTO public.realestate_budgets (company_id, project_id, name, status, version, created_by)
  VALUES (
    _company_id, (_payload->>'project_id')::UUID, trim(_payload->>'name'), 'draft', _version, auth.uid()
  ) RETURNING id INTO _id;
  FOR _line IN SELECT value FROM jsonb_array_elements(COALESCE(_payload->'lines', '[]'::jsonb)) LOOP
    INSERT INTO public.realestate_budget_lines (company_id, budget_id, category, amount_minor)
    VALUES (_company_id, _id, trim(_line->>'category'), (_line->>'amount_minor')::BIGINT);
  END LOOP;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'draft', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_approve_budget(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.realestate_budgets;
  _seg BOOLEAN;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.approve');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _row FROM public.realestate_budgets
  WHERE id = (_payload->>'budget_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'draft' THEN RAISE EXCEPTION 'Draft budget not found'; END IF;
  SELECT enforce_segregation INTO _seg FROM public.realestate_settings WHERE company_id = _company_id;
  IF _seg AND _row.created_by = auth.uid() THEN
    RAISE EXCEPTION 'A different person must approve this budget';
  END IF;
  UPDATE public.realestate_budgets SET status = 'superseded'
  WHERE project_id = _row.project_id AND status = 'approved';
  UPDATE public.realestate_budgets SET status = 'approved', approved_by = auth.uid() WHERE id = _row.id;
  RETURN jsonb_build_object('id', _row.id, 'journal_id', NULL, 'status', 'approved', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_workspace(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.realestate_settings;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.view');
  SELECT * INTO _settings FROM public.realestate_settings WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'enabled', COALESCE(_settings.enabled, false),
      'area_unit', COALESCE(_settings.area_unit, 'sqm'),
      'recognition_policy', COALESCE(_settings.recognition_policy, 'unset'),
      'enforce_segregation', COALESCE(_settings.enforce_segregation, false),
      'reservation_hold_days', COALESCE(_settings.reservation_hold_days, 7),
      'grace_days', COALESCE(_settings.grace_days, 0),
      'late_fee_bps', COALESCE(_settings.late_fee_bps, 0),
      'country_code', COALESCE(_settings.country_code, 'US'),
      'account_map', COALESCE(_settings.account_map, '{}'::jsonb)
    ),
    'metrics', jsonb_build_object(
      'project_count', (SELECT count(*) FROM public.realestate_projects WHERE company_id = _company_id),
      'unit_count', (SELECT count(*) FROM public.realestate_units WHERE company_id = _company_id),
      'available_count', (SELECT count(*) FROM public.realestate_units WHERE company_id = _company_id AND status = 'available'),
      'reserved_count', (SELECT count(*) FROM public.realestate_units WHERE company_id = _company_id AND status = 'reserved'),
      'booked_count', (SELECT count(*) FROM public.realestate_units WHERE company_id = _company_id AND status IN ('booked', 'under_agreement')),
      'sold_count', (SELECT count(*) FROM public.realestate_units WHERE company_id = _company_id AND status IN ('sold', 'fully_paid', 'ready_for_handover', 'handed_over')),
      'inventory_list_minor', (SELECT COALESCE(SUM(list_price_minor), 0) FROM public.realestate_units WHERE company_id = _company_id AND status NOT IN ('withdrawn', 'cancelled')),
      'contracted_minor', (SELECT COALESCE(SUM(contract_minor), 0) FROM public.realestate_sales WHERE company_id = _company_id AND status <> 'cancelled'),
      'recognised_minor', (SELECT COALESCE(SUM(recognised_minor), 0) FROM public.realestate_sales WHERE company_id = _company_id AND status <> 'cancelled'),
      'collected_minor', (SELECT COALESCE(SUM(collected_minor), 0) FROM public.realestate_sales WHERE company_id = _company_id AND status <> 'cancelled'),
      'outstanding_instalment_minor', (
        SELECT COALESCE(SUM(i.amount_minor - i.allocated_minor), 0)
        FROM public.realestate_instalments i
        JOIN public.realestate_payment_plans p ON p.id = i.plan_id
        JOIN public.realestate_sales s ON s.id = i.sale_id
        WHERE i.company_id = _company_id AND p.status = 'active' AND s.status <> 'cancelled'
      ),
      'overdue_count', (
        SELECT count(*)
        FROM public.realestate_instalments i
        JOIN public.realestate_payment_plans p ON p.id = i.plan_id
        JOIN public.realestate_sales s ON s.id = i.sale_id
        WHERE i.company_id = _company_id AND p.status = 'active' AND s.status <> 'cancelled'
          AND i.allocated_minor < i.amount_minor
          AND i.due_on + COALESCE(_settings.grace_days, 0) < CURRENT_DATE
      ),
      'cost_recorded_minor', (SELECT COALESCE(SUM(amount_minor), 0) FROM public.realestate_costs WHERE company_id = _company_id),
      'cost_posted_minor', (SELECT COALESCE(SUM(amount_minor), 0) FROM public.realestate_costs WHERE company_id = _company_id AND journal_id IS NOT NULL),
      'budget_approved_minor', (
        SELECT COALESCE(SUM(l.amount_minor), 0)
        FROM public.realestate_budget_lines l
        JOIN public.realestate_budgets b ON b.id = l.budget_id
        WHERE l.company_id = _company_id AND b.status = 'approved'
      ),
      'commission_open_minor', (
        SELECT COALESCE(SUM(net_minor), 0) FROM public.realestate_commission_accruals
        WHERE company_id = _company_id AND status IN ('suggested', 'approved')
      ),
      'commission_posted_minor', (
        SELECT COALESCE(SUM(net_minor), 0) FROM public.realestate_commission_accruals
        WHERE company_id = _company_id AND status = 'posted'
      )
    ),
    'by_status', COALESCE((
      SELECT jsonb_object_agg(status, cnt) FROM (
        SELECT status, count(*) AS cnt FROM public.realestate_units WHERE company_id = _company_id GROUP BY status
      ) s
    ), '{}'::jsonb),
    'projects', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, code, name, location, status, currency_code FROM public.realestate_projects
      WHERE company_id = _company_id ORDER BY code
    ) x), '[]'::jsonb),
    'phases', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, project_id, code, name FROM public.realestate_phases WHERE company_id = _company_id ORDER BY sequence
    ) x), '[]'::jsonb),
    'structures', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, project_id, code, name, kind FROM public.realestate_structures WHERE company_id = _company_id ORDER BY code
    ) x), '[]'::jsonb),
    'levels', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, structure_id, label, sequence FROM public.realestate_levels WHERE company_id = _company_id ORDER BY sequence
    ) x), '[]'::jsonb),
    'units', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, project_id, structure_id, level_id, unit_code, kind, status, saleable_area, list_price_minor,
        CASE WHEN saleable_area > 0 THEN round(list_price_minor / saleable_area)::BIGINT ELSE NULL END AS price_per_area_minor
      FROM public.realestate_units WHERE company_id = _company_id ORDER BY unit_code LIMIT 300
    ) x), '[]'::jsonb),
    'holds', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, unit_id, holder_name, status, expires_at FROM public.realestate_holds
      WHERE company_id = _company_id AND status = 'active' ORDER BY expires_at
    ) x), '[]'::jsonb),
    'sales', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, sale_number, project_id, unit_id, contact_id, status, contract_minor, collected_minor,
        recognised_minor, currency_code
      FROM public.realestate_sales WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 200
    ) x), '[]'::jsonb),
    'instalments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT i.id, i.sale_id, i.sequence, i.kind, i.label, i.due_on, i.amount_minor, i.allocated_minor
      FROM public.realestate_instalments i
      JOIN public.realestate_payment_plans p ON p.id = i.plan_id
      WHERE i.company_id = _company_id AND p.status = 'active'
      ORDER BY i.due_on, i.sequence LIMIT 400
    ) x), '[]'::jsonb),
    'brokers', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, name, kind FROM public.realestate_brokers WHERE company_id = _company_id ORDER BY name
    ) x), '[]'::jsonb),
    'rules', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, broker_id, project_id, name, basis, rate_bps, fixed_minor, withholding_bps
      FROM public.realestate_commission_rules WHERE company_id = _company_id ORDER BY created_at DESC
    ) x), '[]'::jsonb),
    'accruals', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, sale_id, broker_id, gross_minor, withholding_minor, net_minor, status
      FROM public.realestate_commission_accruals WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 200
    ) x), '[]'::jsonb),
    'costs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT id, project_id, category, classification, amount_minor, incurred_on, journal_id IS NOT NULL AS posted
      FROM public.realestate_costs WHERE company_id = _company_id ORDER BY incurred_on DESC LIMIT 200
    ) x), '[]'::jsonb),
    'budgets', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT b.id, b.project_id, b.name, b.status, b.version, COALESCE(SUM(l.amount_minor), 0) AS amount_minor
      FROM public.realestate_budgets b
      LEFT JOIN public.realestate_budget_lines l ON l.budget_id = b.id
      WHERE b.company_id = _company_id
      GROUP BY b.id ORDER BY b.version DESC
    ) x), '[]'::jsonb),
    'alerts', COALESCE((
      SELECT jsonb_agg(item) FROM (
        SELECT jsonb_build_object('id', h.id, 'title', 'Reservation expires for ' || u.unit_code, 'href', '/real-estate/reservations', 'severity', 'attention') AS item
        FROM public.realestate_holds h
        JOIN public.realestate_units u ON u.id = h.unit_id
        WHERE h.company_id = _company_id AND h.status = 'active' AND h.expires_at < now() + interval '3 days'
        UNION ALL
        SELECT jsonb_build_object('id', i.id, 'title', 'Overdue instalment ' || i.label, 'href', '/real-estate/instalments', 'severity', 'attention')
        FROM public.realestate_instalments i
        JOIN public.realestate_payment_plans p ON p.id = i.plan_id
        JOIN public.realestate_sales s ON s.id = i.sale_id
        WHERE i.company_id = _company_id AND p.status = 'active' AND s.status <> 'cancelled'
          AND i.allocated_minor < i.amount_minor AND i.due_on < CURRENT_DATE
        UNION ALL
        SELECT jsonb_build_object('id', s.id, 'title', 'Collected sale has no recognition policy', 'href', '/real-estate/settings', 'severity', 'attention')
        FROM public.realestate_sales s
        WHERE s.company_id = _company_id AND s.status <> 'cancelled' AND s.collected_minor > s.recognised_minor
          AND COALESCE(_settings.recognition_policy, 'unset') = 'unset'
      ) alerts
    ), '[]'::jsonb)
  );
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'realestate_settings', 'realestate_counters', 'realestate_projects', 'realestate_phases',
    'realestate_structures', 'realestate_levels', 'realestate_units', 'realestate_unit_events',
    'realestate_holds', 'realestate_sales', 'realestate_payment_plans', 'realestate_instalments',
    'realestate_collections', 'realestate_collection_allocations', 'realestate_refunds',
    'realestate_recognitions', 'realestate_brokers', 'realestate_commission_rules',
    'realestate_commission_accruals', 'realestate_costs', 'realestate_budgets', 'realestate_budget_lines'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS re_member_select ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY re_member_select ON public.%I FOR SELECT TO authenticated USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, %L))',
      t, 'realestate.view'
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'realestate\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.signature);
    IF r.proname NOT LIKE 'realestate_internal_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    END IF;
  END LOOP;
END $$;
