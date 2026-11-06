-- LinkBooks Budgets Batch 7: allocations by existing class, department, or location.
-- Requires 20261025400100_budgets.sql, 20261020240000_settings_governance_dimensions.sql,
-- 20261106173000_budget_governance_revisions.sql, and
-- 20261106193000_budget_approval_workflows.sql.
-- Allocations are an independent planning breakdown, NEVER additive to the general budget.
-- No journal/ledger movements are written.

CREATE TABLE IF NOT EXISTS public.budget_dimension_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.tracking_categories(id) ON DELETE RESTRICT,
  option_id UUID NOT NULL REFERENCES public.tracking_options(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  period_month DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor BETWEEN 1 AND 900000000000000),
  CONSTRAINT budget_dim_first_month CHECK (EXTRACT(DAY FROM period_month) = 1),
  CONSTRAINT budget_dim_unique_cell
    UNIQUE (budget_id, category_id, option_id, account_id, period_month)
);
CREATE INDEX IF NOT EXISTS budget_dim_by_company
  ON public.budget_dimension_lines(company_id,budget_id,category_id);
CREATE INDEX IF NOT EXISTS budget_dim_by_account_month
  ON public.budget_dimension_lines(budget_id,account_id,period_month);

CREATE TABLE IF NOT EXISTS public.budget_dimension_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.tracking_categories(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version >= 1),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  line_count INTEGER NOT NULL CHECK(line_count >= 0),
  snapshot JSONB NOT NULL,
  UNIQUE (budget_id,category_id,version)
);
CREATE INDEX IF NOT EXISTS budget_dim_history
  ON public.budget_dimension_revisions (budget_id,category_id,version DESC);

ALTER TABLE public.budget_dimension_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_dimension_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read budget dimension lines"
  ON public.budget_dimension_lines;
CREATE POLICY "Members read budget dimension lines"
  ON public.budget_dimension_lines FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS "Members read budget dimension revisions"
  ON public.budget_dimension_revisions;
CREATE POLICY "Members read budget dimension revisions"
  ON public.budget_dimension_revisions FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
REVOKE ALL ON public.budget_dimension_lines,public.budget_dimension_revisions
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_dimension_lines,public.budget_dimension_revisions
  TO authenticated;

-- Existing budget line edits MUST keep dimension allocations within their
-- base budget ceiling; deferring until commit allows legitimate full replacements.
CREATE OR REPLACE FUNCTION public.budget_dimension_check_base_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _budget UUID;
  _account UUID;
  _month DATE;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    _budget := OLD.budget_id; _account := OLD.account_id; _month := OLD.period_month;
    IF EXISTS (
      SELECT 1 FROM public.budget_dimension_lines AS d
      WHERE d.budget_id = _budget AND d.account_id = _account AND d.period_month = _month
      GROUP BY d.category_id
      HAVING SUM(d.amount_minor::NUMERIC) > COALESCE((
        SELECT b.amount_minor FROM public.budget_lines AS b
        WHERE b.budget_id = _budget AND b.account_id = _account AND b.period_month = _month
      ), 0)
    ) THEN
      RAISE EXCEPTION 'Main budget cannot be reduced below its class/location allocations'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN
    _budget := NEW.budget_id; _account := NEW.account_id; _month := NEW.period_month;
    IF EXISTS (
      SELECT 1 FROM public.budget_dimension_lines AS d
      WHERE d.budget_id = _budget AND d.account_id = _account AND d.period_month = _month
      GROUP BY d.category_id
      HAVING SUM(d.amount_minor::NUMERIC) > COALESCE((
        SELECT b.amount_minor FROM public.budget_lines AS b
        WHERE b.budget_id = _budget AND b.account_id = _account AND b.period_month = _month
      ), 0)
    ) THEN
      RAISE EXCEPTION 'Main budget cannot be reduced below its class/location allocations'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.budget_dimension_check_base_line()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS budget_dimension_main_ceiling ON public.budget_lines;
CREATE CONSTRAINT TRIGGER budget_dimension_main_ceiling
AFTER INSERT OR UPDATE OR DELETE ON public.budget_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.budget_dimension_check_base_line();

-- Reject writes to breakdown allocations while a plan is manually locked or under review.
-- Security-definer RPC also checks these before writing, under the header row lock.
CREATE OR REPLACE FUNCTION public.budget_dimension_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _budget_id UUID;
  _new_budget_id UUID;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN _budget_id := OLD.budget_id; END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN _new_budget_id := NEW.budget_id; END IF;
  IF EXISTS (
    SELECT 1 FROM public.budget_governance AS g
    WHERE g.is_locked AND (g.budget_id = _budget_id OR g.budget_id = _new_budget_id)
  ) OR EXISTS (
    SELECT 1 FROM public.budget_approval_state AS a
    WHERE a.status IN ('pending','approved')
      AND (a.budget_id = _budget_id OR a.budget_id = _new_budget_id)
  ) THEN
    RAISE EXCEPTION 'Budget is locked or awaiting approval'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.budget_dimension_write_guard()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS budget_dimension_guard_changes ON public.budget_dimension_lines;
CREATE TRIGGER budget_dimension_guard_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.budget_dimension_lines
FOR EACH ROW EXECUTE FUNCTION public.budget_dimension_write_guard();

CREATE OR REPLACE FUNCTION public.save_budget_dimension_category(
  _company_id UUID,
  _budget_id UUID,
  _category_id UUID,
  _expected_updated_at TIMESTAMPTZ,
  _lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor UUID := auth.uid();
  _budget public.budgets%ROWTYPE;
  _category public.tracking_categories%ROWTYPE;
  _line JSONB;
  _option UUID;
  _account UUID;
  _month DATE;
  _amount BIGINT;
  _inserted INTEGER := 0;
  _last_version INTEGER;
  _snapshot JSONB;
  _updated_at TIMESTAMPTZ;
BEGIN
  IF _actor IS NULL OR _company_id IS NULL
    OR NOT public.is_company_member(_company_id)
    OR NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'Not permitted to change these budget allocations'
      USING ERRCODE = '42501';
  END IF;
  IF _expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Reload the budget before editing allocations';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array'
    OR jsonb_array_length(_lines) > 5000 THEN
    RAISE EXCEPTION 'Provide an allocation array of at most 5000 entries';
  END IF;

  SELECT * INTO _budget FROM public.budgets
  WHERE company_id = _company_id AND id = _budget_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found'; END IF;
  IF _budget.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'The budget changed since it was opened. Reload and retry.'
      USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.budget_governance AS g
    WHERE g.budget_id = _budget_id AND g.is_locked
  ) OR EXISTS (
    SELECT 1 FROM public.budget_approval_state AS a
    WHERE a.budget_id = _budget_id AND a.status IN ('pending','approved')
  ) THEN
    RAISE EXCEPTION 'Budget is locked or awaiting approval' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _category FROM public.tracking_categories
  WHERE id = _category_id AND company_id = _company_id
    AND is_active AND dimension_kind IN ('class','department','location');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active class, department or location category';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.budget_dimension_lines AS d
    LEFT JOIN public.tracking_options AS o ON o.id = d.option_id
    WHERE d.budget_id = _budget_id AND d.category_id = _category_id
      AND (o.id IS NULL OR NOT o.is_active)
  ) THEN
    RAISE EXCEPTION 'This category contains inactive allocation options. Reactivate them before editing.';
  END IF;

  -- All checks and writes run in this single transaction; any exception rolls back.
  DELETE FROM public.budget_dimension_lines
  WHERE budget_id = _budget_id AND category_id = _category_id;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    BEGIN
      _option := (_line->>'option_id')::UUID;
      _account := (_line->>'account_id')::UUID;
      _month := (_line->>'period_month')::DATE;
      IF jsonb_typeof(_line->'amount_minor') <> 'number'
        OR (_line->>'amount_minor') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Amount must be a nonnegative integer';
      END IF;
      _amount := (_line->>'amount_minor')::BIGINT;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range
      OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Allocation contains an invalid account, option, month or amount';
    END;
    IF _option IS NULL OR _account IS NULL OR _month IS NULL THEN
      RAISE EXCEPTION 'Allocation option, account and month are required';
    END IF;
    IF _month < _budget.fiscal_year_start
      OR _month >= (_budget.fiscal_year_start + INTERVAL '12 months')::DATE
      OR EXTRACT(DAY FROM _month) <> 1 THEN
      RAISE EXCEPTION 'Allocation month is outside the budget financial year';
    END IF;
    IF _amount > 900000000000000 THEN RAISE EXCEPTION 'Allocation amount is too large'; END IF;
    IF _amount = 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tracking_options AS o
      WHERE o.id = _option AND o.category_id = _category_id
        AND o.company_id = _company_id AND o.is_active
    ) THEN
      RAISE EXCEPTION 'Allocation option does not belong to the active category';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts AS a
      WHERE a.id = _account AND a.company_id = _company_id
        AND a.account_type IN ('income','expense')
        AND a.is_active AND a.is_postable AND a.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Allocations require active, postable income/expense accounts';
    END IF;
    INSERT INTO public.budget_dimension_lines (
      company_id,budget_id,category_id,option_id,account_id,period_month,amount_minor
    ) VALUES (
      _company_id,_budget_id,_category_id,_option,_account,_month,_amount
    );
    _inserted := _inserted + 1;
  END LOOP;

  -- Across all options of this category, not beyond the matching main-budget cell.
  IF EXISTS (
    SELECT 1 FROM public.budget_dimension_lines AS d
    LEFT JOIN public.budget_lines AS b
      ON b.budget_id = d.budget_id AND b.account_id = d.account_id
      AND b.period_month = d.period_month
    WHERE d.budget_id = _budget_id AND d.category_id = _category_id
    GROUP BY d.account_id,d.period_month,b.amount_minor
    HAVING SUM(d.amount_minor::NUMERIC) > COALESCE(b.amount_minor, 0)
  ) THEN
    RAISE EXCEPTION 'Class/location allocations exceed an account monthly budget'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(MAX(version),0) INTO _last_version
  FROM public.budget_dimension_revisions
  WHERE budget_id = _budget_id AND category_id = _category_id;
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'option_id',d.option_id,'account_id',d.account_id,
      'period_month',d.period_month,'amount_minor',d.amount_minor
    ) ORDER BY d.option_id,d.account_id,d.period_month),
    '[]'::jsonb
  ) INTO _snapshot
  FROM public.budget_dimension_lines AS d
  WHERE d.budget_id = _budget_id AND d.category_id = _category_id;

  INSERT INTO public.budget_dimension_revisions (
    company_id,budget_id,category_id,version,recorded_by,line_count,snapshot
  ) VALUES (_company_id,_budget_id,_category_id,_last_version+1,_actor,_inserted,_snapshot);

  -- Advances the same stale-edit token used by the core editor, and coordinates
  -- with the existing budget revision/governance triggers.
  UPDATE public.budgets SET
    updated_at = GREATEST(clock_timestamp(), _budget.updated_at + INTERVAL '1 microsecond')
  WHERE id = _budget_id;
  SELECT updated_at INTO _updated_at FROM public.budgets WHERE id = _budget_id;

  PERFORM public.record_audit_event(
    _company_id,'budget.dimension_allocations_saved','budget',_budget_id,
    jsonb_build_object('category_id',_category_id,'lines',_inserted,
                       'allocation_version',_last_version+1)
  );
  RETURN jsonb_build_object(
    'stored',_inserted,'version',_last_version+1,'updated_at',_updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_budget_dimension_category(
  UUID,UUID,UUID,TIMESTAMPTZ,JSONB
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_budget_dimension_category(
  UUID,UUID,UUID,TIMESTAMPTZ,JSONB
) TO authenticated;
