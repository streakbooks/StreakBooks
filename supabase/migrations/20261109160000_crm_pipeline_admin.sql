-- CRM-05: admin RPCs to create/update pipelines and stages (mutations via SECURITY DEFINER).
-- Authenticated clients retain SELECT-only table grants; writes require crm.admin.

CREATE OR REPLACE FUNCTION public.upsert_crm_pipeline(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _name TEXT := NULLIF(trim(COALESCE(_payload->>'name', '')), '');
  _description TEXT := NULLIF(trim(COALESCE(_payload->>'description', '')), '');
  _is_default BOOLEAN := COALESCE((_payload->>'isDefault')::BOOLEAN, false);
  _is_active BOOLEAN := COALESCE((_payload->>'isActive')::BOOLEAN, true);
  _sort_order INTEGER := COALESCE((_payload->>'sortOrder')::INTEGER, 100);
  _row public.crm_pipelines%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.admin');
  PERFORM private.crm_seed_defaults(_company_id);

  IF _name IS NULL OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Pipeline name is required (1–120 characters)';
  END IF;
  IF _sort_order < 0 OR _sort_order > 100000 THEN
    RAISE EXCEPTION 'sortOrder out of range';
  END IF;

  IF _id IS NOT NULL THEN
    SELECT * INTO _row FROM public.crm_pipelines
    WHERE id = _id AND company_id = _company_id FOR UPDATE;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Pipeline not found';
    END IF;
    IF _row.is_default AND NOT _is_active THEN
      RAISE EXCEPTION 'Cannot deactivate the default pipeline';
    END IF;
    IF _row.is_default AND NOT _is_default THEN
      RAISE EXCEPTION 'Assign another default before unsetting this pipeline';
    END IF;

    UPDATE public.crm_pipelines
    SET
      name = _name,
      description = _description,
      is_default = _is_default,
      is_active = _is_active,
      sort_order = _sort_order,
      updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    INSERT INTO public.crm_pipelines (
      company_id, name, description, is_default, is_active, sort_order
    ) VALUES (
      _company_id, _name, _description, _is_default, _is_active, _sort_order
    )
    RETURNING * INTO _row;

    -- Seed a minimal open / won / lost stage set for new pipelines
    INSERT INTO public.crm_pipeline_stages (
      company_id, pipeline_id, name, probability_pct, sort_order, is_won, is_lost
    ) VALUES
      (_company_id, _row.id, 'Qualification', 10, 10, false, false),
      (_company_id, _row.id, 'Proposal', 50, 20, false, false),
      (_company_id, _row.id, 'Won', 100, 30, true, false),
      (_company_id, _row.id, 'Lost', 0, 40, false, true);
  END IF;

  IF _is_default THEN
    UPDATE public.crm_pipelines
    SET is_default = false, updated_at = now()
    WHERE company_id = _company_id AND id <> _row.id AND is_default;

    UPDATE public.crm_settings
    SET default_pipeline_id = _row.id, updated_at = now()
    WHERE company_id = _company_id;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'name', _row.name,
    'description', _row.description,
    'isDefault', _row.is_default,
    'isActive', _row.is_active,
    'sortOrder', _row.sort_order
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_pipeline(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_pipeline(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_crm_pipeline_stage(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _pipeline_id UUID := NULLIF(_payload->>'pipelineId', '')::UUID;
  _name TEXT := NULLIF(trim(COALESCE(_payload->>'name', '')), '');
  _probability INTEGER := COALESCE((_payload->>'probabilityPct')::INTEGER, 0);
  _sort_order INTEGER := COALESCE((_payload->>'sortOrder')::INTEGER, 100);
  _is_won BOOLEAN := COALESCE((_payload->>'isWon')::BOOLEAN, false);
  _is_lost BOOLEAN := COALESCE((_payload->>'isLost')::BOOLEAN, false);
  _is_active BOOLEAN := COALESCE((_payload->>'isActive')::BOOLEAN, true);
  _row public.crm_pipeline_stages%ROWTYPE;
  _open_count INTEGER;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.admin');

  IF _pipeline_id IS NULL THEN
    RAISE EXCEPTION 'pipelineId is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_pipelines
    WHERE id = _pipeline_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Pipeline not found';
  END IF;
  IF _name IS NULL OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Stage name is required (1–120 characters)';
  END IF;
  IF _probability < 0 OR _probability > 100 THEN
    RAISE EXCEPTION 'probabilityPct must be 0–100';
  END IF;
  IF _is_won AND _is_lost THEN
    RAISE EXCEPTION 'Stage cannot be both won and lost';
  END IF;
  IF _sort_order < 0 OR _sort_order > 100000 THEN
    RAISE EXCEPTION 'sortOrder out of range';
  END IF;

  IF _id IS NOT NULL THEN
    SELECT * INTO _row FROM public.crm_pipeline_stages
    WHERE id = _id AND company_id = _company_id AND pipeline_id = _pipeline_id
    FOR UPDATE;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Stage not found';
    END IF;

    IF NOT _is_active AND _row.is_active THEN
      SELECT COUNT(*) INTO _open_count
      FROM public.crm_opportunities
      WHERE company_id = _company_id
        AND stage_id = _row.id
        AND status = 'open'
        AND archived_at IS NULL;
      IF _open_count > 0 THEN
        RAISE EXCEPTION 'Cannot deactivate a stage that still has open opportunities (% open)',
          _open_count;
      END IF;
    END IF;

    UPDATE public.crm_pipeline_stages
    SET
      name = _name,
      probability_pct = _probability,
      sort_order = _sort_order,
      is_won = _is_won,
      is_lost = _is_lost,
      is_active = _is_active
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    INSERT INTO public.crm_pipeline_stages (
      company_id, pipeline_id, name, probability_pct, sort_order, is_won, is_lost, is_active
    ) VALUES (
      _company_id, _pipeline_id, _name, _probability, _sort_order, _is_won, _is_lost, _is_active
    )
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'pipelineId', _row.pipeline_id,
    'name', _row.name,
    'probabilityPct', _row.probability_pct,
    'sortOrder', _row.sort_order,
    'isWon', _row.is_won,
    'isLost', _row.is_lost,
    'isActive', _row.is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_pipeline_stage(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_pipeline_stage(UUID, JSONB) TO authenticated;
