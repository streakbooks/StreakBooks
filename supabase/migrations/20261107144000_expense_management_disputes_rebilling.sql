-- EM-09b: corporate card disputes + customer rebilling preparation.

ALTER TABLE public.expense_management_settings
  ADD COLUMN IF NOT EXISTS rebilling_income_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS rebilling_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (rebilling_status IN (
      'not_applicable', 'ready', 'invoiced', 'partially_invoiced', 'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS rebilling_invoice_id UUID
    REFERENCES public.sales_invoices(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.dispute_expense_corporate_card_transaction(
  _company_id UUID,
  _transaction_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _tx public.expense_corporate_card_transactions%ROWTYPE;
  _reason_norm TEXT := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Corporate card dispute denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _tx
  FROM public.expense_corporate_card_transactions
  WHERE id = _transaction_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card transaction not found' USING ERRCODE = 'P0002';
  END IF;
  IF _tx.status NOT IN ('unmatched', 'matched') THEN
    RAISE EXCEPTION 'Only unmatched or matched transactions can be disputed';
  END IF;

  IF _tx.matched_claim_id IS NOT NULL THEN
    PERFORM private.expense_claim_event(
      _company_id, _tx.matched_claim_id, 'card_transaction_disputed',
      NULL, NULL, NULL,
      COALESCE(_reason_norm, 'Corporate card transaction disputed'),
      jsonb_build_object('transaction_id', _tx.id)
    );
  END IF;

  UPDATE public.expense_corporate_card_transactions SET
    status = 'disputed',
    matched_claim_id = NULL,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _tx.id
  RETURNING * INTO _tx;

  RETURN to_jsonb(_tx);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_expense_corporate_card_transaction(
  _company_id UUID,
  _transaction_id UUID,
  _resolution TEXT DEFAULT 'unmatched'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _tx public.expense_corporate_card_transactions%ROWTYPE;
  _res TEXT := lower(COALESCE(NULLIF(btrim(_resolution), ''), 'unmatched'));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_cards')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Corporate card resolve denied' USING ERRCODE = '42501';
  END IF;
  IF _res NOT IN ('unmatched', 'excluded') THEN
    RAISE EXCEPTION 'Resolution must be unmatched or excluded';
  END IF;

  SELECT * INTO _tx
  FROM public.expense_corporate_card_transactions
  WHERE id = _transaction_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card transaction not found' USING ERRCODE = 'P0002';
  END IF;
  IF _tx.status <> 'disputed' THEN
    RAISE EXCEPTION 'Only disputed transactions can be resolved this way';
  END IF;

  UPDATE public.expense_corporate_card_transactions SET
    status = _res,
    matched_claim_id = NULL,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _tx.id
  RETURNING * INTO _tx;

  RETURN to_jsonb(_tx);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_expense_claim_for_rebilling(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _customer_contact_id UUID
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
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense claim rebilling prepare denied' USING ERRCODE = '42501';
  END IF;
  IF _customer_contact_id IS NULL THEN
    RAISE EXCEPTION 'Customer contact is required for rebilling';
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
  IF _claim.rebilling_status = 'invoiced' AND _claim.rebilling_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Claim is already rebilled to an invoice';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = _customer_contact_id AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Customer contact not found';
  END IF;

  UPDATE public.expense_claim_lines SET
    is_billable = true,
    rebilling_method = COALESCE(rebilling_method, 'actual'),
    updated_at = clock_timestamp()
  WHERE claim_id = _claim.id;

  UPDATE public.expense_claims SET
    customer_contact_id = _customer_contact_id,
    rebilling_status = 'ready',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'rebilling_prepared',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Claim prepared for customer rebilling',
    jsonb_build_object('customer_contact_id', _customer_contact_id)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_expense_claim_rebilled(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _invoice_id UUID
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
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'sales.draft')
  ) THEN
    RAISE EXCEPTION 'Expense claim rebill mark denied' USING ERRCODE = '42501';
  END IF;
  IF _invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required';
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
  IF _claim.rebilling_status = 'invoiced' AND _claim.rebilling_invoice_id IS NOT NULL THEN
    IF _claim.rebilling_invoice_id = _invoice_id THEN
      RETURN private.expense_claim_json(_claim);
    END IF;
    RAISE EXCEPTION 'Claim is already linked to a different rebilling invoice';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_invoices i
    WHERE i.id = _invoice_id AND i.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Sales invoice not found';
  END IF;

  UPDATE public.expense_claims SET
    rebilling_status = 'invoiced',
    rebilling_invoice_id = _invoice_id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'rebilled',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Claim rebilled to sales invoice',
    jsonb_build_object('invoice_id', _invoice_id)
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expense_management_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_management_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense settings access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_management_settings
  WHERE company_id = _company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'company_id', _company_id,
      'enabled', false,
      'claim_number_prefix', 'EXP-',
      'default_claim_currency', NULL,
      'employee_payable_account_id', NULL,
      'employee_advance_account_id', NULL,
      'petty_cash_account_id', NULL,
      'rebilling_income_account_id', NULL,
      'fx_gain_account_id', NULL,
      'fx_loss_account_id', NULL,
      'require_receipt_above_minor', 0,
      'require_spending_request_above_minor', 0,
      'allow_multi_currency_claims', true,
      'prevent_self_approval', true,
      'default_distance_unit', 'km',
      'version', 0,
      'exists', false
    );
  END IF;

  RETURN jsonb_build_object(
    'company_id', _row.company_id,
    'enabled', _row.enabled,
    'claim_number_prefix', _row.claim_number_prefix,
    'default_claim_currency', _row.default_claim_currency,
    'employee_payable_account_id', _row.employee_payable_account_id,
    'employee_advance_account_id', _row.employee_advance_account_id,
    'petty_cash_account_id', _row.petty_cash_account_id,
    'rebilling_income_account_id', _row.rebilling_income_account_id,
    'fx_gain_account_id', _row.fx_gain_account_id,
    'fx_loss_account_id', _row.fx_loss_account_id,
    'require_receipt_above_minor', _row.require_receipt_above_minor,
    'require_spending_request_above_minor', _row.require_spending_request_above_minor,
    'allow_multi_currency_claims', _row.allow_multi_currency_claims,
    'prevent_self_approval', _row.prevent_self_approval,
    'default_distance_unit', _row.default_distance_unit,
    'version', _row.version,
    'updated_at', _row.updated_at,
    'exists', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_management_settings(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _expected_version INTEGER;
  _prefix TEXT;
  _currency TEXT;
  _distance TEXT;
  _row public.expense_management_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense settings edit denied' USING ERRCODE = '42501';
  END IF;

  _expected_version := COALESCE((_payload->>'version')::INTEGER, 0);
  _prefix := NULLIF(btrim(COALESCE(_payload->>'claim_number_prefix', 'EXP-')), '');
  IF _prefix IS NULL OR char_length(_prefix) > 12 THEN
    RAISE EXCEPTION 'Claim number prefix must be 1–12 characters';
  END IF;

  _currency := NULLIF(upper(btrim(COALESCE(_payload->>'default_claim_currency', ''))), '');
  IF _currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Default claim currency must be a 3-letter ISO code';
  END IF;

  _distance := COALESCE(NULLIF(btrim(_payload->>'default_distance_unit'), ''), 'km');
  IF _distance NOT IN ('km', 'mi') THEN
    RAISE EXCEPTION 'Distance unit must be km or mi';
  END IF;

  SELECT * INTO _row
  FROM public.expense_management_settings
  WHERE company_id = _company_id
  FOR UPDATE;

  IF FOUND THEN
    IF _row.version <> _expected_version THEN
      RAISE EXCEPTION 'Expense settings were updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.expense_management_settings SET
      enabled = COALESCE((_payload->>'enabled')::BOOLEAN, enabled),
      claim_number_prefix = _prefix,
      default_claim_currency = _currency,
      employee_payable_account_id = NULLIF(_payload->>'employee_payable_account_id', '')::UUID,
      employee_advance_account_id = NULLIF(_payload->>'employee_advance_account_id', '')::UUID,
      petty_cash_account_id = NULLIF(_payload->>'petty_cash_account_id', '')::UUID,
      rebilling_income_account_id = NULLIF(_payload->>'rebilling_income_account_id', '')::UUID,
      fx_gain_account_id = NULLIF(_payload->>'fx_gain_account_id', '')::UUID,
      fx_loss_account_id = NULLIF(_payload->>'fx_loss_account_id', '')::UUID,
      require_receipt_above_minor = GREATEST(
        COALESCE((_payload->>'require_receipt_above_minor')::BIGINT, require_receipt_above_minor),
        0
      ),
      require_spending_request_above_minor = GREATEST(
        COALESCE(
          (_payload->>'require_spending_request_above_minor')::BIGINT,
          require_spending_request_above_minor
        ),
        0
      ),
      allow_multi_currency_claims = COALESCE(
        (_payload->>'allow_multi_currency_claims')::BOOLEAN,
        allow_multi_currency_claims
      ),
      prevent_self_approval = COALESCE(
        (_payload->>'prevent_self_approval')::BOOLEAN,
        prevent_self_approval
      ),
      default_distance_unit = _distance,
      version = version + 1,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
    WHERE company_id = _company_id
    RETURNING * INTO _row;
  ELSE
    IF _expected_version <> 0 THEN
      RAISE EXCEPTION 'Expense settings were updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.expense_management_settings (
      company_id, enabled, claim_number_prefix, default_claim_currency,
      employee_payable_account_id, employee_advance_account_id, petty_cash_account_id,
      rebilling_income_account_id,
      fx_gain_account_id, fx_loss_account_id, require_receipt_above_minor,
      require_spending_request_above_minor,
      allow_multi_currency_claims, prevent_self_approval, default_distance_unit,
      version, updated_by
    ) VALUES (
      _company_id,
      COALESCE((_payload->>'enabled')::BOOLEAN, false),
      _prefix,
      _currency,
      NULLIF(_payload->>'employee_payable_account_id', '')::UUID,
      NULLIF(_payload->>'employee_advance_account_id', '')::UUID,
      NULLIF(_payload->>'petty_cash_account_id', '')::UUID,
      NULLIF(_payload->>'rebilling_income_account_id', '')::UUID,
      NULLIF(_payload->>'fx_gain_account_id', '')::UUID,
      NULLIF(_payload->>'fx_loss_account_id', '')::UUID,
      GREATEST(COALESCE((_payload->>'require_receipt_above_minor')::BIGINT, 0), 0),
      GREATEST(COALESCE((_payload->>'require_spending_request_above_minor')::BIGINT, 0), 0),
      COALESCE((_payload->>'allow_multi_currency_claims')::BOOLEAN, true),
      COALESCE((_payload->>'prevent_self_approval')::BOOLEAN, true),
      _distance,
      1,
      auth.uid()
    )
    RETURNING * INTO _row;
  END IF;

  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES (_company_id, 'expense_claim', _prefix, 1, 4)
  ON CONFLICT (company_id, document_type) DO UPDATE
    SET prefix = EXCLUDED.prefix;

  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES (_company_id, 'expense_spending_request', 'SR-', 1, 4)
  ON CONFLICT (company_id, document_type) DO NOTHING;

  RETURN public.get_expense_management_settings(_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dispute_expense_corporate_card_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_expense_corporate_card_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_expense_claim_for_rebilling(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_expense_claim_rebilled(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_expense_corporate_card_transaction(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_expense_corporate_card_transaction(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_expense_claim_for_rebilling(UUID, UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expense_claim_rebilled(UUID, UUID, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
