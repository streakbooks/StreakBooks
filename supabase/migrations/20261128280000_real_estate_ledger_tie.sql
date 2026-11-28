-- Compares Real Estate operational totals with the journals those operations posted.
-- A difference of zero means the register matches the general ledger for that source.

CREATE OR REPLACE FUNCTION public.realestate_ledger_tie(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lines JSONB := '[]'::jsonb;
  _ledger BIGINT;
  _reversal BIGINT;
  _operational BIGINT;
  _debits BIGINT;
  _credits BIGINT;
BEGIN
  IF NOT public.is_company_member(_company_id)
     OR NOT public.has_company_permission(_company_id, 'realestate.view') THEN
    RAISE EXCEPTION 'Real Estate access is required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(l.debit_minor), 0) INTO _ledger
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted' AND j.source_type = 'real_estate_deposit';
  SELECT COALESCE(SUM(amount_minor), 0) INTO _operational
  FROM public.realestate_collections WHERE company_id = _company_id;
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'source', 'customer_collections', 'ledger_minor', _ledger, 'operational_minor', _operational,
    'difference_minor', _ledger - _operational
  ));

  SELECT COALESCE(SUM(l.debit_minor), 0) INTO _ledger
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted' AND j.source_type = 'real_estate_refund';
  SELECT COALESCE(SUM(amount_minor), 0) INTO _operational
  FROM public.realestate_refunds WHERE company_id = _company_id;
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'source', 'customer_refunds', 'ledger_minor', _ledger, 'operational_minor', _operational,
    'difference_minor', _ledger - _operational
  ));

  SELECT COALESCE(SUM(l.debit_minor), 0) INTO _ledger
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted'
    AND j.id IN (
      SELECT journal_id FROM public.realestate_recognitions
      WHERE company_id = _company_id AND journal_id IS NOT NULL
    );
  SELECT COALESCE(SUM(l.debit_minor), 0) INTO _reversal
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted'
    AND j.id IN (
      SELECT reversal_journal_id FROM public.realestate_recognitions
      WHERE company_id = _company_id AND reversal_journal_id IS NOT NULL
    );
  SELECT COALESCE(SUM(revenue_minor + cos_minor), 0) INTO _operational
  FROM public.realestate_recognitions
  WHERE company_id = _company_id AND reversed_at IS NULL;
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'source', 'revenue_and_cost_of_sales', 'ledger_minor', _ledger - _reversal,
    'operational_minor', _operational, 'difference_minor', (_ledger - _reversal) - _operational
  ));

  SELECT COALESCE(SUM(l.debit_minor), 0) INTO _ledger
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted' AND j.source_type = 'real_estate_commission';
  SELECT COALESCE(SUM(gross_minor), 0) INTO _operational
  FROM public.realestate_commission_accruals
  WHERE company_id = _company_id AND status = 'posted';
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'source', 'commissions', 'ledger_minor', _ledger, 'operational_minor', _operational,
    'difference_minor', _ledger - _operational
  ));

  SELECT COALESCE(SUM(l.debit_minor), 0) INTO _ledger
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted' AND j.source_type = 'real_estate_cost';
  SELECT COALESCE(SUM(amount_minor), 0) INTO _operational
  FROM public.realestate_costs WHERE company_id = _company_id AND journal_id IS NOT NULL;
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'source', 'operating_costs', 'ledger_minor', _ledger, 'operational_minor', _operational,
    'difference_minor', _ledger - _operational
  ));

  SELECT COALESCE(SUM(l.debit_minor), 0), COALESCE(SUM(l.credit_minor), 0)
  INTO _debits, _credits
  FROM public.journal_lines l
  JOIN public.journals j ON j.id = l.journal_id
  WHERE j.company_id = _company_id AND j.status = 'posted'
    AND j.source_type IN (
      'real_estate_deposit', 'real_estate_refund', 'real_estate_revenue',
      'real_estate_commission', 'real_estate_cost'
    );
  _lines := _lines || jsonb_build_array(jsonb_build_object(
    'source', 'journal_balance', 'ledger_minor', _debits, 'operational_minor', _credits,
    'difference_minor', _debits - _credits
  ));

  RETURN jsonb_build_object(
    'tied', NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_lines) line
      WHERE (line->>'difference_minor')::BIGINT <> 0
    ),
    'lines', _lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.realestate_ledger_tie(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.realestate_ledger_tie(UUID) TO authenticated;
