-- Copy a budget atomically to a new financial year or a new scenario within the same year.
-- This function is deliberately an explicit tenant/permission-checked RPC: budget tables
-- grant SELECT only to authenticated members and do not permit direct client writes.
-- No general-ledger postings are made, and errors roll back the new header and every line.

CREATE OR REPLACE FUNCTION public.duplicate_budget(
  _company_id UUID,
  _source_budget_id UUID,
  _name TEXT,
  _fiscal_year_start DATE,
  _include_amounts BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _source public.budgets%ROWTYPE;
  _new_id UUID;
  _target_start DATE := _fiscal_year_start;
  _clean_name TEXT := NULLIF(btrim(COALESCE(_name, '')), '');
  _copy_lines BOOLEAN := COALESCE(_include_amounts, TRUE);
  _line_count INTEGER := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF _company_id IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage budgets' USING ERRCODE = '42501';
  END IF;
  IF _clean_name IS NULL OR char_length(_clean_name) > 120 THEN
    RAISE EXCEPTION 'Budget name must be 1 to 120 characters';
  END IF;
  IF _target_start IS NULL OR EXTRACT(DAY FROM _target_start) <> 1 THEN
    RAISE EXCEPTION 'The target financial year must start on the first of a month';
  END IF;

  -- A row lock serializes duplicate with edits to the source lines.
  SELECT * INTO _source
  FROM public.budgets
  WHERE id = _source_budget_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source budget not found in this organisation';
  END IF;

  IF _copy_lines AND EXISTS (
    SELECT 1
    FROM public.budget_lines AS l
    LEFT JOIN public.accounts AS a ON a.id = l.account_id
    WHERE l.budget_id = _source_budget_id
      AND (
        a.id IS NULL OR a.company_id <> _company_id
        OR a.is_active IS DISTINCT FROM TRUE
        OR a.is_postable IS DISTINCT FROM TRUE
        OR a.archived_at IS NOT NULL
        OR a.account_type NOT IN ('income', 'expense')
      )
  ) THEN
    RAISE EXCEPTION
      'Cannot duplicate amounts: one or more source accounts are inactive or not postable. Create an empty copy instead.';
  END IF;

  INSERT INTO public.budgets (company_id, name, fiscal_year_start, notes, created_by)
  VALUES (_company_id, _clean_name, _target_start, _source.notes, _user_id)
  RETURNING id INTO _new_id;

  IF _copy_lines THEN
    INSERT INTO public.budget_lines (
      budget_id, company_id, account_id, period_month, amount_minor
    )
    SELECT
      _new_id, _company_id, l.account_id,
      (_target_start + make_interval(
        months => 12 * (
          EXTRACT(YEAR FROM l.period_month)::INTEGER
          - EXTRACT(YEAR FROM _source.fiscal_year_start)::INTEGER
        ) + (
          EXTRACT(MONTH FROM l.period_month)::INTEGER
          - EXTRACT(MONTH FROM _source.fiscal_year_start)::INTEGER
        )
      ))::DATE,
      l.amount_minor
    FROM public.budget_lines AS l
    WHERE l.budget_id = _source_budget_id;
    GET DIAGNOSTICS _line_count = ROW_COUNT;
  END IF;

  PERFORM public.record_audit_event(
    _company_id, 'budget.duplicated', 'budget', _new_id,
    jsonb_build_object(
      'source_budget_id', _source_budget_id,
      'target_fiscal_year_start', _target_start,
      'copied_amounts', _copy_lines,
      'copied_line_count', _line_count
    )
  );

  RETURN _new_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A budget with that name already exists for this financial year';
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_budget(
  UUID, UUID, TEXT, DATE, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_budget(
  UUID, UUID, TEXT, DATE, BOOLEAN
) TO authenticated;
