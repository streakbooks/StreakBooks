-- EM-07d: suggest uncategorised bank transactions that may match open reimbursements.
-- Does not auto-categorise or create journals — suggestion only.

CREATE OR REPLACE FUNCTION public.suggest_expense_reimbursement_bank_matches(
  _company_id UUID,
  _limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _cap INTEGER := GREATEST(1, LEAST(COALESCE(_limit, 50), 100));
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.reimburse')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'banking.view')
  ) THEN
    RAISE EXCEPTION 'Expense bank match suggestion denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.claim_date DESC, s.claim_number), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT
      c.id AS claim_id,
      c.claim_number,
      c.title AS claim_title,
      c.claim_date,
      c.claim_currency,
      (COALESCE(c.reimbursable_minor, c.total_minor) - COALESCE(c.reimbursed_minor, 0)) AS remaining_minor,
      t.id AS bank_transaction_id,
      t.txn_date,
      t.amount_minor AS bank_amount_minor,
      t.description AS bank_description,
      t.bank_account_id
    FROM public.expense_claims c
    JOIN public.bank_transactions t
      ON t.company_id = c.company_id
     AND t.status = 'uncategorised'
     AND t.amount_minor < 0
     AND ABS(t.amount_minor) = (COALESCE(c.reimbursable_minor, c.total_minor) - COALESCE(c.reimbursed_minor, 0))
     AND t.txn_date BETWEEN (c.claim_date - 14) AND (CURRENT_DATE + 7)
    WHERE c.company_id = _company_id
      AND c.approval_status = 'approved'
      AND c.posting_status = 'posted'
      AND c.payment_source = 'employee_paid'
      AND c.reimbursement_status IN (
        'eligible', 'awaiting_payment', 'payment_initiated', 'payment_failed', 'partially_paid'
      )
      AND (COALESCE(c.reimbursable_minor, c.total_minor) - COALESCE(c.reimbursed_minor, 0)) > 0
      AND COALESCE(c.reimbursement_channel, 'bank') = 'bank'
    ORDER BY c.claim_date DESC, c.claim_number
    LIMIT _cap
  ) s;

  RETURN jsonb_build_object('suggestions', COALESCE(_rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_expense_reimbursement_bank_matches(UUID, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_expense_reimbursement_bank_matches(UUID, INTEGER)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
