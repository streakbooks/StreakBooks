-- EM-07b: batch reimbursement — pays selected open claims via existing reimburse_expense_claim.

CREATE OR REPLACE FUNCTION public.batch_reimburse_expense_claims(
  _company_id UUID,
  _claim_ids UUID[],
  _bank_account_id UUID,
  _payment_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claim_id UUID;
  _paid INTEGER := 0;
  _failed INTEGER := 0;
  _results JSONB := '[]'::jsonb;
  _claim public.expense_claims%ROWTYPE;
  _paid_claim JSONB;
  _err TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.reimburse')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim reimbursement denied' USING ERRCODE = '42501';
  END IF;
  IF _claim_ids IS NULL OR cardinality(_claim_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one claim to reimburse';
  END IF;
  IF cardinality(_claim_ids) > 50 THEN
    RAISE EXCEPTION 'Batch reimbursement is limited to 50 claims at a time';
  END IF;
  IF _bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Choose a valid bank or cash account for the reimbursement';
  END IF;

  FOREACH _claim_id IN ARRAY _claim_ids
  LOOP
    BEGIN
      SELECT * INTO _claim
      FROM public.expense_claims
      WHERE id = _claim_id AND company_id = _company_id;

      IF NOT FOUND THEN
        _failed := _failed + 1;
        _results := _results || jsonb_build_array(jsonb_build_object(
          'claim_id', _claim_id,
          'ok', false,
          'error', 'Claim not found'
        ));
        CONTINUE;
      END IF;

      _paid_claim := public.reimburse_expense_claim(
        _company_id,
        _claim_id,
        _bank_account_id,
        _claim.version,
        _payment_date
      );
      _paid := _paid + 1;
      _results := _results || jsonb_build_array(jsonb_build_object(
        'claim_id', _claim_id,
        'ok', true,
        'claim_number', _paid_claim->>'claim_number'
      ));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
      _failed := _failed + 1;
      _results := _results || jsonb_build_array(jsonb_build_object(
        'claim_id', _claim_id,
        'ok', false,
        'error', _err
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'paid_count', _paid,
    'failed_count', _failed,
    'results', _results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.batch_reimburse_expense_claims(UUID, UUID[], UUID, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_reimburse_expense_claims(UUID, UUID[], UUID, DATE)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
