-- EM-06c: soft budget exposure for open expense claims vs budget lines (read-only).

CREATE OR REPLACE FUNCTION public.get_expense_budget_exposure(
  _company_id UUID,
  _as_of DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _day DATE := COALESCE(_as_of, CURRENT_DATE);
  _month DATE := date_trunc('month', _day)::DATE;
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'accounts.manage')
  ) THEN
    RAISE EXCEPTION 'Expense budget exposure access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.account_code, x.budget_name), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT
      bl.account_id,
      a.code AS account_code,
      a.name AS account_name,
      b.id AS budget_id,
      b.name AS budget_name,
      bl.period_month,
      bl.amount_minor AS budget_amount_minor,
      COALESCE(SUM(l.gross_minor), 0)::BIGINT AS open_claim_minor
    FROM public.budget_lines bl
    JOIN public.budgets b ON b.id = bl.budget_id AND b.company_id = bl.company_id
    JOIN public.accounts a ON a.id = bl.account_id AND a.company_id = bl.company_id
    LEFT JOIN public.expense_claim_lines l
      ON l.company_id = bl.company_id
     AND l.account_id = bl.account_id
     AND date_trunc('month', l.expense_date)::DATE = bl.period_month
    LEFT JOIN public.expense_claims c
      ON c.id = l.claim_id
     AND c.company_id = bl.company_id
     AND c.approval_status IN ('submitted', 'in_review', 'approved')
    WHERE bl.company_id = _company_id
      AND bl.period_month = _month
    GROUP BY
      bl.account_id, a.code, a.name, b.id, b.name, bl.period_month, bl.amount_minor
  ) x;

  RETURN jsonb_build_object(
    'as_of', _day,
    'period_month', _month,
    'rows', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_expense_budget_exposure(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expense_budget_exposure(UUID, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
