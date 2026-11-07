-- Expense Management EM-03: claim draft lifecycle RPCs (create/edit/submit/withdraw/delete).
-- Requires 20261107120000_expense_management_foundation.sql.
-- Does not post journals or pay reimbursements (EM-06 / EM-07).

CREATE OR REPLACE FUNCTION private.expense_claim_can_read(_company_id UUID, _claimant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_company_member(_company_id)
    AND (
      (
        _claimant = auth.uid()
        AND public.has_company_permission(_company_id, 'expenses.submit')
      )
      OR public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.approve')
      OR public.has_company_permission(_company_id, 'expenses.audit')
      OR public.has_company_permission(_company_id, 'expenses.admin')
    );
$$;

CREATE OR REPLACE FUNCTION private.expense_claim_event(
  _company_id UUID,
  _claim_id UUID,
  _event_type TEXT,
  _approval TEXT,
  _posting TEXT,
  _reimbursement TEXT,
  _note TEXT DEFAULT NULL,
  _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.expense_claim_events (
    company_id, claim_id, event_type,
    approval_status_after, posting_status_after, reimbursement_status_after,
    note, payload, acted_by
  ) VALUES (
    _company_id, _claim_id, _event_type,
    _approval, _posting, _reimbursement,
    _note, COALESCE(_payload, '{}'::jsonb), auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.expense_claim_json(_claim public.expense_claims)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lines JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
  INTO _lines
  FROM public.expense_claim_lines l
  WHERE l.claim_id = _claim.id;

  RETURN to_jsonb(_claim) || jsonb_build_object('lines', _lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_expense_claims(
  _company_id UUID,
  _scope TEXT DEFAULT 'own',
  _approval_statuses TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
  _scope_norm TEXT := lower(COALESCE(NULLIF(btrim(_scope), ''), 'own'));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;

  IF _scope_norm = 'all' THEN
    IF NOT (
      public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.approve')
      OR public.has_company_permission(_company_id, 'expenses.audit')
      OR public.has_company_permission(_company_id, 'expenses.admin')
    ) THEN
      RAISE EXCEPTION 'Expense claim list access denied' USING ERRCODE = '42501';
    END IF;
  ELSIF _scope_norm = 'own' THEN
    IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
      RAISE EXCEPTION 'Expense claim list access denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown expense claim list scope';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.updated_at DESC, c.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND (_scope_norm = 'all' OR c.claimant_user_id = auth.uid())
    AND (
      _approval_statuses IS NULL
      OR cardinality(_approval_statuses) = 0
      OR c.approval_status = ANY (_approval_statuses)
    );

  RETURN jsonb_build_object('claims', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expense_claim(_company_id UUID, _claim_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.expense_claim_can_read(_company_id, _claim.claimant_user_id) THEN
    RAISE EXCEPTION 'Expense claim access denied' USING ERRCODE = '42501';
  END IF;

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_claim(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim_id UUID := NULLIF(_payload->>'id', '')::UUID;
  _title TEXT := NULLIF(btrim(COALESCE(_payload->>'title', '')), '');
  _description TEXT := NULLIF(btrim(COALESCE(_payload->>'description', '')), '');
  _claim_date DATE := COALESCE(NULLIF(_payload->>'claim_date', '')::DATE, CURRENT_DATE);
  _currency TEXT := upper(COALESCE(NULLIF(btrim(_payload->>'claim_currency'), ''), ''));
  _reimb_currency TEXT;
  _payment_source TEXT := COALESCE(NULLIF(btrim(_payload->>'payment_source'), ''), 'employee_paid');
  _expected_version INTEGER := COALESCE((_payload->>'version')::INTEGER, 0);
  _lines JSONB := COALESCE(_payload->'lines', '[]'::jsonb);
  _line JSONB;
  _line_no INTEGER := 0;
  _subtotal BIGINT := 0;
  _tax BIGINT := 0;
  _total BIGINT := 0;
  _reimbursable BIGINT := 0;
  _non_reimbursable BIGINT := 0;
  _claim public.expense_claims%ROWTYPE;
  _claim_number TEXT;
  _net BIGINT;
  _tax_line BIGINT;
  _gross BIGINT;
  _reimb_line BIGINT;
  _non_reimb_line BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim edit denied' USING ERRCODE = '42501';
  END IF;
  IF _title IS NULL OR char_length(_title) > 200 THEN
    RAISE EXCEPTION 'Claim title is required (max 200 characters)';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Claim currency must be a 3-letter ISO code';
  END IF;
  _reimb_currency := upper(COALESCE(NULLIF(btrim(_payload->>'reimbursement_currency'), ''), _currency));
  IF _reimb_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Reimbursement currency must be a 3-letter ISO code';
  END IF;
  IF _payment_source NOT IN ('employee_paid', 'corporate_card', 'cash_advance', 'company_paid') THEN
    RAISE EXCEPTION 'Invalid payment source';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 1 THEN
    RAISE EXCEPTION 'At least one expense line is required';
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    _line_no := _line_no + 1;
    _net := COALESCE((_line->>'net_minor')::BIGINT, 0);
    _tax_line := COALESCE((_line->>'tax_minor')::BIGINT, 0);
    _gross := COALESCE((_line->>'gross_minor')::BIGINT, _net + _tax_line);
    IF _gross <> _net + _tax_line THEN
      RAISE EXCEPTION 'Line % gross must equal net + tax', _line_no;
    END IF;
    IF _net < 0 OR _tax_line < 0 OR _gross <= 0 THEN
      RAISE EXCEPTION 'Line % amounts must be non-negative with gross > 0', _line_no;
    END IF;
    _reimb_line := COALESCE((_line->>'reimbursable_minor')::BIGINT, _gross);
    _non_reimb_line := COALESCE((_line->>'non_reimbursable_minor')::BIGINT, _gross - _reimb_line);
    IF _reimb_line + _non_reimb_line <> _gross THEN
      RAISE EXCEPTION 'Line % reimbursable parts must equal gross', _line_no;
    END IF;
    IF NULLIF(btrim(COALESCE(_line->>'description', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Line % description is required', _line_no;
    END IF;
    IF NULLIF(_line->>'account_id', '') IS NULL THEN
      RAISE EXCEPTION 'Line % account is required', _line_no;
    END IF;
    _subtotal := _subtotal + _net;
    _tax := _tax + _tax_line;
    _total := _total + _gross;
    _reimbursable := _reimbursable + _reimb_line;
    _non_reimbursable := _non_reimbursable + _non_reimb_line;
  END LOOP;

  IF _claim_id IS NULL THEN
    _claim_number := public.allocate_document_number(_company_id, 'expense_claim');
    INSERT INTO public.expense_claims (
      company_id, claim_number, title, description, claimant_user_id,
      claim_date, claim_currency, reimbursement_currency, payment_source,
      approval_status, posting_status, reimbursement_status,
      subtotal_minor, tax_minor, total_minor, reimbursable_minor, non_reimbursable_minor,
      base_currency_total_minor, version, created_by, updated_by
    ) VALUES (
      _company_id, _claim_number, _title, _description, auth.uid(),
      _claim_date, _currency, _reimb_currency, _payment_source,
      'draft', 'not_posted', 'not_eligible',
      _subtotal, _tax, _total, _reimbursable, _non_reimbursable,
      _total, 1, auth.uid(), auth.uid()
    )
    RETURNING * INTO _claim;

    PERFORM private.expense_claim_event(
      _company_id, _claim.id, 'created',
      _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
      'Draft claim created'
    );
  ELSE
    SELECT * INTO _claim
    FROM public.expense_claims
    WHERE id = _claim_id AND company_id = _company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
    END IF;
    IF _claim.claimant_user_id <> auth.uid()
      AND NOT public.has_company_permission(_company_id, 'expenses.admin') THEN
      RAISE EXCEPTION 'Only the claimant can edit this draft' USING ERRCODE = '42501';
    END IF;
    IF _claim.approval_status NOT IN ('draft', 'returned') THEN
      RAISE EXCEPTION 'Only draft or returned claims can be edited';
    END IF;
    IF _claim.version <> _expected_version THEN
      RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.expense_claims SET
      title = _title,
      description = _description,
      claim_date = _claim_date,
      claim_currency = _currency,
      reimbursement_currency = _reimb_currency,
      payment_source = _payment_source,
      subtotal_minor = _subtotal,
      tax_minor = _tax,
      total_minor = _total,
      reimbursable_minor = _reimbursable,
      non_reimbursable_minor = _non_reimbursable,
      base_currency_total_minor = _total,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id
    RETURNING * INTO _claim;

    DELETE FROM public.expense_claim_lines WHERE claim_id = _claim.id;

    PERFORM private.expense_claim_event(
      _company_id, _claim.id, 'updated',
      _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
      'Draft claim updated'
    );
  END IF;

  _line_no := 0;
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    _line_no := _line_no + 1;
    _net := COALESCE((_line->>'net_minor')::BIGINT, 0);
    _tax_line := COALESCE((_line->>'tax_minor')::BIGINT, 0);
    _gross := COALESCE((_line->>'gross_minor')::BIGINT, _net + _tax_line);
    _reimb_line := COALESCE((_line->>'reimbursable_minor')::BIGINT, _gross);
    _non_reimb_line := COALESCE((_line->>'non_reimbursable_minor')::BIGINT, _gross - _reimb_line);

    INSERT INTO public.expense_claim_lines (
      company_id, claim_id, line_no, expense_date, merchant_name, receipt_number,
      description, category_id, account_id, quantity, unit_price_minor,
      net_minor, tax_minor, gross_minor, currency_code, exchange_rate,
      base_currency_gross_minor, reimbursable_minor, non_reimbursable_minor,
      employee_paid_minor, company_paid_minor, is_billable, notes
    ) VALUES (
      _company_id,
      _claim.id,
      _line_no,
      COALESCE(NULLIF(_line->>'expense_date', '')::DATE, _claim_date),
      NULLIF(btrim(COALESCE(_line->>'merchant_name', '')), ''),
      NULLIF(btrim(COALESCE(_line->>'receipt_number', '')), ''),
      btrim(_line->>'description'),
      NULLIF(_line->>'category_id', '')::UUID,
      (_line->>'account_id')::UUID,
      COALESCE((_line->>'quantity')::NUMERIC, 1),
      COALESCE((_line->>'unit_price_minor')::BIGINT, _net),
      _net,
      _tax_line,
      _gross,
      upper(COALESCE(NULLIF(btrim(_line->>'currency_code'), ''), _currency)),
      COALESCE((_line->>'exchange_rate')::NUMERIC, 1),
      COALESCE((_line->>'base_currency_gross_minor')::BIGINT, _gross),
      _reimb_line,
      _non_reimb_line,
      CASE WHEN _payment_source = 'employee_paid' THEN _reimb_line ELSE 0 END,
      CASE WHEN _payment_source = 'employee_paid' THEN 0 ELSE _gross END,
      COALESCE((_line->>'is_billable')::BOOLEAN, false),
      NULLIF(btrim(COALESCE(_line->>'notes', '')), '')
    );
  END LOOP;

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense_claim(
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
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim submit denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.claimant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the claimant can submit this claim' USING ERRCODE = '42501';
  END IF;
  IF _claim.approval_status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Only draft or returned claims can be submitted';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.expense_claim_lines WHERE claim_id = _claim.id) THEN
    RAISE EXCEPTION 'Add at least one expense line before submitting';
  END IF;

  UPDATE public.expense_claims SET
    approval_status = 'submitted',
    submitted_at = clock_timestamp(),
    submitted_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'submitted',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Claim submitted for approval'
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_expense_claim(
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
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim withdraw denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.claimant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the claimant can withdraw this claim' USING ERRCODE = '42501';
  END IF;
  IF _claim.approval_status NOT IN ('submitted', 'in_review') THEN
    RAISE EXCEPTION 'Only submitted or in-review claims can be withdrawn';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expense_claims SET
    approval_status = 'withdrawn',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

  PERFORM private.expense_claim_event(
    _company_id, _claim.id, 'withdrawn',
    _claim.approval_status, _claim.posting_status, _claim.reimbursement_status,
    'Claim withdrawn by claimant'
  );

  RETURN private.expense_claim_json(_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_claim_draft(
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
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim delete denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.claimant_user_id <> auth.uid()
    AND NOT public.has_company_permission(_company_id, 'expenses.admin') THEN
    RAISE EXCEPTION 'Only the claimant can delete this draft' USING ERRCODE = '42501';
  END IF;
  IF _claim.approval_status <> 'draft' THEN
    RAISE EXCEPTION 'Only unsubmitted drafts can be deleted';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.expense_claim_events WHERE claim_id = _claim.id;
  DELETE FROM public.expense_claim_lines WHERE claim_id = _claim.id;
  DELETE FROM public.expense_claims WHERE id = _claim.id;

  RETURN jsonb_build_object('deleted', true, 'id', _claim_id);
END;
$$;

REVOKE ALL ON FUNCTION private.expense_claim_can_read(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.expense_claim_event(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.expense_claim_json(public.expense_claims) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_expense_claims(UUID, TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_expense_claim(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_claim(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_expense_claim(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_expense_claim(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_expense_claim_draft(UUID, UUID, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_expense_claims(UUID, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_claim(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_claim(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_expense_claim(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_expense_claim(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense_claim_draft(UUID, UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
