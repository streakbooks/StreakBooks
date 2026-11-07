-- Expense Management EM-05a: claim approval decisions (approve / return / reject / start review).
-- Requires claim lifecycle migration. Does not post journals or pay reimbursements.

CREATE OR REPLACE FUNCTION private.expense_claim_assert_approver(
  _company_id UUID,
  _claimant UUID
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _prevent_self BOOLEAN := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim approval denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(s.prevent_self_approval, true)
  INTO _prevent_self
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  IF COALESCE(_prevent_self, true) AND _claimant = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own expense claim. Ask another approver.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_expense_claim_review(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
BEGIN
  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.expense_claim_assert_approver(_company_id, _claim.claimant_user_id);

  IF _claim.approval_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted claims can move into review';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expense_claims SET
    approval_status = 'in_review',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'in_review',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Claim moved into review'
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_expense_claim(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _reimbursement TEXT;
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.expense_claim_assert_approver(_company_id, _claim.claimant_user_id);

  IF _claim.approval_status NOT IN ('submitted', 'in_review') THEN
    RAISE EXCEPTION 'Only submitted or in-review claims can be approved';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  _reimbursement := CASE
    WHEN _claim.payment_source = 'employee_paid' THEN 'eligible'
    ELSE 'not_eligible'
  END;

  UPDATE public.expense_claims SET
    approval_status = 'approved',
    posting_status = 'ready',
    reimbursement_status = _reimbursement,
    approved_at = clock_timestamp(),
    approved_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'approved',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    COALESCE(_note_clean, 'Claim approved'),
    jsonb_build_object('note', _note_clean)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.return_expense_claim(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.expense_claim_assert_approver(_company_id, _claim.claimant_user_id);

  IF _claim.approval_status NOT IN ('submitted', 'in_review') THEN
    RAISE EXCEPTION 'Only submitted or in-review claims can be returned';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _note_clean IS NULL THEN
    RAISE EXCEPTION 'A return reason is required';
  END IF;

  UPDATE public.expense_claims SET
    approval_status = 'returned',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'returned',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    _note_clean,
    jsonb_build_object('note', _note_clean)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_expense_claim(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.expense_claim_assert_approver(_company_id, _claim.claimant_user_id);

  IF _claim.approval_status NOT IN ('submitted', 'in_review') THEN
    RAISE EXCEPTION 'Only submitted or in-review claims can be rejected';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _note_clean IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  UPDATE public.expense_claims SET
    approval_status = 'rejected',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'rejected',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    _note_clean,
    jsonb_build_object('note', _note_clean)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

REVOKE ALL ON FUNCTION public.start_expense_claim_review(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_expense_claim(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_expense_claim(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_expense_claim(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_expense_claim_review(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense_claim(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_expense_claim(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_expense_claim(UUID, UUID, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
