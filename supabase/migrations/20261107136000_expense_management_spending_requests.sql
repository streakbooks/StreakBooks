-- Expense Management EM-05b: pre-spend spending requests + simple policy threshold.
-- Does not post journals. Delegation/escalation remain later EM-05 slices.

ALTER TABLE public.expense_management_settings
  ADD COLUMN IF NOT EXISTS require_spending_request_above_minor BIGINT NOT NULL DEFAULT 0
    CHECK (require_spending_request_above_minor >= 0);

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS spending_request_id UUID;

CREATE TABLE IF NOT EXISTS public.expense_spending_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  needed_by DATE,
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'approved', 'returned', 'rejected', 'cancelled'
    )),
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_spending_requests_company_number_unique UNIQUE (company_id, request_number),
  CONSTRAINT expense_spending_requests_title_len CHECK (char_length(trim(title)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS expense_spending_requests_company_status_idx
  ON public.expense_spending_requests (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS expense_spending_requests_requester_idx
  ON public.expense_spending_requests (company_id, requester_user_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_claims_spending_request_fk'
  ) THEN
    ALTER TABLE public.expense_claims
      ADD CONSTRAINT expense_claims_spending_request_fk
      FOREIGN KEY (spending_request_id)
      REFERENCES public.expense_spending_requests(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.expense_spending_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense spending requests select scoped" ON public.expense_spending_requests;
CREATE POLICY "Expense spending requests select scoped"
  ON public.expense_spending_requests FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      (
        requester_user_id = auth.uid()
        AND public.has_company_permission(company_id, 'expenses.submit')
      )
      OR public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.approve')
      OR public.has_company_permission(company_id, 'expenses.audit')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

REVOKE ALL ON TABLE public.expense_spending_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_spending_requests TO authenticated;
GRANT ALL ON TABLE public.expense_spending_requests TO service_role;

CREATE OR REPLACE FUNCTION private.expense_spending_request_json(
  _row public.expense_spending_requests
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(_row);
$$;

CREATE OR REPLACE FUNCTION public.list_expense_spending_requests(
  _company_id UUID,
  _scope TEXT DEFAULT 'own'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _scope_norm TEXT := lower(COALESCE(NULLIF(btrim(_scope), ''), 'own'));
  _rows JSONB;
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
      RAISE EXCEPTION 'Expense spending request list denied' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense spending request list denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC, r.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_spending_requests r
  WHERE r.company_id = _company_id
    AND (_scope_norm = 'all' OR r.requester_user_id = auth.uid());

  RETURN jsonb_build_object('requests', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_spending_request(
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
  _title TEXT := NULLIF(btrim(COALESCE(_payload->>'title', '')), '');
  _description TEXT := NULLIF(btrim(COALESCE(_payload->>'description', '')), '');
  _currency TEXT := upper(COALESCE(NULLIF(btrim(_payload->>'currency_code'), ''), 'USD'));
  _amount BIGINT := COALESCE((_payload->>'amount_minor')::BIGINT, 0);
  _needed DATE := NULLIF(_payload->>'needed_by', '')::DATE;
  _expected INTEGER := COALESCE((_payload->>'version')::INTEGER, 1);
  _row public.expense_spending_requests%ROWTYPE;
  _number TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense spending request edit denied' USING ERRCODE = '42501';
  END IF;
  IF _title IS NULL OR char_length(_title) > 200 THEN
    RAISE EXCEPTION 'Request title is required (max 200 characters)';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF _id IS NULL THEN
    _number := public.allocate_document_number(_company_id, 'expense_spending_request');
    INSERT INTO public.expense_spending_requests (
      company_id, request_number, title, description, requester_user_id,
      needed_by, currency_code, amount_minor, status, version, created_by, updated_by
    ) VALUES (
      _company_id, _number, _title, _description, auth.uid(),
      _needed, _currency, _amount, 'draft', 1, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row
    FROM public.expense_spending_requests
    WHERE id = _id AND company_id = _company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Spending request not found' USING ERRCODE = 'P0002';
    END IF;
    IF _row.requester_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Only the requester can edit this draft' USING ERRCODE = '42501';
    END IF;
    IF _row.status NOT IN ('draft', 'returned') THEN
      RAISE EXCEPTION 'Only draft or returned requests can be edited';
    END IF;
    IF _row.version <> _expected THEN
      RAISE EXCEPTION 'Spending request was updated by someone else. Reload and try again.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.expense_spending_requests SET
      title = _title,
      description = _description,
      needed_by = _needed,
      currency_code = _currency,
      amount_minor = _amount,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  RETURN private.expense_spending_request_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense_spending_request(
  _company_id UUID,
  _request_id UUID,
  _expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_spending_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense spending request submit denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_spending_requests
  WHERE id = _request_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spending request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.requester_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can submit this request' USING ERRCODE = '42501';
  END IF;
  IF _row.status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Only draft or returned requests can be submitted';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Spending request was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expense_spending_requests SET
    status = 'submitted',
    decision_note = NULL,
    decided_at = NULL,
    decided_by = NULL,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN private.expense_spending_request_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_expense_spending_request(
  _company_id UUID,
  _request_id UUID,
  _expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_spending_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense spending request cancel denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_spending_requests
  WHERE id = _request_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spending request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.requester_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can cancel this request' USING ERRCODE = '42501';
  END IF;
  IF _row.status NOT IN ('draft', 'submitted', 'returned') THEN
    RAISE EXCEPTION 'Only open requests can be cancelled';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Spending request was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expense_spending_requests SET
    status = 'cancelled',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN private.expense_spending_request_json(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_expense_spending_request(
  _company_id UUID,
  _request_id UUID,
  _expected_version INTEGER,
  _decision TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_spending_requests%ROWTYPE;
  _decision_norm TEXT := lower(btrim(COALESCE(_decision, '')));
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
  _prevent_self BOOLEAN := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense spending request decision denied' USING ERRCODE = '42501';
  END IF;
  IF _decision_norm NOT IN ('approved', 'returned', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved, returned or rejected';
  END IF;
  IF _decision_norm IN ('returned', 'rejected') AND _note_clean IS NULL THEN
    RAISE EXCEPTION 'A decision reason is required';
  END IF;

  SELECT * INTO _row
  FROM public.expense_spending_requests
  WHERE id = _request_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spending request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted requests can be decided';
  END IF;
  IF _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Spending request was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  SELECT COALESCE(s.prevent_self_approval, true)
  INTO _prevent_self
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;
  IF COALESCE(_prevent_self, true) AND _row.requester_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own spending request. Ask another approver.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.expense_spending_requests SET
    status = _decision_norm,
    decision_note = _note_clean,
    decided_at = clock_timestamp(),
    decided_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN private.expense_spending_request_json(_row);
END;
$$;

-- Enforce optional pre-spend policy when submitting claims.
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
  _threshold BIGINT := 0;
  _sr public.expense_spending_requests%ROWTYPE;
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

  SELECT COALESCE(s.require_spending_request_above_minor, 0)
  INTO _threshold
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  IF COALESCE(_threshold, 0) > 0 AND _claim.total_minor >= _threshold THEN
    IF _claim.spending_request_id IS NULL THEN
      RAISE EXCEPTION
        'This claim is at or above the organisation pre-spend threshold. Link an approved spending request first.';
    END IF;
    SELECT * INTO _sr
    FROM public.expense_spending_requests
    WHERE id = _claim.spending_request_id AND company_id = _company_id;
    IF NOT FOUND OR _sr.status <> 'approved' THEN
      RAISE EXCEPTION 'Linked spending request must be approved before submitting this claim';
    END IF;
    IF _sr.requester_user_id <> _claim.claimant_user_id THEN
      RAISE EXCEPTION 'Linked spending request must belong to the claimant';
    END IF;
    IF _sr.amount_minor < _claim.total_minor THEN
      RAISE EXCEPTION 'Linked spending request amount is lower than this claim total';
    END IF;
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

-- Allow save_expense_claim to persist spending_request_id when provided.
-- Keep existing save function behaviour by wrapping only the link helper used from app.
CREATE OR REPLACE FUNCTION public.link_expense_claim_spending_request(
  _company_id UUID,
  _claim_id UUID,
  _expected_version INTEGER,
  _spending_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _sr public.expense_spending_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
    RAISE EXCEPTION 'Expense claim link denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF _claim.claimant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the claimant can link a spending request' USING ERRCODE = '42501';
  END IF;
  IF _claim.approval_status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Only draft or returned claims can link a spending request';
  END IF;
  IF _claim.version <> _expected_version THEN
    RAISE EXCEPTION 'Expense claim was updated by someone else. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  IF _spending_request_id IS NULL THEN
    UPDATE public.expense_claims SET
      spending_request_id = NULL,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _claim.id
    RETURNING * INTO _claim;
    RETURN private.expense_claim_json(_claim);
  END IF;

  SELECT * INTO _sr
  FROM public.expense_spending_requests
  WHERE id = _spending_request_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spending request not found';
  END IF;
  IF _sr.requester_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only link your own spending requests';
  END IF;
  IF _sr.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved spending requests can be linked';
  END IF;

  UPDATE public.expense_claims SET
    spending_request_id = _sr.id,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE id = _claim.id
  RETURNING * INTO _claim;

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

  UPDATE public.expense_claims SET spending_request_id = NULL WHERE company_id = _company;
  DELETE FROM public.expense_spending_requests WHERE company_id = _company;
  DELETE FROM public.expense_receipt_inbox_entries WHERE company_id = _company;
  DELETE FROM public.expense_claim_events WHERE company_id = _company;
  DELETE FROM public.expense_claim_lines WHERE company_id = _company;
  DELETE FROM public.expense_claims WHERE company_id = _company;
  DELETE FROM public.expense_claim_templates WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_spending_requests(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_spending_request(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_expense_spending_request(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_expense_spending_request(UUID, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_expense_spending_request(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_expense_claim_spending_request(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_spending_requests(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_spending_request(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_expense_spending_request(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expense_spending_request(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_expense_spending_request(UUID, UUID, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_expense_claim_spending_request(UUID, UUID, INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
