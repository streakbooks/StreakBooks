-- EM-09c: employee exit settlement — outstanding snapshot, advance reclaim, finalize checklist.

ALTER TABLE public.expense_cash_advances
  ADD COLUMN IF NOT EXISTS reclaim_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.expense_exit_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  settlement_number TEXT NOT NULL,
  employee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'cancelled')),
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bank_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  notes TEXT,
  outstanding_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_exit_settlements_number_len CHECK (char_length(trim(settlement_number)) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_exit_settlements_company_number_uidx
  ON public.expense_exit_settlements (company_id, lower(settlement_number));
CREATE INDEX IF NOT EXISTS expense_exit_settlements_company_employee_idx
  ON public.expense_exit_settlements (company_id, employee_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS expense_exit_settlements_company_status_idx
  ON public.expense_exit_settlements (company_id, status, updated_at DESC);

ALTER TABLE public.expense_exit_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense exit settlements select scoped" ON public.expense_exit_settlements;
CREATE POLICY "Expense exit settlements select scoped"
  ON public.expense_exit_settlements FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      employee_user_id = auth.uid()
      OR public.has_company_permission(company_id, 'expenses.manage_advances')
      OR public.has_company_permission(company_id, 'expenses.admin')
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.audit')
    )
  );

REVOKE ALL ON TABLE public.expense_exit_settlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_exit_settlements TO authenticated;
GRANT ALL ON TABLE public.expense_exit_settlements TO service_role;

INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'expense_exit_settlement', 'EXS-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

CREATE OR REPLACE FUNCTION private.expense_exit_outstanding_json(
  _company_id UUID,
  _employee_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _advances JSONB;
  _open_claims JSONB;
  _card_txs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.advance_date DESC, a.id), '[]'::jsonb)
  INTO _advances
  FROM public.expense_cash_advances a
  WHERE a.company_id = _company_id
    AND a.employee_user_id = _employee_user_id
    AND a.status IN ('issued', 'partially_settled')
    AND a.remaining_minor > 0;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.updated_at DESC, c.id), '[]'::jsonb)
  INTO _open_claims
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.claimant_user_id = _employee_user_id
    AND (
      c.approval_status IN ('draft', 'submitted', 'in_review', 'returned')
      OR (
        c.approval_status = 'approved'
        AND c.payment_source = 'employee_paid'
        AND c.reimbursement_status IN (
          'eligible', 'awaiting_payment', 'payment_initiated', 'partially_paid'
        )
      )
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.transaction_date DESC, t.id), '[]'::jsonb)
  INTO _card_txs
  FROM public.expense_corporate_card_transactions t
  JOIN public.expense_corporate_cards card
    ON card.id = t.card_id AND card.company_id = t.company_id
  WHERE t.company_id = _company_id
    AND card.holder_user_id = _employee_user_id
    AND t.status IN ('unmatched', 'disputed');

  RETURN jsonb_build_object(
    'employee_user_id', _employee_user_id,
    'open_advances', COALESCE(_advances, '[]'::jsonb),
    'open_claims', COALESCE(_open_claims, '[]'::jsonb),
    'open_card_transactions', COALESCE(_card_txs, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expense_exit_outstanding(
  _company_id UUID,
  _employee_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.view')
  ) THEN
    RAISE EXCEPTION 'Exit outstanding access denied' USING ERRCODE = '42501';
  END IF;
  IF _employee_user_id IS NULL THEN
    RAISE EXCEPTION 'Employee is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _employee_user_id
  ) THEN
    RAISE EXCEPTION 'Employee is not a member of this organisation';
  END IF;

  RETURN private.expense_exit_outstanding_json(_company_id, _employee_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_expense_exit_settlements(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.audit')
  ) THEN
    RAISE EXCEPTION 'Exit settlement list denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC, s.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_exit_settlements s
  WHERE s.company_id = _company_id;

  RETURN jsonb_build_object('settlements', COALESCE(_rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_expense_exit_settlement(
  _company_id UUID,
  _employee_user_id UUID,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_exit_settlements%ROWTYPE;
  _number TEXT;
  _snapshot JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Exit settlement create denied' USING ERRCODE = '42501';
  END IF;
  IF _employee_user_id IS NULL THEN
    RAISE EXCEPTION 'Employee is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _employee_user_id
  ) THEN
    RAISE EXCEPTION 'Employee is not a member of this organisation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_exit_settlements s
    WHERE s.company_id = _company_id
      AND s.employee_user_id = _employee_user_id
      AND s.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'A draft exit settlement already exists for this employee';
  END IF;

  _snapshot := private.expense_exit_outstanding_json(_company_id, _employee_user_id);
  _number := public.allocate_document_number(_company_id, 'expense_exit_settlement');

  INSERT INTO public.expense_exit_settlements (
    company_id, settlement_number, employee_user_id, status, settlement_date,
    notes, outstanding_snapshot, version, created_by, updated_by
  ) VALUES (
    _company_id, _number, _employee_user_id, 'draft', CURRENT_DATE,
    NULLIF(btrim(COALESCE(_notes, '')), ''), _snapshot, 1, auth.uid(), auth.uid()
  )
  RETURNING * INTO _row;

  RETURN to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_expense_cash_advance(
  _company_id UUID,
  _advance_id UUID,
  _bank_account_id UUID,
  _expected_version INTEGER,
  _reclaim_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.expense_cash_advances%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _advance_account UUID;
  _pay_date DATE;
  _journal_id UUID;
  _idem TEXT;
  _existing UUID;
  _lines JSONB;
  _amount BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Cash advance reclaim denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_cash_advances
  WHERE id = _advance_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash advance not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Cash advance was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _row.status = 'settled' AND _row.remaining_minor = 0 AND _row.reclaim_journal_id IS NOT NULL THEN
    RETURN private.expense_cash_advance_json(_row);
  END IF;
  IF _row.status NOT IN ('issued', 'partially_settled') OR _row.remaining_minor <= 0 THEN
    RAISE EXCEPTION 'Only issued advances with remaining balance can be reclaimed';
  END IF;

  IF _bank_account_id IS NULL OR NOT public.sales_is_deposit_account(_company_id, _bank_account_id) THEN
    RAISE EXCEPTION 'Choose a valid bank or cash account for the reclaim';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;
  IF NOT FOUND OR _settings.employee_advance_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure the employee advance account in Expense Management settings before reclaiming';
  END IF;
  _advance_account := _settings.employee_advance_account_id;
  IF _advance_account = _bank_account_id THEN
    RAISE EXCEPTION 'Advance account and bank account must be different';
  END IF;

  _amount := _row.remaining_minor;
  _pay_date := COALESCE(_reclaim_date, CURRENT_DATE);
  _idem := 'expense_cash_advance:' || _row.id::text || ':reclaim:' || _amount::text;

  SELECT id INTO _existing
  FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idem;
  IF _existing IS NOT NULL THEN
    UPDATE public.expense_cash_advances SET
      remaining_minor = 0,
      status = 'settled',
      reclaim_journal_id = _existing,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _row.id
    RETURNING * INTO _row;
    RETURN private.expense_cash_advance_json(_row);
  END IF;

  -- Reverse the outstanding float: DR bank, CR advance asset.
  _lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', _bank_account_id,
      'debit_minor', _amount,
      'credit_minor', 0,
      'description', 'Cash advance reclaim ' || _row.advance_number
    ),
    jsonb_build_object(
      'account_id', _advance_account,
      'debit_minor', 0,
      'credit_minor', _amount,
      'description', 'Cash advance reclaim ' || _row.advance_number
    )
  );

  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _pay_date,
    'memo', 'Expense cash advance reclaim ' || _row.advance_number,
    'currency_code', _row.currency_code,
    'fx_rate_to_base', 1,
    'source_type', 'expense',
    'source_id', _row.id,
    'idempotency_key', _idem,
    'lines', _lines
  ));

  UPDATE public.expense_cash_advances SET
    remaining_minor = 0,
    status = 'settled',
    reclaim_journal_id = _journal_id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN private.expense_cash_advance_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_expense_exit_settlement(
  _company_id UUID,
  _settlement_id UUID,
  _expected_version INTEGER,
  _bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.expense_exit_settlements%ROWTYPE;
  _snapshot JSONB;
  _adv RECORD;
  _claim RECORD;
  _open_submitted INTEGER := 0;
  _open_cards INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_advances')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Exit settlement finalize denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_exit_settlements
  WHERE id = _settlement_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exit settlement not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Exit settlement was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF _row.status = 'finalized' THEN
    RETURN to_jsonb(_row);
  END IF;
  IF _row.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft exit settlements can be finalized';
  END IF;
  IF _bank_account_id IS NULL OR NOT public.sales_is_deposit_account(_company_id, _bank_account_id) THEN
    RAISE EXCEPTION 'Choose a valid bank account for advance reclaim';
  END IF;

  _snapshot := private.expense_exit_outstanding_json(_company_id, _row.employee_user_id);

  SELECT COUNT(*) INTO _open_submitted
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.claimant_user_id = _row.employee_user_id
    AND c.approval_status IN ('submitted', 'in_review');
  IF _open_submitted > 0 THEN
    RAISE EXCEPTION 'Resolve submitted/in-review claims before finalizing exit settlement';
  END IF;

  SELECT COUNT(*) INTO _open_cards
  FROM public.expense_corporate_card_transactions t
  JOIN public.expense_corporate_cards card
    ON card.id = t.card_id AND card.company_id = t.company_id
  WHERE t.company_id = _company_id
    AND card.holder_user_id = _row.employee_user_id
    AND t.status IN ('unmatched', 'disputed');
  IF _open_cards > 0 THEN
    RAISE EXCEPTION 'Match, dispute-resolve, or exclude open card transactions before finalizing';
  END IF;

  -- Void leftover drafts so the leaver cannot keep submitting them later.
  FOR _claim IN
    SELECT id, version FROM public.expense_claims
    WHERE company_id = _company_id
      AND claimant_user_id = _row.employee_user_id
      AND approval_status = 'draft'
    FOR UPDATE
  LOOP
    UPDATE public.expense_claims SET
      approval_status = 'voided',
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id;
    PERFORM private.expense_claim_event(
      _company_id, _claim.id, 'voided_on_exit',
      'voided', NULL, NULL,
      'Draft voided during exit settlement ' || _row.settlement_number,
      jsonb_build_object('exit_settlement_id', _row.id)
    );
  END LOOP;

  FOR _adv IN
    SELECT id, version FROM public.expense_cash_advances
    WHERE company_id = _company_id
      AND employee_user_id = _row.employee_user_id
      AND status IN ('issued', 'partially_settled')
      AND remaining_minor > 0
    FOR UPDATE
  LOOP
    PERFORM public.reclaim_expense_cash_advance(
      _company_id, _adv.id, _bank_account_id, _adv.version, _row.settlement_date
    );
  END LOOP;

  _snapshot := private.expense_exit_outstanding_json(_company_id, _row.employee_user_id);

  UPDATE public.expense_exit_settlements SET
    status = 'finalized',
    bank_account_id = _bank_account_id,
    outstanding_snapshot = _snapshot,
    finalized_at = clock_timestamp(),
    finalized_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION private.expense_exit_outstanding_json(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_expense_exit_outstanding(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_expense_exit_settlements(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_expense_exit_settlement(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reclaim_expense_cash_advance(UUID, UUID, UUID, INTEGER, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_expense_exit_settlement(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_expense_exit_outstanding(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_expense_exit_settlements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense_exit_settlement(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_expense_cash_advance(UUID, UUID, UUID, INTEGER, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_expense_exit_settlement(UUID, UUID, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
