-- EM-05e: multi-level approvals — N distinct approver decisions before claim is approved.

ALTER TABLE public.expense_management_settings
  ADD COLUMN IF NOT EXISTS required_approval_count INTEGER NOT NULL DEFAULT 1
    CHECK (required_approval_count >= 1 AND required_approval_count <= 10);

CREATE TABLE IF NOT EXISTS public.expense_claim_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  step_no INTEGER NOT NULL CHECK (step_no > 0),
  note TEXT,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT expense_claim_approvals_unique_approver UNIQUE (claim_id, approver_user_id),
  CONSTRAINT expense_claim_approvals_unique_step UNIQUE (claim_id, step_no),
  CONSTRAINT expense_claim_approvals_note_len CHECK (
    note IS NULL OR char_length(trim(note)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS expense_claim_approvals_claim_idx
  ON public.expense_claim_approvals (claim_id, step_no);

ALTER TABLE public.expense_claim_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_claim_approvals_select ON public.expense_claim_approvals;
CREATE POLICY expense_claim_approvals_select
  ON public.expense_claim_approvals FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

REVOKE ALL ON TABLE public.expense_claim_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_claim_approvals TO authenticated;
GRANT ALL ON TABLE public.expense_claim_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.save_expense_required_approval_count(
  _company_id UUID,
  _count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_management_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense settings update denied' USING ERRCODE = '42501';
  END IF;
  IF _count IS NULL OR _count < 1 OR _count > 10 THEN
    RAISE EXCEPTION 'Required approval count must be between 1 and 10';
  END IF;

  UPDATE public.expense_management_settings SET
    required_approval_count = _count,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE company_id = _company_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    INSERT INTO public.expense_management_settings (
      company_id, required_approval_count, created_by, updated_by
    ) VALUES (
      _company_id, _count, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'required_approval_count', _row.required_approval_count,
    'version', _row.version
  );
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
  _required INTEGER := 1;
  _have INTEGER := 0;
  _step INTEGER;
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

  IF EXISTS (
    SELECT 1 FROM public.expense_claim_approvals a
    WHERE a.claim_id = _claim.id AND a.approver_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You have already approved this claim';
  END IF;

  SELECT COALESCE(s.required_approval_count, 1)
  INTO _required
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  SELECT COUNT(*)::INTEGER INTO _have
  FROM public.expense_claim_approvals a
  WHERE a.claim_id = _claim.id;

  _step := _have + 1;

  INSERT INTO public.expense_claim_approvals (
    company_id, claim_id, approver_user_id, step_no, note
  ) VALUES (
    _company_id, _claim.id, auth.uid(), _step, _note_clean
  );

  IF _step < COALESCE(_required, 1) THEN
    UPDATE public.expense_claims SET
      approval_status = 'in_review',
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id
    RETURNING * INTO _claim;

    PERFORM private.expense_claim_event(
      _company_id, _claim.id, 'approval_step',
      _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
      COALESCE(_note_clean, 'Approval step recorded'),
      jsonb_build_object(
        'step_no', _step,
        'required_approval_count', _required,
        'note', _note_clean
      )
    );

    RETURN private.expense_claim_json(_claim);
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
    jsonb_build_object(
      'note', _note_clean,
      'step_no', _step,
      'required_approval_count', _required
    )
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_expense_claim_approvals(
  _company_id UUID,
  _claim_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
  _required INTEGER := 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(s.required_approval_count, 1)
  INTO _required
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.step_no), '[]'::jsonb)
  INTO _rows
  FROM public.expense_claim_approvals a
  WHERE a.company_id = _company_id AND a.claim_id = _claim_id;

  RETURN jsonb_build_object(
    'required_approval_count', COALESCE(_required, 1),
    'approvals', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_expense_required_approval_count(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_expense_claim_approvals(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_expense_required_approval_count(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_expense_claim_approvals(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense_claim(UUID, UUID, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
