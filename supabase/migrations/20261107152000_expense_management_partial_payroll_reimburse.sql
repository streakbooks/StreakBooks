-- EM-07c: partial reimbursements + payroll queue (no payroll payslip posting here).

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS reimbursed_minor BIGINT NOT NULL DEFAULT 0
    CHECK (reimbursed_minor >= 0),
  ADD COLUMN IF NOT EXISTS reimbursement_channel TEXT NOT NULL DEFAULT 'bank'
    CHECK (reimbursement_channel IN ('bank', 'payroll'));

CREATE TABLE IF NOT EXISTS public.expense_claim_reimbursement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  payment_date DATE NOT NULL,
  bank_account_id UUID,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL DEFAULT 'bank'
    CHECK (channel IN ('bank', 'payroll')),
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_claim_reimbursement_payments_note_len CHECK (
    note IS NULL OR char_length(trim(note)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS expense_claim_reimbursement_payments_claim_idx
  ON public.expense_claim_reimbursement_payments (claim_id, created_at DESC);

ALTER TABLE public.expense_claim_reimbursement_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_claim_reimbursement_payments_select
  ON public.expense_claim_reimbursement_payments;
CREATE POLICY expense_claim_reimbursement_payments_select
  ON public.expense_claim_reimbursement_payments FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

REVOKE ALL ON TABLE public.expense_claim_reimbursement_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_claim_reimbursement_payments TO authenticated;
GRANT ALL ON TABLE public.expense_claim_reimbursement_payments TO service_role;

CREATE OR REPLACE FUNCTION public.reimburse_expense_claim(
  _company_id UUID,
  _claim_id UUID,
  _bank_account_id UUID,
  _expected_version INTEGER,
  _payment_date DATE DEFAULT NULL,
  _amount_minor BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _payable UUID;
  _amount BIGINT;
  _remaining BIGINT;
  _pay_date DATE;
  _journal_id UUID;
  _idem TEXT;
  _existing UUID;
  _lines JSONB;
  _seq INTEGER;
  _status TEXT;
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

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _claim.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved claims can be reimbursed';
  END IF;
  IF _claim.payment_source <> 'employee_paid' THEN
    RAISE EXCEPTION 'Bank reimbursement applies only to employee-paid claims';
  END IF;
  IF _claim.posting_status <> 'posted' OR _claim.posted_journal_id IS NULL THEN
    RAISE EXCEPTION 'Post the claim accrual to the ledger before reimbursing';
  END IF;
  IF _claim.reimbursement_channel = 'payroll'
     AND _claim.reimbursement_status = 'payment_initiated' THEN
    RAISE EXCEPTION 'Claim is queued for payroll; cancel payroll queue before bank payment';
  END IF;
  IF _claim.reimbursement_status = 'paid' THEN
    RETURN private.expense_claim_json(_claim);
  END IF;
  IF _claim.reimbursement_status NOT IN (
    'eligible', 'awaiting_payment', 'payment_initiated', 'payment_failed', 'partially_paid'
  ) THEN
    RAISE EXCEPTION 'Claim is not open for reimbursement (status %)', _claim.reimbursement_status;
  END IF;

  IF _bank_account_id IS NULL OR NOT public.sales_is_deposit_account(_company_id, _bank_account_id) THEN
    RAISE EXCEPTION 'Choose a valid bank or cash account for the reimbursement';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.employee_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure the employee payable account in Expense Management settings before reimbursing';
  END IF;
  _payable := _settings.employee_payable_account_id;
  IF _payable = _bank_account_id THEN
    RAISE EXCEPTION 'Payable account and bank account must be different';
  END IF;

  _remaining := GREATEST(
    COALESCE(_claim.reimbursable_minor, _claim.total_minor) - COALESCE(_claim.reimbursed_minor, 0),
    0
  );
  IF _remaining <= 0 THEN
    UPDATE public.expense_claims SET
      reimbursement_status = 'paid',
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id
    RETURNING * INTO _claim;
    RETURN private.expense_claim_json(_claim);
  END IF;

  _amount := COALESCE(_amount_minor, _remaining);
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF _amount > _remaining THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds remaining reimbursable (%)', _amount, _remaining;
  END IF;

  SELECT COUNT(*)::INTEGER + 1 INTO _seq
  FROM public.expense_claim_reimbursement_payments
  WHERE claim_id = _claim.id;

  _pay_date := COALESCE(_payment_date, CURRENT_DATE);
  _idem := 'expense_claim:' || _claim.id::text || ':reimburse:' || _seq::text || ':' || _amount::text;

  SELECT id INTO _existing
  FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idem;
  IF _existing IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.expense_claim_reimbursement_payments p
      WHERE p.claim_id = _claim.id AND p.journal_id = _existing
    ) THEN
      INSERT INTO public.expense_claim_reimbursement_payments (
        company_id, claim_id, amount_minor, payment_date, bank_account_id,
        journal_id, channel, created_by
      ) VALUES (
        _company_id, _claim.id, _amount, _pay_date, _bank_account_id,
        _existing, 'bank', auth.uid()
      );
      UPDATE public.expense_claims SET
        reimbursed_minor = reimbursed_minor + _amount,
        reimbursement_journal_id = _existing,
        reimbursement_channel = 'bank',
        reimbursement_status = CASE
          WHEN reimbursed_minor + _amount >= reimbursable_minor THEN 'paid'
          ELSE 'partially_paid'
        END,
        version = version + 1,
        updated_by = auth.uid(),
        updated_at = clock_timestamp()
      WHERE id = _claim.id
      RETURNING * INTO _claim;
    END IF;
    RETURN private.expense_claim_json(_claim);
  END IF;

  UPDATE public.expense_claims SET
    reimbursement_status = 'payment_initiated',
    reimbursement_channel = 'bank',
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id;

  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _payable,
      'debit_minor', _amount,
      'credit_minor', 0,
      'description', 'Reimburse ' || _claim.claim_number
    ),
    jsonb_build_object(
      'account_id', _bank_account_id,
      'debit_minor', 0,
      'credit_minor', _amount,
      'description', 'Bank payment ' || _claim.claim_number
    )
  );

  BEGIN
    _journal_id := public.post_journal(jsonb_build_object(
      'company_id', _company_id,
      'journal_date', _pay_date,
      'currency_code', _claim.reimbursement_currency,
      'fx_rate_to_base', 1,
      'source_type', 'expense',
      'source_id', _claim.id,
      'idempotency_key', _idem,
      'memo', 'Reimburse expense claim ' || _claim.claim_number,
      'lines', _lines
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.expense_claims SET
      reimbursement_status = CASE
        WHEN COALESCE(reimbursed_minor, 0) > 0 THEN 'partially_paid'
        ELSE 'payment_failed'
      END,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id;
    RAISE;
  END;

  INSERT INTO public.expense_claim_reimbursement_payments (
    company_id, claim_id, amount_minor, payment_date, bank_account_id,
    journal_id, channel, created_by
  ) VALUES (
    _company_id, _claim.id, _amount, _pay_date, _bank_account_id,
    _journal_id, 'bank', auth.uid()
  );

  _status := CASE
    WHEN COALESCE(_claim.reimbursed_minor, 0) + _amount >= COALESCE(_claim.reimbursable_minor, _claim.total_minor)
      THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.expense_claims SET
    reimbursed_minor = COALESCE(reimbursed_minor, 0) + _amount,
    reimbursement_journal_id = _journal_id,
    reimbursement_channel = 'bank',
    reimbursement_status = _status,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id,
    CASE WHEN _status = 'paid' THEN 'reimbursed' ELSE 'partially_reimbursed' END,
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    CASE WHEN _status = 'paid' THEN 'Claim reimbursed from bank'
         ELSE 'Partial claim reimbursement from bank' END,
    jsonb_build_object(
      'journal_id', _journal_id,
      'bank_account_id', _bank_account_id,
      'amount_minor', _amount,
      'reimbursed_minor', _claim.reimbursed_minor
    )
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

-- Keep batch helper compatible with new signature (full remaining amount).
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

  FOREACH _claim_id IN ARRAY _claim_ids
  LOOP
    BEGIN
      SELECT * INTO _claim
      FROM public.expense_claims
      WHERE id = _claim_id AND company_id = _company_id;
      IF NOT FOUND THEN
        _failed := _failed + 1;
        _results := _results || jsonb_build_array(jsonb_build_object(
          'claim_id', _claim_id, 'ok', false, 'error', 'Claim not found'
        ));
        CONTINUE;
      END IF;
      _paid_claim := public.reimburse_expense_claim(
        _company_id, _claim_id, _bank_account_id, _claim.version, _payment_date, NULL
      );
      _paid := _paid + 1;
      _results := _results || jsonb_build_array(jsonb_build_object(
        'claim_id', _claim_id, 'ok', true, 'claim_number', _paid_claim->>'claim_number'
      ));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
      _failed := _failed + 1;
      _results := _results || jsonb_build_array(jsonb_build_object(
        'claim_id', _claim_id, 'ok', false, 'error', _err
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

CREATE OR REPLACE FUNCTION public.queue_expense_claim_for_payroll(
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.reimburse')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim payroll queue denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _claim.approval_status <> 'approved' OR _claim.posting_status <> 'posted' THEN
    RAISE EXCEPTION 'Only approved and posted claims can be queued for payroll';
  END IF;
  IF _claim.payment_source <> 'employee_paid' THEN
    RAISE EXCEPTION 'Only employee-paid claims can be queued for payroll';
  END IF;
  IF COALESCE(_claim.reimbursed_minor, 0) > 0 THEN
    RAISE EXCEPTION 'Partially bank-paid claims cannot move to payroll queue';
  END IF;
  IF _claim.reimbursement_status = 'paid' THEN
    RAISE EXCEPTION 'Claim is already reimbursed';
  END IF;

  UPDATE public.expense_claims SET
    reimbursement_channel = 'payroll',
    reimbursement_status = 'payment_initiated',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'queued_for_payroll',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Queued for payroll reimbursement (no payslip posting in this release)',
    jsonb_build_object('channel', 'payroll')
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_expense_claim_payroll_queue(
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.reimburse')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim payroll queue cancel denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _claim.reimbursement_channel <> 'payroll'
     OR _claim.reimbursement_status <> 'payment_initiated' THEN
    RAISE EXCEPTION 'Claim is not in the payroll reimbursement queue';
  END IF;

  UPDATE public.expense_claims SET
    reimbursement_channel = 'bank',
    reimbursement_status = 'awaiting_payment',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'payroll_queue_cancelled',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Payroll reimbursement queue cancelled; claim returned to bank payout queue'
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

-- Expand function signature grants for reimburse (drop old overload if present).
DO $$
BEGIN
  BEGIN
    REVOKE ALL ON FUNCTION public.reimburse_expense_claim(UUID, UUID, UUID, INTEGER, DATE) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;

REVOKE ALL ON FUNCTION public.reimburse_expense_claim(UUID, UUID, UUID, INTEGER, DATE, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_expense_claim_for_payroll(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_expense_claim_payroll_queue(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reimburse_expense_claim(UUID, UUID, UUID, INTEGER, DATE, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_expense_claim_for_payroll(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expense_claim_payroll_queue(UUID, UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
