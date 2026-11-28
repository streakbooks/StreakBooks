-- Real Estate operational functions. Journals only through realestate_internal_post.
-- Payment schedules and commission suggestions are not revenue.

CREATE OR REPLACE FUNCTION public.realestate_upsert_settings(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.admin');
  IF COALESCE(_payload->>'area_unit', 'sqm') NOT IN ('sqm', 'sqft', 'acre', 'hectare') THEN
    RAISE EXCEPTION 'Unsupported area unit';
  END IF;
  IF COALESCE(_payload->>'recognition_policy', 'unset') NOT IN ('unset', 'point_in_time', 'over_time') THEN
    RAISE EXCEPTION 'Unsupported recognition policy';
  END IF;
  IF jsonb_typeof(COALESCE(_payload->'account_map', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Account map must be an object';
  END IF;
  INSERT INTO public.realestate_settings (
    company_id, enabled, area_unit, recognition_policy, enforce_segregation,
    reservation_hold_days, grace_days, late_fee_bps, country_code, account_map, updated_at
  ) VALUES (
    _company_id,
    COALESCE((_payload->>'enabled')::BOOLEAN, false),
    COALESCE(_payload->>'area_unit', 'sqm'),
    COALESCE(_payload->>'recognition_policy', 'unset'),
    COALESCE((_payload->>'enforce_segregation')::BOOLEAN, false),
    COALESCE((_payload->>'reservation_hold_days')::INTEGER, 7),
    COALESCE((_payload->>'grace_days')::INTEGER, 0),
    COALESCE((_payload->>'late_fee_bps')::INTEGER, 0),
    COALESCE(_payload->>'country_code', 'US'),
    COALESCE(_payload->'account_map', '{}'::jsonb),
    now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    area_unit = EXCLUDED.area_unit,
    recognition_policy = EXCLUDED.recognition_policy,
    enforce_segregation = EXCLUDED.enforce_segregation,
    reservation_hold_days = EXCLUDED.reservation_hold_days,
    grace_days = EXCLUDED.grace_days,
    late_fee_bps = EXCLUDED.late_fee_bps,
    country_code = EXCLUDED.country_code,
    account_map = EXCLUDED.account_map,
    version = public.realestate_settings.version + 1,
    updated_at = now()
  RETURNING company_id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'saved', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_create_project(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _currency TEXT;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF length(trim(COALESCE(_payload->>'code', ''))) = 0 OR length(trim(COALESCE(_payload->>'name', ''))) = 0 THEN
    RAISE EXCEPTION 'Project code and name are required';
  END IF;
  SELECT upper(base_currency) INTO _currency FROM public.companies WHERE id = _company_id;
  _currency := upper(COALESCE(NULLIF(_payload->>'currency_code', ''), _currency));
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid currency'; END IF;
  INSERT INTO public.realestate_projects (
    company_id, code, name, location, status, currency_code, start_on, target_on, notes, created_by
  ) VALUES (
    _company_id, trim(_payload->>'code'), trim(_payload->>'name'), COALESCE(_payload->>'location', ''),
    COALESCE(NULLIF(_payload->>'status', ''), 'planning'), _currency,
    NULLIF(_payload->>'start_on', '')::DATE, NULLIF(_payload->>'target_on', '')::DATE,
    COALESCE(_payload->>'notes', ''), auth.uid()
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_create_phase(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_projects
    WHERE id = (_payload->>'project_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  INSERT INTO public.realestate_phases (company_id, project_id, code, name, sequence)
  VALUES (
    _company_id, (_payload->>'project_id')::UUID, trim(_payload->>'code'), trim(_payload->>'name'),
    COALESCE((_payload->>'sequence')::INTEGER, 1)
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_create_structure(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_projects
    WHERE id = (_payload->>'project_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  INSERT INTO public.realestate_structures (company_id, project_id, phase_id, kind, code, name)
  VALUES (
    _company_id, (_payload->>'project_id')::UUID, NULLIF(_payload->>'phase_id', '')::UUID,
    COALESCE(_payload->>'kind', 'building'), trim(_payload->>'code'), trim(_payload->>'name')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_create_level(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_structures
    WHERE id = (_payload->>'structure_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Structure not found';
  END IF;
  INSERT INTO public.realestate_levels (company_id, structure_id, label, sequence)
  VALUES (
    _company_id, (_payload->>'structure_id')::UUID, trim(_payload->>'label'),
    COALESCE((_payload->>'sequence')::INTEGER, 1)
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_internal_insert_unit(_company_id UUID, _payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _project UUID := (_payload->>'project_id')::UUID;
  _status TEXT := COALESCE(NULLIF(_payload->>'status', ''), 'available');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _status NOT IN ('planned', 'under_development', 'available') THEN
    RAISE EXCEPTION 'New properties start as planned, under development or available';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_projects WHERE id = _project AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF NULLIF(_payload->>'phase_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.realestate_phases
    WHERE id = (_payload->>'phase_id')::UUID AND project_id = _project AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Phase is not in this project';
  END IF;
  IF NULLIF(_payload->>'structure_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.realestate_structures
    WHERE id = (_payload->>'structure_id')::UUID AND project_id = _project AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Structure is not in this project';
  END IF;
  IF NULLIF(_payload->>'level_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.realestate_levels l
    JOIN public.realestate_structures s ON s.id = l.structure_id
    WHERE l.id = (_payload->>'level_id')::UUID AND s.project_id = _project AND l.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Floor is not in this project';
  END IF;
  INSERT INTO public.realestate_units (
    company_id, project_id, phase_id, structure_id, level_id, unit_code, kind, status,
    construction_status, carpet_area, built_up_area, saleable_area, land_area, list_price_minor, notes, created_by
  ) VALUES (
    _company_id, _project, NULLIF(_payload->>'phase_id', '')::UUID, NULLIF(_payload->>'structure_id', '')::UUID,
    NULLIF(_payload->>'level_id', '')::UUID, trim(_payload->>'unit_code'), COALESCE(_payload->>'kind', 'apartment'),
    _status, COALESCE(NULLIF(_payload->>'construction_status', ''), 'not_started'),
    COALESCE((_payload->>'carpet_area')::NUMERIC, 0), COALESCE((_payload->>'built_up_area')::NUMERIC, 0),
    COALESCE((_payload->>'saleable_area')::NUMERIC, 0), COALESCE((_payload->>'land_area')::NUMERIC, 0),
    COALESCE((_payload->>'list_price_minor')::BIGINT, 0), COALESCE(_payload->>'notes', ''), auth.uid()
  ) RETURNING id INTO _id;
  INSERT INTO public.realestate_unit_events (company_id, unit_id, event_type, to_value, reason, actor_user_id)
  VALUES (_company_id, _id, 'status', _status, 'Created', auth.uid());
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_create_unit(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.inventory.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  _id := public.realestate_internal_insert_unit(_company_id, _payload);
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'created', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_import_units(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row JSONB;
  _count INT := 0;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.inventory.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF jsonb_typeof(_payload->'rows') <> 'array' OR jsonb_array_length(_payload->'rows') = 0 THEN
    RAISE EXCEPTION 'Import needs at least one row';
  END IF;
  IF jsonb_array_length(_payload->'rows') > 200 THEN
    RAISE EXCEPTION 'Import at most 200 properties at a time';
  END IF;
  FOR _row IN SELECT value FROM jsonb_array_elements(_payload->'rows') LOOP
    PERFORM public.realestate_internal_insert_unit(
      _company_id,
      _row || jsonb_build_object('project_id', _payload->>'project_id')
    );
    _count := _count + 1;
  END LOOP;
  RETURN jsonb_build_object('id', NULL, 'journal_id', NULL, 'status', 'imported', 'replayed', false, 'reason', _count::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_reprice_unit(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _unit public.realestate_units;
  _next BIGINT := (_payload->>'list_price_minor')::BIGINT;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.inventory.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF _next IS NULL OR _next < 0 THEN RAISE EXCEPTION 'Price must be zero or positive'; END IF;
  SELECT * INTO _unit FROM public.realestate_units
  WHERE id = (_payload->>'unit_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found'; END IF;
  UPDATE public.realestate_units
  SET list_price_minor = _next, version = version + 1, updated_at = now()
  WHERE id = _unit.id;
  INSERT INTO public.realestate_unit_events (
    company_id, unit_id, event_type, from_value, to_value, amount_minor, reason, actor_user_id
  ) VALUES (
    _company_id, _unit.id, 'price', _unit.list_price_minor::TEXT, _next::TEXT, _next,
    COALESCE(_payload->>'reason', ''), auth.uid()
  );
  RETURN jsonb_build_object('id', _unit.id, 'journal_id', NULL, 'status', 'repriced', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_transition_unit(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _unit public.realestate_units;
  _to TEXT := _payload->>'to_status';
  _open BOOLEAN;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.inventory.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _unit FROM public.realestate_units
  WHERE id = (_payload->>'unit_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found'; END IF;
  _open := EXISTS (
    SELECT 1 FROM public.realestate_sales
    WHERE unit_id = _unit.id AND company_id = _company_id AND status <> 'cancelled'
  );
  IF _unit.status = 'reserved' THEN
    RAISE EXCEPTION 'Release the reservation before changing this property';
  END IF;
  IF _to IN ('reserved', 'booked', 'under_agreement', 'sold') THEN
    RAISE EXCEPTION 'Use reservation, booking or the sale record for that status';
  END IF;
  IF _open AND _to IN ('available', 'on_hold', 'planned', 'under_development', 'withdrawn', 'cancelled', 'resale') THEN
    RAISE EXCEPTION 'Cancel the open sale before returning this property to inventory';
  END IF;
  IF NOT _open AND _to IN ('fully_paid', 'ready_for_handover', 'handed_over') THEN
    RAISE EXCEPTION 'Those statuses follow an open sale';
  END IF;
  IF _to = 'fully_paid' AND NOT EXISTS (
    SELECT 1 FROM public.realestate_sales
    WHERE unit_id = _unit.id AND company_id = _company_id AND status <> 'cancelled'
      AND collected_minor >= contract_minor
  ) THEN
    RAISE EXCEPTION 'Full payment is only available when collections cover the contract';
  END IF;
  PERFORM public.realestate_internal_transition(_company_id, _unit.id, _to, COALESCE(_payload->>'reason', ''));
  RETURN jsonb_build_object('id', _unit.id, 'journal_id', NULL, 'status', _to, 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_place_hold(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _unit public.realestate_units;
  _id UUID;
  _days INT;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF length(trim(COALESCE(_payload->>'holder_name', ''))) = 0 THEN
    RAISE EXCEPTION 'Reservation needs a holder name';
  END IF;
  SELECT * INTO _unit FROM public.realestate_units
  WHERE id = (_payload->>'unit_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found'; END IF;
  IF _unit.status NOT IN ('available', 'on_hold', 'resale') THEN
    RAISE EXCEPTION 'This property cannot be reserved from status %', _unit.status;
  END IF;
  SELECT reservation_hold_days INTO _days FROM public.realestate_settings WHERE company_id = _company_id;
  INSERT INTO public.realestate_holds (company_id, unit_id, contact_id, holder_name, status, expires_at, created_by)
  VALUES (
    _company_id, _unit.id, NULLIF(_payload->>'contact_id', '')::UUID, trim(_payload->>'holder_name'),
    'active', now() + make_interval(days => _days), auth.uid()
  ) RETURNING id INTO _id;
  PERFORM public.realestate_internal_transition(_company_id, _unit.id, 'reserved', 'Reservation');
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_release_hold(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hold public.realestate_holds;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _hold FROM public.realestate_holds
  WHERE id = (_payload->>'hold_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _hold.status <> 'active' THEN RAISE EXCEPTION 'Active reservation not found'; END IF;
  UPDATE public.realestate_holds SET status = 'released' WHERE id = _hold.id;
  PERFORM public.realestate_internal_transition(
    _company_id, _hold.unit_id, 'available', COALESCE(_payload->>'reason', 'Reservation released')
  );
  RETURN jsonb_build_object('id', _hold.id, 'journal_id', NULL, 'status', 'released', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_expire_holds(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hold public.realestate_holds;
  _count INT := 0;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  FOR _hold IN
    SELECT * FROM public.realestate_holds
    WHERE company_id = _company_id AND status = 'active' AND expires_at < now()
    FOR UPDATE
  LOOP
    UPDATE public.realestate_holds SET status = 'expired' WHERE id = _hold.id;
    IF EXISTS (
      SELECT 1 FROM public.realestate_units
      WHERE id = _hold.unit_id AND company_id = _company_id AND status = 'reserved'
    ) THEN
      PERFORM public.realestate_internal_transition(_company_id, _hold.unit_id, 'available', 'Reservation expired');
    END IF;
    _count := _count + 1;
  END LOOP;
  RETURN jsonb_build_object('id', NULL, 'journal_id', NULL, 'status', 'expired', 'replayed', false, 'reason', _count::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_confirm_booking(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hold public.realestate_holds;
  _unit public.realestate_units;
  _project public.realestate_projects;
  _id UUID;
  _contract BIGINT;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _hold FROM public.realestate_holds
  WHERE id = (_payload->>'hold_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _hold.status <> 'active' THEN RAISE EXCEPTION 'Active reservation not found'; END IF;
  SELECT * INTO _unit FROM public.realestate_units WHERE id = _hold.unit_id AND company_id = _company_id FOR UPDATE;
  IF _unit.status <> 'reserved' THEN RAISE EXCEPTION 'Property is not reserved'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = (_payload->>'contact_id')::UUID AND company_id = _company_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Choose an active contact in this organisation';
  END IF;
  SELECT * INTO _project FROM public.realestate_projects WHERE id = _unit.project_id;
  _contract := COALESCE(NULLIF((_payload->>'contract_minor')::BIGINT, 0), _unit.list_price_minor);
  IF _contract IS NULL OR _contract <= 0 THEN RAISE EXCEPTION 'Contract amount must be positive'; END IF;
  INSERT INTO public.realestate_sales (
    company_id, project_id, unit_id, contact_id, hold_id, sale_number, status, contract_minor, currency_code, created_by
  ) VALUES (
    _company_id, _unit.project_id, _unit.id, (_payload->>'contact_id')::UUID, _hold.id,
    public.realestate_internal_number(_company_id, 'sale', 'SAL'),
    'booked', _contract, _project.currency_code, auth.uid()
  ) RETURNING id INTO _id;
  UPDATE public.realestate_holds SET status = 'converted' WHERE id = _hold.id;
  PERFORM public.realestate_internal_transition(_company_id, _unit.id, 'booked', 'Booking confirmed');
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'booked', 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_advance_sale(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _to TEXT := _payload->>'status';
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF _to = 'under_agreement' AND _sale.status <> 'booked' THEN
    RAISE EXCEPTION 'Only a booking can move to an agreement';
  END IF;
  IF _to = 'sold' AND _sale.status <> 'under_agreement' THEN
    RAISE EXCEPTION 'Only an agreement can be marked sold';
  END IF;
  IF _to NOT IN ('under_agreement', 'sold') THEN
    RAISE EXCEPTION 'Unsupported sale status';
  END IF;
  UPDATE public.realestate_sales SET status = _to WHERE id = _sale.id;
  PERFORM public.realestate_internal_transition(_company_id, _sale.unit_id, _to, COALESCE(_payload->>'reason', _to));
  RETURN jsonb_build_object('id', _sale.id, 'journal_id', NULL, 'status', _to, 'replayed', false, 'reason', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.realestate_save_plan(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.realestate_sales;
  _plan UUID;
  _version INT;
  _line JSONB;
  _sum BIGINT := 0;
  _seq INT := 0;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.sales.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  SELECT * INTO _sale FROM public.realestate_sales
  WHERE id = (_payload->>'sale_id')::UUID AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Open sale not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.realestate_instalments i
    JOIN public.realestate_payment_plans p ON p.id = i.plan_id
    WHERE p.sale_id = _sale.id AND p.status = 'active' AND i.allocated_minor > 0
  ) THEN
    RAISE EXCEPTION 'Collected instalments cannot be replaced';
  END IF;
  IF jsonb_typeof(_payload->'lines') <> 'array' OR jsonb_array_length(_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'A payment plan needs lines';
  END IF;
  FOR _line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    IF COALESCE((_line->>'amount_minor')::BIGINT, 0) <= 0 THEN
      RAISE EXCEPTION 'Every payment line must be a positive amount';
    END IF;
    _sum := _sum + (_line->>'amount_minor')::BIGINT;
  END LOOP;
  IF _sum <> _sale.contract_minor THEN
    RAISE EXCEPTION 'Payment lines must add up to the contract amount';
  END IF;
  UPDATE public.realestate_payment_plans SET status = 'superseded'
  WHERE sale_id = _sale.id AND status = 'active';
  SELECT COALESCE(MAX(version), 0) + 1 INTO _version FROM public.realestate_payment_plans WHERE sale_id = _sale.id;
  INSERT INTO public.realestate_payment_plans (company_id, sale_id, version, status, created_by)
  VALUES (_company_id, _sale.id, _version, 'active', auth.uid())
  RETURNING id INTO _plan;
  FOR _line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    _seq := _seq + 1;
    INSERT INTO public.realestate_instalments (
      company_id, plan_id, sale_id, sequence, kind, label, due_on, amount_minor
    ) VALUES (
      _company_id, _plan, _sale.id, _seq, COALESCE(_line->>'kind', 'instalment'),
      COALESCE(NULLIF(_line->>'label', ''), 'Instalment'), (_line->>'due_on')::DATE, (_line->>'amount_minor')::BIGINT
    );
  END LOOP;
  RETURN jsonb_build_object('id', _plan, 'journal_id', NULL, 'status', 'active', 'replayed', false, 'reason', NULL);
END;
$$;
