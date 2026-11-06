-- Save a complete existing budget (header + 12-month line grid) atomically.
-- The wrapper calls the verified budget RPCs inside one PostgreSQL transaction.
-- Failed account validation, stale edit detection or a lock leaves *no* partial updates.

CREATE OR REPLACE FUNCTION public.save_budget_document(
  _company_id UUID,
  _budget_id UUID,
  _name TEXT,
  _notes TEXT,
  _expected_updated_at TIMESTAMPTZ,
  _lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _budget public.budgets%ROWTYPE;
  _stored INTEGER;
  _updated_at TIMESTAMPTZ;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF _company_id IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage budgets'
      USING ERRCODE = '42501';
  END IF;

  IF _budget_id IS NULL THEN RAISE EXCEPTION 'Budget ID is required'; END IF;
  IF _expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Expected budget version is required; reload your budget.';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' THEN
    RAISE EXCEPTION 'Budget rows must be an array';
  END IF;
  IF jsonb_array_length(_lines) > 20000 THEN
    RAISE EXCEPTION 'Too many budget lines in one save';
  END IF;

  -- Serialization point: no two clients can both save against one old version.
  SELECT * INTO _budget
  FROM public.budgets
  WHERE id = _budget_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found in this organisation'; END IF;
  IF _budget.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION
      'This budget changed since it was opened. Copy your work if needed, then reload.'
      USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.budget_governance AS g
    WHERE g.budget_id = _budget_id AND g.is_locked
  ) THEN
    RAISE EXCEPTION 'Budget is locked; ask an authorised user to unlock it.'
      USING ERRCODE = '55000';
  END IF;

  -- The current editor lists active/postable accounts. Refuse a destructive
  -- "replace" when archived or non-postable historical amounts are invisible.
  IF EXISTS (
    SELECT 1
    FROM public.budget_lines AS l
    LEFT JOIN public.accounts AS a ON a.id = l.account_id
    WHERE l.budget_id = _budget_id
      AND (
        a.id IS NULL OR
        a.is_active IS DISTINCT FROM TRUE OR
        a.is_postable IS DISTINCT FROM TRUE OR
        a.archived_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'This budget contains historical inactive account amounts. No changes saved; resolve the inactive accounts first.';
  END IF;

  -- Reject non-postable accounts even when a caller bypasses the editor.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_lines) AS line
    JOIN public.accounts AS a ON a.id = (line.value->>'account_id')::UUID
    WHERE a.is_postable IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'Budget amounts require active, postable accounts';
  END IF;

  -- Both calls use the same connection, transaction and budget row lock.
  -- save_budget_lines fully validates all entries before replacing any amount.
  -- On any exception, header update and both audit events also roll back.
  PERFORM public.save_budget(
    _company_id, _budget_id, _name, _budget.fiscal_year_start, _notes
  );
  SELECT public.save_budget_lines(_budget_id, _lines, 'replace') INTO _stored;

  SELECT updated_at INTO _updated_at
  FROM public.budgets WHERE id = _budget_id AND company_id = _company_id;
  RETURN jsonb_build_object('stored', _stored, 'updated_at', _updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.save_budget_document(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_budget_document(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB
) TO authenticated;
