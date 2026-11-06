-- LinkBooks Budgets Batch 9: saved what-if assumptions, separate from approved budgets.
-- No forecast entries ever post journals or modify budget/budget_lines.
-- Preview works without this migration; saving/deleting a named scenario requires it.

CREATE TABLE IF NOT EXISTS public.budget_forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 100),
  method TEXT NOT NULL CHECK (method IN ('budget', 'run_rate')),
  income_adjustment_bps INTEGER NOT NULL CHECK (income_adjustment_bps BETWEEN -10000 AND 50000),
  expense_adjustment_bps INTEGER NOT NULL CHECK (expense_adjustment_bps BETWEEN -10000 AND 50000),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_forecast_unique_name
  ON public.budget_forecast_scenarios (company_id, budget_id, lower(name));
CREATE INDEX IF NOT EXISTS budget_forecast_company_idx
  ON public.budget_forecast_scenarios (company_id, budget_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.budget_forecast_scenario_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS budget_forecast_event_history
  ON public.budget_forecast_scenario_events (budget_id, scenario_id, recorded_at DESC);

ALTER TABLE public.budget_forecast_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_forecast_scenario_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view forecast scenarios"
  ON public.budget_forecast_scenarios;
CREATE POLICY "Members view forecast scenarios" ON public.budget_forecast_scenarios
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS "Members view forecast scenario history"
  ON public.budget_forecast_scenario_events;
CREATE POLICY "Members view forecast scenario history" ON public.budget_forecast_scenario_events
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
REVOKE ALL ON public.budget_forecast_scenarios, public.budget_forecast_scenario_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.budget_forecast_scenarios, public.budget_forecast_scenario_events
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_budget_forecast_scenario(
  _company_id UUID,
  _budget_id UUID,
  _scenario_id UUID,
  _expected_updated_at TIMESTAMPTZ,
  _name TEXT,
  _method TEXT,
  _income_bps INTEGER,
  _expense_bps INTEGER,
  _notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor UUID := auth.uid();
  _id UUID;
  _updated TIMESTAMPTZ;
  _old public.budget_forecast_scenarios%ROWTYPE;
  _saved public.budget_forecast_scenarios%ROWTYPE;
  _action TEXT;
  _clean_name TEXT := btrim(COALESCE(_name,''));
  _clean_notes TEXT := NULLIF(btrim(COALESCE(_notes,'')),'');
BEGIN
  IF _actor IS NULL OR NOT public.is_company_member(_company_id)
    OR NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'Not allowed to save this organisation forecast'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.budgets WHERE id = _budget_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Budget does not belong to this organisation';
  END IF;
  IF char_length(_clean_name) NOT BETWEEN 3 AND 100
    OR _method IS NULL OR _method NOT IN ('budget','run_rate')
    OR _income_bps IS NULL OR _income_bps NOT BETWEEN -10000 AND 50000
    OR _expense_bps IS NULL OR _expense_bps NOT BETWEEN -10000 AND 50000
    OR char_length(COALESCE(_clean_notes,'')) > 1000 THEN
    RAISE EXCEPTION 'Invalid scenario name, method, adjustment or notes';
  END IF;

  IF _scenario_id IS NULL THEN
    IF _expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'New forecast must not specify an existing scenario version';
    END IF;
    INSERT INTO public.budget_forecast_scenarios (
      company_id,budget_id,name,method,income_adjustment_bps,
      expense_adjustment_bps,notes,created_by,updated_by
    ) VALUES (
      _company_id,_budget_id,_clean_name,_method,_income_bps,
      _expense_bps,_clean_notes,_actor,_actor
    ) RETURNING * INTO _saved;
    _action := 'created';
  ELSE
    IF _expected_updated_at IS NULL THEN
      RAISE EXCEPTION 'An existing scenario version is required before saving';
    END IF;
    SELECT * INTO _old FROM public.budget_forecast_scenarios
    WHERE id = _scenario_id AND company_id = _company_id AND budget_id = _budget_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Forecast scenario not found in this budget'; END IF;
    IF _old.updated_at IS DISTINCT FROM _expected_updated_at THEN
      RAISE EXCEPTION 'Scenario changed since it was opened. Reload before saving.'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.budget_forecast_scenarios SET
      name = _clean_name,
      method = _method,
      income_adjustment_bps = _income_bps,
      expense_adjustment_bps = _expense_bps,
      notes = _clean_notes,
      updated_by = _actor,
      updated_at = GREATEST(clock_timestamp(), _old.updated_at + INTERVAL '1 microsecond')
    WHERE id = _scenario_id RETURNING * INTO _saved;
    _action := 'updated';
  END IF;

  INSERT INTO public.budget_forecast_scenario_events(
    company_id,budget_id,scenario_id,action,recorded_by,snapshot
  ) VALUES (
    _company_id,_budget_id,_saved.id,_action,_actor,
    jsonb_build_object('name',_saved.name,'method',_saved.method,
      'income_bps',_saved.income_adjustment_bps,
      'expense_bps',_saved.expense_adjustment_bps,
      'notes',_saved.notes,'updated_at',_saved.updated_at)
  );
  PERFORM public.record_audit_event(
    _company_id, 'budget.forecast_' || _action, 'budget', _budget_id,
    jsonb_build_object('scenario_id',_saved.id,'name',_saved.name)
  );
  RETURN jsonb_build_object('id',_saved.id,'updated_at',_saved.updated_at);
END;
$$;
REVOKE ALL ON FUNCTION public.save_budget_forecast_scenario(
  UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,INTEGER,INTEGER,TEXT
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_budget_forecast_scenario(
  UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,INTEGER,INTEGER,TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_budget_forecast_scenario(
  _company_id UUID,
  _budget_id UUID,
  _scenario_id UUID,
  _expected_updated_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor UUID := auth.uid();
  _existing public.budget_forecast_scenarios%ROWTYPE;
BEGIN
  IF _actor IS NULL OR NOT public.is_company_member(_company_id)
    OR NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'Not allowed to delete a forecast in this organisation'
      USING ERRCODE = '42501';
  END IF;
  IF _scenario_id IS NULL OR _expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Choose a saved scenario and its current version';
  END IF;
  SELECT * INTO _existing FROM public.budget_forecast_scenarios
  WHERE id = _scenario_id AND budget_id = _budget_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forecast scenario not found'; END IF;
  IF _existing.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'Scenario changed since it was opened. Reload before deleting.'
      USING ERRCODE = '40001';
  END IF;
  DELETE FROM public.budget_forecast_scenarios WHERE id = _scenario_id;
  INSERT INTO public.budget_forecast_scenario_events(
    company_id,budget_id,scenario_id,action,recorded_by,snapshot
  ) VALUES (
    _company_id,_budget_id,_scenario_id,'deleted',_actor,
    jsonb_build_object('name',_existing.name,'method',_existing.method,
      'income_bps',_existing.income_adjustment_bps,
      'expense_bps',_existing.expense_adjustment_bps,
      'notes',_existing.notes,'updated_at',_existing.updated_at)
  );
  PERFORM public.record_audit_event(
    _company_id,'budget.forecast_deleted','budget',_budget_id,
    jsonb_build_object('scenario_id',_scenario_id,'name',_existing.name)
  );
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_budget_forecast_scenario(
  UUID,UUID,UUID,TIMESTAMPTZ
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_budget_forecast_scenario(
  UUID,UUID,UUID,TIMESTAMPTZ
) TO authenticated;
