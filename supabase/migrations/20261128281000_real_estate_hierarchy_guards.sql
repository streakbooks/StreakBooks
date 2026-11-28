-- A structure may only use a phase from its own project, and a unit floor
-- must belong to the structure selected with it.

CREATE OR REPLACE FUNCTION public.realestate_create_structure(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _project UUID := (_payload->>'project_id')::UUID;
BEGIN
  PERFORM public.realestate_internal_require(_company_id, 'realestate.manage');
  PERFORM public.realestate_internal_enabled(_company_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.realestate_projects
    WHERE id = _project AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF NULLIF(_payload->>'phase_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.realestate_phases
    WHERE id = (_payload->>'phase_id')::UUID AND project_id = _project AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Phase is not in this project';
  END IF;
  INSERT INTO public.realestate_structures (company_id, project_id, phase_id, kind, code, name)
  VALUES (
    _company_id, _project, NULLIF(_payload->>'phase_id', '')::UUID,
    COALESCE(_payload->>'kind', 'building'), trim(_payload->>'code'), trim(_payload->>'name')
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
  IF NULLIF(_payload->>'structure_id', '') IS NOT NULL
     AND NULLIF(_payload->>'level_id', '') IS NOT NULL
     AND NOT EXISTS (
    SELECT 1 FROM public.realestate_levels
    WHERE id = (_payload->>'level_id')::UUID
      AND structure_id = (_payload->>'structure_id')::UUID
      AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Floor is not in this structure';
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
