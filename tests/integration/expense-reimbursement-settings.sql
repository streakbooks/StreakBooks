SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  _claim jsonb;
  _journal uuid;
  _payable uuid := '20000000-0000-4000-8000-000000000013';
  _bank uuid := '20000000-0000-4000-8000-000000000014';
  _company uuid := '10000000-0000-4000-8000-000000000013';
BEGIN
  _claim := public.reimburse_expense_claim(
    _company,
    '40000000-0000-4000-8000-000000000013',
    _bank,
    1,
    '2026-11-27',
    NULL
  );

  IF _claim->>'reimbursement_status' <> 'paid'
     OR (_claim->>'reimbursed_minor')::bigint <> 12345 THEN
    RAISE EXCEPTION 'Configured-account reimbursement did not complete the claim';
  END IF;

  _journal := (_claim->>'reimbursement_journal_id')::uuid;
  IF _journal IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.journals j
    WHERE j.id = _journal AND j.company_id = _company AND j.status = 'posted'
  ) THEN
    RAISE EXCEPTION 'Reimbursement did not create its posted journal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl
    WHERE jl.journal_id = _journal AND jl.account_id = _payable
      AND jl.debit_minor = 12345 AND jl.credit_minor = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl
    WHERE jl.journal_id = _journal AND jl.account_id = _bank
      AND jl.debit_minor = 0 AND jl.credit_minor = 12345
  ) OR (
    SELECT COALESCE(sum(debit_minor - credit_minor), 1)
    FROM public.journal_lines WHERE journal_id = _journal
  ) <> 0 THEN
    RAISE EXCEPTION 'Configured employee payable account did not reach balanced reimbursement journal';
  END IF;

  IF (SELECT count(*) FROM public.expense_claim_reimbursement_payments
      WHERE claim_id = '40000000-0000-4000-8000-000000000013'
        AND journal_id = _journal AND amount_minor = 12345) <> 1 THEN
    RAISE EXCEPTION 'Reimbursement payment record does not reference the posted journal';
  END IF;
END $$;

SELECT 'PASS: expense payable setting reaches the posted reimbursement journal' AS result;
