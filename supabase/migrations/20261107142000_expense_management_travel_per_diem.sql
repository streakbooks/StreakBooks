-- EM-08d: per diem rates + per-diem travel lines on expense claims.

ALTER TABLE public.expense_claim_lines
  ADD COLUMN IF NOT EXISTS is_per_diem BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS travel_day_count NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS per_diem_rate_id UUID,
  ADD COLUMN IF NOT EXISTS travel_start_date DATE,
  ADD COLUMN IF NOT EXISTS travel_end_date DATE;

CREATE TABLE IF NOT EXISTS public.expense_per_diem_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location_label TEXT,
  rate_minor_per_day BIGINT NOT NULL CHECK (rate_minor_per_day > 0),
  currency_code CHAR(3) NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_per_diem_rates_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT expense_per_diem_rates_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS expense_per_diem_rates_company_active_idx
  ON public.expense_per_diem_rates (company_id, is_active, effective_from DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_claim_lines_per_diem_rate_fk'
  ) THEN
    ALTER TABLE public.expense_claim_lines
      ADD CONSTRAINT expense_claim_lines_per_diem_rate_fk
      FOREIGN KEY (per_diem_rate_id)
      REFERENCES public.expense_per_diem_rates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.expense_claim_lines
  DROP CONSTRAINT IF EXISTS expense_claim_lines_mileage_shape;
ALTER TABLE public.expense_claim_lines
  DROP CONSTRAINT IF EXISTS expense_claim_lines_travel_shape;
ALTER TABLE public.expense_claim_lines
  ADD CONSTRAINT expense_claim_lines_travel_shape CHECK (
    NOT (is_mileage AND is_per_diem)
    AND (
      (
        is_mileage = false
        AND distance_value IS NULL
        AND distance_unit IS NULL
        AND mileage_rate_id IS NULL
      )
      OR (
        is_mileage = true
        AND distance_value IS NOT NULL
        AND distance_value > 0
        AND distance_unit IS NOT NULL
      )
    )
    AND (
      (
        is_per_diem = false
        AND travel_day_count IS NULL
        AND per_diem_rate_id IS NULL
      )
      OR (
        is_per_diem = true
        AND travel_day_count IS NOT NULL
        AND travel_day_count > 0
      )
    )
  );

ALTER TABLE public.expense_per_diem_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense per diem rates select scoped" ON public.expense_per_diem_rates;
CREATE POLICY "Expense per diem rates select scoped"
  ON public.expense_per_diem_rates FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'expenses.view')
      OR public.has_company_permission(company_id, 'expenses.submit')
      OR public.has_company_permission(company_id, 'expenses.admin')
    )
  );

REVOKE ALL ON TABLE public.expense_per_diem_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_per_diem_rates TO authenticated;
GRANT ALL ON TABLE public.expense_per_diem_rates TO service_role;

CREATE OR REPLACE FUNCTION public.list_expense_per_diem_rates(
  _company_id UUID,
  _active_only BOOLEAN DEFAULT true
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
    public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Per diem rate list access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.is_active DESC, r.effective_from DESC, r.name), '[]'::jsonb)
  INTO _rows
  FROM public.expense_per_diem_rates r
  WHERE r.company_id = _company_id
    AND (_active_only IS DISTINCT FROM true OR r.is_active);

  RETURN jsonb_build_object('rates', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_per_diem_rate(
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
  _name TEXT := NULLIF(btrim(COALESCE(_payload->>'name', '')), '');
  _location TEXT := NULLIF(btrim(COALESCE(_payload->>'location_label', '')), '');
  _rate BIGINT := COALESCE((_payload->>'rate_minor_per_day')::BIGINT, 0);
  _currency TEXT := upper(COALESCE(NULLIF(btrim(_payload->>'currency_code'), ''), ''));
  _account UUID := NULLIF(_payload->>'account_id', '')::UUID;
  _from DATE := COALESCE(NULLIF(_payload->>'effective_from', '')::DATE, CURRENT_DATE);
  _to DATE := NULLIF(_payload->>'effective_to', '')::DATE;
  _active BOOLEAN := COALESCE((_payload->>'is_active')::BOOLEAN, true);
  _row public.expense_per_diem_rates%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'expenses.admin') THEN
    RAISE EXCEPTION 'Per diem rate edit denied' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Per diem rate name is required (max 120 characters)';
  END IF;
  IF _rate <= 0 THEN
    RAISE EXCEPTION 'Rate per day must be greater than zero';
  END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code';
  END IF;
  IF _account IS NULL THEN
    RAISE EXCEPTION 'Expense account is required for per diem rates';
  END IF;
  IF _to IS NOT NULL AND _to < _from THEN
    RAISE EXCEPTION 'Effective-to must be on or after effective-from';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _account AND a.company_id = _company_id AND a.is_active
  ) THEN
    RAISE EXCEPTION 'Per diem expense account not found or inactive';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.expense_per_diem_rates (
      company_id, name, location_label, rate_minor_per_day, currency_code,
      account_id, effective_from, effective_to, is_active, created_by, updated_by
    ) VALUES (
      _company_id, _name, _location, _rate, _currency,
      _account, _from, _to, _active, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.expense_per_diem_rates SET
      name = _name,
      location_label = _location,
      rate_minor_per_day = _rate,
      currency_code = _currency,
      account_id = _account,
      effective_from = _from,
      effective_to = _to,
      is_active = _active,
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Per diem rate not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN to_jsonb(_row);
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
  _is_mileage BOOLEAN;
  _is_per_diem BOOLEAN;
  _distance NUMERIC;
  _distance_unit TEXT;
  _mileage_rate_id UUID;
  _per_diem_rate_id UUID;
  _travel_days NUMERIC;
  _travel_start DATE;
  _travel_end DATE;
  _rate_row public.expense_mileage_rates%ROWTYPE;
  _per_diem_row public.expense_per_diem_rates%ROWTYPE;
  _account UUID;
  _unit_price BIGINT;
  _qty NUMERIC;
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
    _is_mileage := COALESCE((_line->>'is_mileage')::BOOLEAN, false);
    _is_per_diem := COALESCE((_line->>'is_per_diem')::BOOLEAN, false);
    _tax_line := COALESCE((_line->>'tax_minor')::BIGINT, 0);

    IF _is_mileage AND _is_per_diem THEN
      RAISE EXCEPTION 'Line % cannot be both mileage and per diem', _line_no;
    END IF;

    IF _is_mileage THEN
      _distance := COALESCE((_line->>'distance_value')::NUMERIC, 0);
      _distance_unit := COALESCE(NULLIF(btrim(_line->>'distance_unit'), ''), '');
      _mileage_rate_id := NULLIF(_line->>'mileage_rate_id', '')::UUID;
      IF _distance <= 0 THEN
        RAISE EXCEPTION 'Mileage line % distance must be greater than zero', _line_no;
      END IF;
      IF _distance_unit NOT IN ('km', 'mi') THEN
        RAISE EXCEPTION 'Mileage line % distance unit must be km or mi', _line_no;
      END IF;
      IF _mileage_rate_id IS NOT NULL THEN
        SELECT * INTO _rate_row FROM public.expense_mileage_rates
        WHERE id = _mileage_rate_id AND company_id = _company_id;
        IF NOT FOUND OR NOT _rate_row.is_active THEN
          RAISE EXCEPTION 'Mileage line % rate not found or inactive', _line_no;
        END IF;
        IF _rate_row.distance_unit <> _distance_unit THEN
          RAISE EXCEPTION 'Mileage line % distance unit must match the selected rate', _line_no;
        END IF;
        IF _rate_row.currency_code <> _currency THEN
          RAISE EXCEPTION 'Mileage line % rate currency must match the claim currency', _line_no;
        END IF;
        IF _claim_date < _rate_row.effective_from
          OR (_rate_row.effective_to IS NOT NULL AND _claim_date > _rate_row.effective_to) THEN
          RAISE EXCEPTION 'Mileage line % rate is not effective for the claim date', _line_no;
        END IF;
        _unit_price := _rate_row.rate_minor_per_unit;
        _account := _rate_row.account_id;
      ELSE
        _unit_price := COALESCE((_line->>'unit_price_minor')::BIGINT, 0);
        _account := NULLIF(_line->>'account_id', '')::UUID;
        IF _unit_price <= 0 THEN
          RAISE EXCEPTION 'Mileage line % rate per unit is required', _line_no;
        END IF;
        IF _account IS NULL THEN
          RAISE EXCEPTION 'Mileage line % account is required', _line_no;
        END IF;
      END IF;
      _net := round(_distance * _unit_price)::BIGINT;
      _gross := _net + _tax_line;
    ELSIF _is_per_diem THEN
      _travel_days := COALESCE((_line->>'travel_day_count')::NUMERIC, 0);
      _per_diem_rate_id := NULLIF(_line->>'per_diem_rate_id', '')::UUID;
      IF _travel_days <= 0 THEN
        RAISE EXCEPTION 'Per diem line % day count must be greater than zero', _line_no;
      END IF;
      IF _per_diem_rate_id IS NOT NULL THEN
        SELECT * INTO _per_diem_row FROM public.expense_per_diem_rates
        WHERE id = _per_diem_rate_id AND company_id = _company_id;
        IF NOT FOUND OR NOT _per_diem_row.is_active THEN
          RAISE EXCEPTION 'Per diem line % rate not found or inactive', _line_no;
        END IF;
        IF _per_diem_row.currency_code <> _currency THEN
          RAISE EXCEPTION 'Per diem line % rate currency must match the claim currency', _line_no;
        END IF;
        IF _claim_date < _per_diem_row.effective_from
          OR (_per_diem_row.effective_to IS NOT NULL AND _claim_date > _per_diem_row.effective_to) THEN
          RAISE EXCEPTION 'Per diem line % rate is not effective for the claim date', _line_no;
        END IF;
        _unit_price := _per_diem_row.rate_minor_per_day;
        _account := _per_diem_row.account_id;
      ELSE
        _unit_price := COALESCE((_line->>'unit_price_minor')::BIGINT, 0);
        _account := NULLIF(_line->>'account_id', '')::UUID;
        IF _unit_price <= 0 THEN
          RAISE EXCEPTION 'Per diem line % rate per day is required', _line_no;
        END IF;
        IF _account IS NULL THEN
          RAISE EXCEPTION 'Per diem line % account is required', _line_no;
        END IF;
      END IF;
      _net := round(_travel_days * _unit_price)::BIGINT;
      _gross := _net + _tax_line;
    ELSE
      _net := COALESCE((_line->>'net_minor')::BIGINT, 0);
      _gross := COALESCE((_line->>'gross_minor')::BIGINT, _net + _tax_line);
      _account := NULLIF(_line->>'account_id', '')::UUID;
      IF _account IS NULL THEN
        RAISE EXCEPTION 'Line % account is required', _line_no;
      END IF;
    END IF;

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
    _is_mileage := COALESCE((_line->>'is_mileage')::BOOLEAN, false);
    _is_per_diem := COALESCE((_line->>'is_per_diem')::BOOLEAN, false);
    _tax_line := COALESCE((_line->>'tax_minor')::BIGINT, 0);
    _mileage_rate_id := NULLIF(_line->>'mileage_rate_id', '')::UUID;
    _per_diem_rate_id := NULLIF(_line->>'per_diem_rate_id', '')::UUID;
    _distance := NULL;
    _distance_unit := NULL;
    _travel_days := NULL;
    _travel_start := NULLIF(_line->>'travel_start_date', '')::DATE;
    _travel_end := NULLIF(_line->>'travel_end_date', '')::DATE;
    _unit_price := COALESCE((_line->>'unit_price_minor')::BIGINT, 0);
    _qty := COALESCE((_line->>'quantity')::NUMERIC, 1);
    _account := NULLIF(_line->>'account_id', '')::UUID;

    IF _is_mileage THEN
      _distance := (_line->>'distance_value')::NUMERIC;
      _distance_unit := btrim(_line->>'distance_unit');
      IF _mileage_rate_id IS NOT NULL THEN
        SELECT * INTO _rate_row FROM public.expense_mileage_rates
        WHERE id = _mileage_rate_id AND company_id = _company_id;
        _unit_price := _rate_row.rate_minor_per_unit;
        _account := _rate_row.account_id;
      END IF;
      _qty := _distance;
      _net := round(_distance * _unit_price)::BIGINT;
      _gross := _net + _tax_line;
    ELSIF _is_per_diem THEN
      _travel_days := (_line->>'travel_day_count')::NUMERIC;
      IF _per_diem_rate_id IS NOT NULL THEN
        SELECT * INTO _per_diem_row FROM public.expense_per_diem_rates
        WHERE id = _per_diem_rate_id AND company_id = _company_id;
        _unit_price := _per_diem_row.rate_minor_per_day;
        _account := _per_diem_row.account_id;
      END IF;
      _qty := _travel_days;
      _net := round(_travel_days * _unit_price)::BIGINT;
      _gross := _net + _tax_line;
    ELSE
      _net := COALESCE((_line->>'net_minor')::BIGINT, 0);
      _gross := COALESCE((_line->>'gross_minor')::BIGINT, _net + _tax_line);
      IF _unit_price <= 0 THEN
        _unit_price := _net;
      END IF;
    END IF;

    _reimb_line := COALESCE((_line->>'reimbursable_minor')::BIGINT, _gross);
    _non_reimb_line := COALESCE((_line->>'non_reimbursable_minor')::BIGINT, _gross - _reimb_line);

    INSERT INTO public.expense_claim_lines (
      company_id, claim_id, line_no, expense_date, merchant_name, receipt_number,
      description, category_id, account_id, quantity, unit_price_minor,
      net_minor, tax_minor, gross_minor, currency_code, exchange_rate,
      base_currency_gross_minor, reimbursable_minor, non_reimbursable_minor,
      employee_paid_minor, company_paid_minor, is_billable, notes,
      is_mileage, distance_value, distance_unit, mileage_rate_id,
      trip_origin, trip_destination,
      is_per_diem, travel_day_count, per_diem_rate_id, travel_start_date, travel_end_date
    ) VALUES (
      _company_id,
      _claim.id,
      _line_no,
      COALESCE(NULLIF(_line->>'expense_date', '')::DATE, _claim_date),
      NULLIF(btrim(COALESCE(_line->>'merchant_name', '')), ''),
      NULLIF(btrim(COALESCE(_line->>'receipt_number', '')), ''),
      btrim(_line->>'description'),
      NULLIF(_line->>'category_id', '')::UUID,
      _account,
      _qty,
      _unit_price,
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
      NULLIF(btrim(COALESCE(_line->>'notes', '')), ''),
      _is_mileage,
      _distance,
      _distance_unit,
      _mileage_rate_id,
      NULLIF(btrim(COALESCE(_line->>'trip_origin', '')), ''),
      NULLIF(btrim(COALESCE(_line->>'trip_destination', '')), ''),
      _is_per_diem,
      _travel_days,
      _per_diem_rate_id,
      _travel_start,
      _travel_end
    );
  END LOOP;

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
  SET spending_request_id = NULL, cash_advance_id = NULL, petty_cash_float_id = NULL
  WHERE company_id = _company;
  DELETE FROM public.expense_spending_requests WHERE company_id = _company;
  DELETE FROM public.expense_receipt_inbox_entries WHERE company_id = _company;
  DELETE FROM public.expense_claim_events WHERE company_id = _company;
  DELETE FROM public.expense_claim_lines WHERE company_id = _company;
  DELETE FROM public.expense_claims WHERE company_id = _company;
  DELETE FROM public.expense_claim_templates WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_cash_advances WHERE company_id = _company;
  DELETE FROM public.expense_petty_cash_floats WHERE company_id = _company;
  DELETE FROM public.expense_mileage_rates WHERE company_id = _company;
  DELETE FROM public.expense_per_diem_rates WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_per_diem_rates(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_per_diem_rate(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_per_diem_rates(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_per_diem_rate(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
