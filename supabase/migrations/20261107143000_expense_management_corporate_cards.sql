-- EM-09a: corporate card register, statement lines, match to claims, post corporate_card claims.

CREATE TABLE IF NOT EXISTS public.expense_corporate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  network TEXT,
  last4 TEXT NOT NULL,
  holder_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  liability_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_corporate_cards_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 120),
  CONSTRAINT expense_corporate_cards_last4 CHECK (last4 ~ '^[0-9]{4}$')
);

CREATE INDEX IF NOT EXISTS expense_corporate_cards_company_status_idx
  ON public.expense_corporate_cards (company_id, status, label);

CREATE TABLE IF NOT EXISTS public.expense_corporate_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.expense_corporate_cards(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  posted_date DATE,
  merchant_name TEXT,
  description TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (status IN ('unmatched', 'matched', 'excluded', 'disputed')),
  matched_claim_id UUID REFERENCES public.expense_claims(id) ON DELETE SET NULL,
  external_ref TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_corporate_card_tx_desc_len CHECK (char_length(trim(description)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS expense_corporate_card_tx_card_date_idx
  ON public.expense_corporate_card_transactions (card_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS expense_corporate_card_tx_company_status_idx
  ON public.expense_corporate_card_transactions (company_id, status, transaction_date DESC);

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS corporate_card_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_claims_corporate_card_fk'
  ) THEN
    ALTER TABLE public.expense_claims
      ADD CONSTRAINT expense_claims_corporate_card_fk
      FOREIGN KEY (corporate_card_id)
      REFERENCES public.expense_corporate_cards(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expense_claims_corporate_card_idx
  ON public.expense_claims (corporate_card_id)
  WHERE corporate_card_id IS NOT NULL;

ALTER TABLE public.expense_corporate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_corporate_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense corporate cards select scoped" ON public.expense_corporate_cards;
CREATE POLICY "Expense corporate cards select scoped"
  ON public.expense_corporate_cards FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      holder_user_id = auth.uid()
      OR public.has_company_permission(company_id, 'expenses.manage_cards')
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.submit')
      OR public.has_company_permission(company_id, 'expenses.admin')
      OR public.has_company_permission(company_id, 'expenses.audit')
    )
  );

DROP POLICY IF EXISTS "Expense corporate card tx select scoped" ON public.expense_corporate_card_transactions;
CREATE POLICY "Expense corporate card tx select scoped"
  ON public.expense_corporate_card_transactions FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'expenses.manage_cards')
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.admin')
      OR public.has_company_permission(company_id, 'expenses.audit')
      OR EXISTS (
        SELECT 1 FROM public.expense_corporate_cards c
        WHERE c.id = expense_corporate_card_transactions.card_id
          AND c.holder_user_id = auth.uid()
      )
    )
  );

REVOKE ALL ON TABLE public.expense_corporate_cards FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.expense_corporate_card_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_corporate_cards TO authenticated;
GRANT SELECT ON TABLE public.expense_corporate_card_transactions TO authenticated;
GRANT ALL ON TABLE public.expense_corporate_cards TO service_role;
GRANT ALL ON TABLE public.expense_corporate_card_transactions TO service_role;

CREATE OR REPLACE FUNCTION private.expense_corporate_card_json(
  _row public.expense_corporate_cards
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(_row);
$$;

CREATE OR REPLACE FUNCTION private.expense_corporate_card_tx_json(
  _row public.expense_corporate_card_transactions
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(_row);
$$;

CREATE OR REPLACE FUNCTION public.list_expense_corporate_cards(
  _company_id UUID
)
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
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.audit')
  ) THEN
    RAISE EXCEPTION 'Corporate card list access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.status, c.label), '[]'::jsonb)
  INTO _rows
  FROM public.expense_corporate_cards c
  WHERE c.company_id = _company_id
    AND (
      public.has_company_permission(_company_id, 'expenses.manage_cards')
      OR public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.admin')
      OR public.has_company_permission(_company_id, 'expenses.audit')
      OR c.holder_user_id = auth.uid()
    );

  RETURN jsonb_build_object('cards', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_corporate_card(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _label TEXT := NULLIF(btrim(COALESCE(_payload->>'label', '')), '');
  _network TEXT := NULLIF(btrim(COALESCE(_payload->>'network', '')), '');
  _last4 TEXT := NULLIF(btrim(COALESCE(_payload->>'last4', '')), '');
  _holder UUID := NULLIF(_payload->>'holder_user_id', '')::UUID;
  _liability UUID := NULLIF(_payload->>'liability_account_id', '')::UUID;
  _currency TEXT := upper(COALESCE(NULLIF(btrim(_payload->>'currency_code'), ''), ''));
  _status TEXT := COALESCE(NULLIF(btrim(_payload->>'status'), ''), 'active');
  _notes TEXT := NULLIF(btrim(COALESCE(_payload->>'notes', '')), '');
  _expected_version INTEGER := COALESCE((_payload->>'version')::INTEGER, 0);
  _row public.expense_corporate_cards%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Corporate card edit denied' USING ERRCODE = '42501';
  END IF;
  IF _label IS NULL OR char_length(_label) > 120 THEN
    RAISE EXCEPTION 'Card label is required (max 120 characters)';
  END IF;
  IF _last4 IS NULL OR _last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Last 4 digits must be exactly four numbers';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;
  IF _liability IS NULL THEN
    RAISE EXCEPTION 'Card liability account is required';
  END IF;
  IF _status NOT IN ('active', 'suspended', 'closed') THEN
    RAISE EXCEPTION 'Invalid card status';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _liability AND a.company_id = _company_id AND a.is_active
  ) THEN
    RAISE EXCEPTION 'Card liability account not found or inactive';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.expense_corporate_cards (
      company_id, label, network, last4, holder_user_id, liability_account_id,
      currency_code, status, notes, version, created_by, updated_by
    ) VALUES (
      _company_id, _label, _network, _last4, _holder, _liability,
      _currency, _status, _notes, 1, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row
    FROM public.expense_corporate_cards
    WHERE id = _id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Corporate card not found' USING ERRCODE = 'P0002';
    END IF;
    IF _row.version <> _expected_version THEN
      RAISE EXCEPTION 'Corporate card was updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.expense_corporate_cards SET
      label = _label,
      network = _network,
      last4 = _last4,
      holder_user_id = _holder,
      liability_account_id = _liability,
      currency_code = _currency,
      status = _status,
      notes = _notes,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  RETURN private.expense_corporate_card_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_expense_corporate_card_transactions(
  _company_id UUID,
  _card_id UUID DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
  _status_norm TEXT := NULLIF(btrim(COALESCE(_status, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.audit')
  ) THEN
    RAISE EXCEPTION 'Corporate card transaction list access denied' USING ERRCODE = '42501';
  END IF;
  IF _status_norm IS NOT NULL
    AND _status_norm NOT IN ('unmatched', 'matched', 'excluded', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transaction status filter';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.transaction_date DESC, t.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_corporate_card_transactions t
  WHERE t.company_id = _company_id
    AND (_card_id IS NULL OR t.card_id = _card_id)
    AND (_status_norm IS NULL OR t.status = _status_norm);

  RETURN jsonb_build_object('transactions', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_corporate_card_transaction(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _card_id UUID := NULLIF(_payload->>'card_id', '')::UUID;
  _tx_date DATE := COALESCE(NULLIF(_payload->>'transaction_date', '')::DATE, CURRENT_DATE);
  _posted DATE := NULLIF(_payload->>'posted_date', '')::DATE;
  _merchant TEXT := NULLIF(btrim(COALESCE(_payload->>'merchant_name', '')), '');
  _description TEXT := NULLIF(btrim(COALESCE(_payload->>'description', '')), '');
  _amount BIGINT := COALESCE((_payload->>'amount_minor')::BIGINT, 0);
  _currency TEXT := upper(COALESCE(NULLIF(btrim(_payload->>'currency_code'), ''), ''));
  _external TEXT := NULLIF(btrim(COALESCE(_payload->>'external_ref', '')), '');
  _card public.expense_corporate_cards%ROWTYPE;
  _row public.expense_corporate_card_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Corporate card transaction edit denied' USING ERRCODE = '42501';
  END IF;
  IF _card_id IS NULL THEN
    RAISE EXCEPTION 'Card is required';
  END IF;
  IF _description IS NULL THEN
    RAISE EXCEPTION 'Transaction description is required';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Transaction amount must be greater than zero';
  END IF;

  SELECT * INTO _card
  FROM public.expense_corporate_cards
  WHERE id = _card_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corporate card not found' USING ERRCODE = 'P0002';
  END IF;
  IF _card.status = 'closed' THEN
    RAISE EXCEPTION 'Cannot add transactions to a closed card';
  END IF;

  _currency := COALESCE(NULLIF(_currency, ''), _card.currency_code);
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.expense_corporate_card_transactions (
      company_id, card_id, transaction_date, posted_date, merchant_name, description,
      amount_minor, currency_code, status, external_ref, created_by, updated_by
    ) VALUES (
      _company_id, _card_id, _tx_date, _posted, _merchant, _description,
      _amount, _currency, 'unmatched', _external, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row
    FROM public.expense_corporate_card_transactions
    WHERE id = _id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Card transaction not found' USING ERRCODE = 'P0002';
    END IF;
    IF _row.status = 'matched' THEN
      RAISE EXCEPTION 'Matched transactions cannot be edited; unmatched first';
    END IF;

    UPDATE public.expense_corporate_card_transactions SET
      transaction_date = _tx_date,
      posted_date = _posted,
      merchant_name = _merchant,
      description = _description,
      amount_minor = _amount,
      currency_code = _currency,
      external_ref = _external,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  RETURN private.expense_corporate_card_tx_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.match_expense_corporate_card_transaction(
  _company_id UUID,
  _transaction_id UUID,
  _claim_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _tx public.expense_corporate_card_transactions%ROWTYPE;
  _claim public.expense_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Corporate card match denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _tx
  FROM public.expense_corporate_card_transactions
  WHERE id = _transaction_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card transaction not found' USING ERRCODE = 'P0002';
  END IF;
  IF _tx.status NOT IN ('unmatched', 'disputed') THEN
    RAISE EXCEPTION 'Only unmatched or disputed transactions can be matched';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.payment_source <> 'corporate_card' THEN
    RAISE EXCEPTION 'Claim payment source must be corporate_card';
  END IF;
  IF _claim.corporate_card_id IS DISTINCT FROM _tx.card_id THEN
    RAISE EXCEPTION 'Claim must be linked to the same corporate card as the transaction';
  END IF;
  IF _claim.claim_currency <> _tx.currency_code THEN
    RAISE EXCEPTION 'Claim currency must match the card transaction currency';
  END IF;
  IF _claim.total_minor <> _tx.amount_minor THEN
    RAISE EXCEPTION 'Claim total (%) must equal transaction amount (%)',
      _claim.total_minor, _tx.amount_minor;
  END IF;

  UPDATE public.expense_corporate_card_transactions SET
    status = 'matched',
    matched_claim_id = _claim.id,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _tx.id
  RETURNING * INTO _tx;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'card_transaction_matched',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Matched corporate card transaction',
    jsonb_build_object('transaction_id', _tx.id)
  );

  RETURN private.expense_corporate_card_tx_json(_tx);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_expense_claim_corporate_card(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _card public.expense_corporate_cards%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim edit denied' USING ERRCODE = '42501';
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
  IF _claim.approval_status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Only draft or returned claims can link a corporate card';
  END IF;
  IF _claim.payment_source <> 'corporate_card' THEN
    RAISE EXCEPTION 'Set payment source to corporate_card before linking a card';
  END IF;
  IF _claim.claimant_user_id <> auth.uid()
    AND NOT public.has_company_permission(_company_id, 'expenses.admin') THEN
    RAISE EXCEPTION 'Only the claimant can link a corporate card' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _card
  FROM public.expense_corporate_cards
  WHERE id = _card_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corporate card not found' USING ERRCODE = 'P0002';
  END IF;
  IF _card.status <> 'active' THEN
    RAISE EXCEPTION 'Corporate card must be active';
  END IF;
  IF _card.currency_code <> _claim.claim_currency THEN
    RAISE EXCEPTION 'Corporate card currency must match the claim currency';
  END IF;
  IF _card.holder_user_id IS NOT NULL
    AND _card.holder_user_id <> _claim.claimant_user_id
    AND NOT public.has_company_permission(_company_id, 'expenses.manage_cards') THEN
    RAISE EXCEPTION 'Card holder must match the claim claimant';
  END IF;

  UPDATE public.expense_claims SET
    corporate_card_id = _card.id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'corporate_card_linked',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Linked corporate card ' || _card.label,
    jsonb_build_object('corporate_card_id', _card.id)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_expense_claim(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _adv public.expense_cash_advances%ROWTYPE;
  _float public.expense_petty_cash_floats%ROWTYPE;
  _card public.expense_corporate_cards%ROWTYPE;
  _credit_account UUID;
  _tax_account UUID;
  _lines JSONB := '[]'::jsonb;
  _line RECORD;
  _tax_total BIGINT := 0;
  _debit_total BIGINT := 0;
  _journal_id UUID;
  _idem TEXT;
  _existing UUID;
  _credit_label TEXT;
  _event_note TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.post')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim posting denied' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'Only approved claims can be posted';
  END IF;
  IF _claim.payment_source NOT IN ('employee_paid', 'cash_advance', 'company_paid', 'corporate_card') THEN
    RAISE EXCEPTION 'Unsupported payment source for posting: %', _claim.payment_source;
  END IF;
  IF _claim.posting_status = 'posted' AND _claim.posted_journal_id IS NOT NULL THEN
    IF _claim.payment_source = 'employee_paid' THEN
      PERFORM private.expense_claim_mark_awaiting_payment(_claim.id);
      SELECT * INTO _claim FROM public.expense_claims WHERE id = _claim_id;
    END IF;
    RETURN private.expense_claim_json(_claim);
  END IF;
  IF _claim.posting_status NOT IN ('ready', 'failed') THEN
    RAISE EXCEPTION 'Claim posting status must be ready (currently %)', _claim.posting_status;
  END IF;
  IF _claim.posted_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Claim already has a posted journal';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;

  IF _claim.payment_source = 'employee_paid' THEN
    IF NOT FOUND OR _settings.employee_payable_account_id IS NULL THEN
      RAISE EXCEPTION 'Configure the employee payable account in Expense Management settings before posting';
    END IF;
    _credit_account := _settings.employee_payable_account_id;
    _credit_label := 'Employee payable ' || _claim.claim_number;
    _event_note := 'Claim accrued to employee payable';
  ELSIF _claim.payment_source = 'cash_advance' THEN
    IF NOT FOUND OR _settings.employee_advance_account_id IS NULL THEN
      RAISE EXCEPTION 'Configure the employee advance account in Expense Management settings before posting';
    END IF;
    IF _claim.cash_advance_id IS NULL THEN
      RAISE EXCEPTION 'Link an issued cash advance before posting a cash-advance claim';
    END IF;
    SELECT * INTO _adv FROM public.expense_cash_advances
    WHERE id = _claim.cash_advance_id AND company_id = _company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked cash advance not found'; END IF;
    IF _adv.status NOT IN ('issued', 'partially_settled') THEN
      RAISE EXCEPTION 'Linked cash advance is not open for settlement (status %)', _adv.status;
    END IF;
    IF _adv.remaining_minor < _claim.total_minor THEN
      RAISE EXCEPTION 'Cash advance remaining (%) is less than claim total (%)',
        _adv.remaining_minor, _claim.total_minor;
    END IF;
    _credit_account := _settings.employee_advance_account_id;
    _credit_label := 'Settle advance ' || _adv.advance_number;
    _event_note := 'Claim settled against cash advance ' || _adv.advance_number;
  ELSIF _claim.payment_source = 'company_paid' THEN
    IF NOT FOUND OR _settings.petty_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Configure the petty cash account in Expense Management settings before posting';
    END IF;
    IF _claim.petty_cash_float_id IS NULL THEN
      RAISE EXCEPTION 'Link an active petty cash float before posting a company-paid claim';
    END IF;
    SELECT * INTO _float FROM public.expense_petty_cash_floats
    WHERE id = _claim.petty_cash_float_id AND company_id = _company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked petty cash float not found'; END IF;
    IF _float.status <> 'active' THEN
      RAISE EXCEPTION 'Linked petty cash float is not active';
    END IF;
    IF _float.balance_minor < _claim.total_minor THEN
      RAISE EXCEPTION 'Petty cash balance (%) is less than claim total (%)',
        _float.balance_minor, _claim.total_minor;
    END IF;
    _credit_account := _settings.petty_cash_account_id;
    _credit_label := 'Petty cash ' || _float.float_number;
    _event_note := 'Claim paid from petty cash ' || _float.float_number;
  ELSE
    IF _claim.corporate_card_id IS NULL THEN
      RAISE EXCEPTION 'Link a corporate card before posting a corporate-card claim';
    END IF;
    SELECT * INTO _card FROM public.expense_corporate_cards
    WHERE id = _claim.corporate_card_id AND company_id = _company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked corporate card not found'; END IF;
    IF _card.status NOT IN ('active', 'suspended') THEN
      RAISE EXCEPTION 'Linked corporate card is closed';
    END IF;
    _credit_account := _card.liability_account_id;
    _credit_label := 'Corporate card ****' || _card.last4;
    _event_note := 'Claim accrued to corporate card ****' || _card.last4;
  END IF;

  _idem := 'expense_claim:' || _claim.id::text || ':accrual';
  SELECT id INTO _existing
  FROM public.journals
  WHERE company_id = _company_id AND idempotency_key = _idem;
  IF _existing IS NOT NULL THEN
    UPDATE public.expense_claims SET
      posting_status = 'posted',
      posted_journal_id = _existing,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id
    RETURNING * INTO _claim;
    IF _claim.payment_source = 'employee_paid' THEN
      PERFORM private.expense_claim_mark_awaiting_payment(_claim.id);
      SELECT * INTO _claim FROM public.expense_claims WHERE id = _claim_id;
    END IF;
    PERFORM private.expense_claim_event(
      _company_id, _claim.id, 'posted',
      _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
      'Linked existing accrual journal',
      jsonb_build_object('journal_id', _existing)
    );
    RETURN private.expense_claim_json(_claim);
  END IF;

  UPDATE public.expense_claims SET
    posting_status = 'posting',
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id;

  FOR _line IN
    SELECT * FROM public.expense_claim_lines WHERE claim_id = _claim.id ORDER BY line_no
  LOOP
    IF _line.net_minor > 0 THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object(
        'account_id', _line.account_id,
        'debit_minor', _line.net_minor,
        'credit_minor', 0,
        'description', COALESCE(NULLIF(btrim(_line.description), ''), _claim.claim_number)
      ));
      _debit_total := _debit_total + _line.net_minor;
    END IF;
    _tax_total := _tax_total + COALESCE(_line.tax_minor, 0);
  END LOOP;

  IF _tax_total > 0 THEN
    _tax_account := public.ops_input_tax_account(_company_id);
    IF _tax_account IS NULL THEN
      UPDATE public.expense_claims SET posting_status = 'failed' WHERE id = _claim.id;
      RAISE EXCEPTION 'Input tax account is not configured for this organisation';
    END IF;
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'account_id', _tax_account,
      'debit_minor', _tax_total,
      'credit_minor', 0,
      'description', 'Input tax on ' || _claim.claim_number
    ));
    _debit_total := _debit_total + _tax_total;
  END IF;

  IF _debit_total <= 0 THEN
    UPDATE public.expense_claims SET posting_status = 'failed' WHERE id = _claim.id;
    RAISE EXCEPTION 'Claim has nothing to post';
  END IF;
  IF _debit_total <> _claim.total_minor THEN
    UPDATE public.expense_claims SET posting_status = 'failed' WHERE id = _claim.id;
    RAISE EXCEPTION 'Claim line totals do not match header total (% vs %)', _debit_total, _claim.total_minor;
  END IF;

  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'account_id', _credit_account,
    'debit_minor', 0,
    'credit_minor', _debit_total,
    'description', _credit_label
  ));

  BEGIN
    _journal_id := public.post_journal(jsonb_build_object(
      'company_id', _company_id,
      'journal_date', _claim.claim_date,
      'currency_code', _claim.claim_currency,
      'fx_rate_to_base', 1,
      'source_type', 'expense',
      'source_id', _claim.id,
      'idempotency_key', _idem,
      'memo', 'Expense claim ' || _claim.claim_number || ' — ' || _claim.title,
      'lines', _lines
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.expense_claims SET
      posting_status = 'failed',
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id;
    RAISE;
  END;

  UPDATE public.expense_claims SET
    posting_status = 'posted',
    posted_journal_id = _journal_id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  IF _claim.payment_source = 'employee_paid' THEN
    PERFORM private.expense_claim_mark_awaiting_payment(_claim.id);
    SELECT * INTO _claim FROM public.expense_claims WHERE id = _claim_id;
  ELSIF _claim.payment_source = 'cash_advance' AND _claim.cash_advance_id IS NOT NULL THEN
    UPDATE public.expense_cash_advances SET
      remaining_minor = remaining_minor - _claim.total_minor,
      status = CASE
        WHEN remaining_minor - _claim.total_minor = 0 THEN 'settled'
        ELSE 'partially_settled'
      END,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.cash_advance_id;
  ELSIF _claim.payment_source = 'company_paid' AND _claim.petty_cash_float_id IS NOT NULL THEN
    UPDATE public.expense_petty_cash_floats SET
      balance_minor = balance_minor - _claim.total_minor,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.petty_cash_float_id;
  END IF;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'posted',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    _event_note,
    jsonb_build_object('journal_id', _journal_id, 'payment_source', _claim.payment_source)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION private.reset_demo_company_with_workflows(_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'demo.reset') THEN
    RAISE EXCEPTION 'Demo reset access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || ':workflow-reset', 0));
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND is_demo) THEN
    RAISE EXCEPTION 'Reset denied: company is not a demo company';
  END IF;

  UPDATE public.expense_claims
  SET spending_request_id = NULL, cash_advance_id = NULL, petty_cash_float_id = NULL,
      corporate_card_id = NULL
  WHERE company_id = _company;
  UPDATE public.expense_corporate_card_transactions SET matched_claim_id = NULL
  WHERE company_id = _company;
  DELETE FROM public.expense_corporate_card_transactions WHERE company_id = _company;
  DELETE FROM public.expense_spending_requests WHERE company_id = _company;
  DELETE FROM public.expense_receipt_inbox_entries WHERE company_id = _company;
  DELETE FROM public.expense_claim_events WHERE company_id = _company;
  DELETE FROM public.expense_claim_lines WHERE company_id = _company;
  DELETE FROM public.expense_claims WHERE company_id = _company;
  DELETE FROM public.expense_claim_templates WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_cash_advances WHERE company_id = _company;
  DELETE FROM public.expense_petty_cash_floats WHERE company_id = _company;
  DELETE FROM public.expense_corporate_cards WHERE company_id = _company;
  DELETE FROM public.expense_mileage_rates WHERE company_id = _company;
  DELETE FROM public.expense_per_diem_rates WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_corporate_cards(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_corporate_card(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_expense_corporate_card_transactions(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_corporate_card_transaction(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_expense_corporate_card_transaction(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_expense_claim_corporate_card(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_corporate_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_corporate_card(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_expense_corporate_card_transactions(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_corporate_card_transaction(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_expense_corporate_card_transaction(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_expense_claim_corporate_card(UUID, UUID, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
