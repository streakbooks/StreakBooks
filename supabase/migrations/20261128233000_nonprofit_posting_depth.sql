-- Posting depth for movements the planner already specifies.
-- Does not replace post_journal. Each fund still balances through nonprofit_post_balanced.

ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'nonprofit_investment';

CREATE OR REPLACE FUNCTION public.nonprofit_tagged_net(
  _company_id UUID,
  _fund_id UUID,
  _account_id UUID,
  _on DATE
) RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net BIGINT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) INTO _net
  FROM public.nonprofit_fund_tags t
  JOIN public.journal_lines jl ON jl.id = t.journal_line_id
  JOIN public.journals j ON j.id = jl.journal_id
  WHERE t.company_id = _company_id
    AND t.fund_id = _fund_id
    AND jl.account_id = _account_id
    AND j.company_id = _company_id
    AND j.status = 'posted'
    AND j.journal_date <= _on;
  RETURN _net;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_post_movement(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind TEXT;
  _fund UUID;
  _amount BIGINT;
  _on DATE;
  _key TEXT;
  _journal UUID;
  _source TEXT;
  _memo TEXT;
  _debit_role TEXT;
  _credit_role TEXT;
  _book BIGINT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  PERFORM public.nonprofit_enabled(_company_id);
  _kind := _payload->>'kind';
  _fund := NULLIF(_payload->>'fund_id', '')::UUID;
  _on := NULLIF(_payload->>'on', '')::DATE;
  _key := NULLIF(_payload->>'idempotency_key', '');
  IF _fund IS NULL OR _on IS NULL OR _key IS NULL THEN
    RAISE EXCEPTION 'Movement needs a fund, a date and an idempotency key';
  END IF;

  IF _kind = 'fx_settlement' THEN
    _amount := (_payload->>'difference_minor')::BIGINT;
    IF _amount IS NULL OR _amount = 0 THEN
      RAISE EXCEPTION 'FX difference must be a non-zero minor-unit integer';
    END IF;
    _source := 'nonprofit_fx';
    IF _amount > 0 THEN
      _memo := 'Foreign currency gain';
      _debit_role := 'bank';
      _credit_role := 'fx_gain';
    ELSE
      _amount := -_amount;
      PERFORM public.nonprofit_assert_spendable(_company_id, _fund, _on, _amount);
      _memo := 'Foreign currency loss';
      _debit_role := 'fx_loss';
      _credit_role := 'bank';
    END IF;
  ELSE
    _amount := (_payload->>'amount_minor')::BIGINT;
    IF _amount IS NULL OR _amount <= 0 THEN
      RAISE EXCEPTION 'Movement amount is invalid';
    END IF;
    IF _kind = 'depreciation' THEN
      _book := public.nonprofit_tagged_net(_company_id, _fund, public.nonprofit_mapped_account(_company_id, 'fixed_asset'), _on)
        + public.nonprofit_tagged_net(_company_id, _fund, public.nonprofit_mapped_account(_company_id, 'accumulated_depreciation'), _on);
      IF _book < _amount THEN
        RAISE EXCEPTION 'Asset book value is not large enough to depreciate';
      END IF;
      _source := 'nonprofit_asset';
      _memo := 'Depreciation';
      _debit_role := 'depreciation_expense';
      _credit_role := 'accumulated_depreciation';
    ELSIF _kind = 'payroll_accrual' THEN
      PERFORM public.nonprofit_assert_spendable(_company_id, _fund, _on, _amount);
      _source := 'nonprofit_payroll';
      _memo := 'Payroll accrual';
      _debit_role := 'payroll_expense';
      _credit_role := 'payroll_payable';
    ELSIF _kind = 'payroll_payment' THEN
      IF -public.nonprofit_tagged_net(_company_id, _fund, public.nonprofit_mapped_account(_company_id, 'payroll_payable'), _on) < _amount THEN
        RAISE EXCEPTION 'Payroll payable is not large enough to settle';
      END IF;
      _source := 'nonprofit_payroll';
      _memo := 'Payroll payment';
      _debit_role := 'payroll_payable';
      _credit_role := 'bank';
    ELSIF _kind = 'investment_income' THEN
      _source := 'nonprofit_investment';
      _memo := 'Investment income';
      _debit_role := 'bank';
      _credit_role := 'investment_income';
    ELSIF _kind = 'inventory_distribution' THEN
      IF public.nonprofit_tagged_net(_company_id, _fund, public.nonprofit_mapped_account(_company_id, 'inventory'), _on) < _amount THEN
        RAISE EXCEPTION 'Inventory balance is not large enough to distribute';
      END IF;
      PERFORM public.nonprofit_assert_spendable(_company_id, _fund, _on, _amount);
      _source := 'nonprofit_expense';
      _memo := 'Inventory distributed';
      _debit_role := 'programme_expense';
      _credit_role := 'inventory';
    ELSE
      RAISE EXCEPTION 'Movement kind is not supported';
    END IF;
  END IF;

  _journal := public.nonprofit_post_balanced(
    _company_id, _source, _fund, _on, _memo,
    upper(COALESCE(NULLIF(_payload->>'currency_code', ''), 'USD')),
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
    'np-move-' || _key,
    jsonb_build_array(
      jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, _debit_role), 'debit_minor', _amount, 'credit_minor', 0, 'description', _memo),
      jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, _credit_role), 'debit_minor', 0, 'credit_minor', _amount, 'description', _memo)
    )
  );
  RETURN jsonb_build_object('journal_id', _journal, 'status', 'posted', 'kind', _kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_impair_pledge(
  _company_id UUID,
  _pledge_id UUID,
  _amount BIGINT,
  _on DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pledge public.nonprofit_pledges;
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  SELECT * INTO _pledge FROM public.nonprofit_pledges
  WHERE id = _pledge_id AND company_id = _company_id AND unconditional AND recognised_minor > 0
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recognisable pledge was not found'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > (_pledge.recognised_minor - _pledge.collected_minor - _pledge.impaired_minor) THEN
    RAISE EXCEPTION 'Impairment exceeds the outstanding pledge';
  END IF;
  IF public.nonprofit_tagged_net(
    _company_id, _pledge.fund_id, public.nonprofit_mapped_account(_company_id, 'contributions_receivable'), _on
  ) < _amount THEN
    RAISE EXCEPTION 'Pledge receivable is not large enough to impair';
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_pledge', _pledge_id, _on, 'Pledge impairment',
    _pledge.currency_code, _pledge.fx_rate_to_base,
    'np-pledge-impair-' || _pledge_id::TEXT || '-' || (_pledge.impaired_minor + _amount)::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _pledge.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'pledge_impairment'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Pledge impaired'),
      jsonb_build_object('fund_id', _pledge.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'contributions_receivable'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Receivable written down')
    )
  );
  UPDATE public.nonprofit_pledges
  SET impaired_minor = impaired_minor + _amount,
      status = CASE
        WHEN collected_minor + impaired_minor + _amount >= recognised_minor THEN 'impaired'
        ELSE status
      END
  WHERE id = _pledge_id;
  RETURN jsonb_build_object('id', _pledge_id, 'journal_id', _journal, 'status', 'impaired');
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_allocate_expense(
  _company_id UUID,
  _expense_id UUID,
  _class TEXT,
  _amount BIGINT,
  _on DATE,
  _key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expense public.nonprofit_expenses;
  _from_role TEXT;
  _to_role TEXT;
  _journal UUID;
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.allocations.manage');
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  IF _key IS NULL OR length(trim(_key)) = 0 THEN
    RAISE EXCEPTION 'Allocation needs an idempotency key';
  END IF;
  SELECT * INTO _expense FROM public.nonprofit_expenses
  WHERE id = _expense_id AND company_id = _company_id AND status = 'posted'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Posted expense was not found'; END IF;
  IF _class IS NULL OR _class NOT IN ('programme', 'administration', 'fundraising') THEN
    RAISE EXCEPTION 'Functional class is invalid';
  END IF;
  IF _class = _expense.functional_class THEN
    RAISE EXCEPTION 'Allocation must use a different functional class';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _expense.allocated_minor + _amount > _expense.amount_minor THEN
    RAISE EXCEPTION 'Allocation exceeds the original expense';
  END IF;
  _from_role := CASE _expense.functional_class
    WHEN 'programme' THEN 'programme_expense'
    WHEN 'administration' THEN 'administration_expense'
    ELSE 'fundraising_expense'
  END;
  _to_role := CASE _class
    WHEN 'programme' THEN 'programme_expense'
    WHEN 'administration' THEN 'administration_expense'
    ELSE 'fundraising_expense'
  END;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_expense', _expense_id, _on, 'Functional allocation',
    _expense.currency_code, _expense.fx_rate_to_base,
    'np-alloc-' || _key,
    jsonb_build_array(
      jsonb_build_object('fund_id', _expense.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, _to_role), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Allocated to ' || _class),
      jsonb_build_object('fund_id', _expense.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, _from_role), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Allocated from ' || _expense.functional_class)
    )
  );
  INSERT INTO public.nonprofit_expense_allocations (
    company_id, expense_id, functional_class, amount_minor, journal_id, created_by
  ) VALUES (
    _company_id, _expense_id, _class, _amount, _journal, auth.uid()
  ) RETURNING id INTO _id;
  UPDATE public.nonprofit_expenses
  SET allocated_minor = allocated_minor + _amount
  WHERE id = _expense_id;
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'posted');
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_workspace(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings JSONB;
  _see_beneficiaries BOOLEAN;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  SELECT jsonb_build_object(
    'enabled', enabled, 'accounting_framework', accounting_framework, 'country_code', country_code,
    'allow_unrestricted_deficit', allow_unrestricted_deficit, 'enforce_segregation', enforce_segregation,
    'gateway_configured', gateway_configured, 'account_map', account_map, 'version', version
  ) INTO _settings
  FROM public.nonprofit_settings WHERE company_id = _company_id;
  _see_beneficiaries := public.has_company_permission(_company_id, 'nonprofit.beneficiaries.view');
  RETURN jsonb_build_object(
    'settings', COALESCE(_settings, jsonb_build_object('enabled', false, 'account_map', '{}'::JSONB)),
    'funds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', f.id, 'code', f.code, 'name', f.name, 'restriction', f.restriction, 'category', f.category,
      'status', f.status, 'spendable_minor', public.nonprofit_fund_spendable(_company_id, f.id, CURRENT_DATE)
    ) ORDER BY f.code) FROM public.nonprofit_funds f WHERE f.company_id = _company_id), '[]'::JSONB),
    'donors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_name', d.display_name, 'donor_kind', d.donor_kind, 'email', d.email) ORDER BY d.display_name) FROM public.nonprofit_donors d WHERE d.company_id = _company_id), '[]'::JSONB),
    'donations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'donation_number', d.donation_number, 'amount_minor', d.amount_minor, 'status', d.status, 'journal_id', d.journal_id, 'donated_on', d.donated_on, 'conditional', d.conditional) ORDER BY d.created_at DESC) FROM public.nonprofit_donations d WHERE d.company_id = _company_id), '[]'::JSONB),
    'pledges', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'pledge_number', p.pledge_number, 'amount_minor', p.amount_minor, 'status', p.status, 'collected_minor', p.collected_minor, 'impaired_minor', p.impaired_minor) ORDER BY p.created_at DESC) FROM public.nonprofit_pledges p WHERE p.company_id = _company_id), '[]'::JSONB),
    'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'code', g.code, 'title', g.title, 'award_minor', g.award_minor, 'received_minor', g.received_minor, 'recognised_minor', g.recognised_minor, 'conditional', g.conditional, 'conditions_met', g.conditions_met, 'status', g.status) ORDER BY g.code) FROM public.nonprofit_grants g WHERE g.company_id = _company_id), '[]'::JSONB),
    'expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'amount_minor', e.amount_minor, 'functional_class', e.functional_class, 'category', e.category, 'status', e.status, 'rejection_reason', e.rejection_reason, 'allocated_minor', e.allocated_minor, 'journal_id', e.journal_id) ORDER BY e.created_at DESC) FROM public.nonprofit_expenses e WHERE e.company_id = _company_id), '[]'::JSONB),
    'campaigns', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'target_minor', c.target_minor, 'status', c.status)) FROM public.nonprofit_campaigns c WHERE c.company_id = _company_id), '[]'::JSONB),
    'programmes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'objective', p.objective, 'status', p.status)) FROM public.nonprofit_programmes p WHERE p.company_id = _company_id), '[]'::JSONB),
    'volunteers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'display_name', v.display_name, 'status', v.status)) FROM public.nonprofit_volunteers v WHERE v.company_id = _company_id), '[]'::JSONB),
    'memberships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'category', m.category, 'status', m.status)) FROM public.nonprofit_memberships m WHERE m.company_id = _company_id), '[]'::JSONB),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'event_on', e.event_on, 'status', e.status)) FROM public.nonprofit_events e WHERE e.company_id = _company_id), '[]'::JSONB),
    'board', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'display_name', b.display_name, 'office', b.office)) FROM public.nonprofit_board_members b WHERE b.company_id = _company_id), '[]'::JSONB),
    'compliance', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'due_on', c.due_on, 'status', c.status, 'pack_id', c.pack_id)) FROM public.nonprofit_compliance_items c WHERE c.company_id = _company_id), '[]'::JSONB),
    'receipts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'receipt_number', r.receipt_number, 'amount_minor', r.amount_minor, 'donation_id', r.donation_id, 'wording', r.wording)) FROM public.nonprofit_receipts r WHERE r.company_id = _company_id), '[]'::JSONB),
    'beneficiaries', CASE WHEN _see_beneficiaries THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'display_name', b.display_name, 'eligibility_status', b.eligibility_status)) FROM public.nonprofit_beneficiaries b WHERE b.company_id = _company_id), '[]'::JSONB) ELSE NULL END,
    'actions', COALESCE((
      SELECT jsonb_agg(item) FROM (
        SELECT jsonb_build_object('id', p.id::TEXT, 'title', 'Outstanding pledge ' || p.pledge_number, 'href', '/nonprofit/pledges', 'severity', 'attention') AS item
        FROM public.nonprofit_pledges p
        WHERE p.company_id = _company_id AND (p.amount_minor - p.collected_minor - p.impaired_minor) > 0
        UNION ALL
        SELECT jsonb_build_object('id', g.id::TEXT, 'title', 'Grant conditions open for ' || g.code, 'href', '/nonprofit/grants', 'severity', 'attention')
        FROM public.nonprofit_grants g
        WHERE g.company_id = _company_id AND g.conditional AND NOT g.conditions_met AND g.status = 'active' AND g.received_minor > g.recognised_minor
        UNION ALL
        SELECT jsonb_build_object('id', c.id::TEXT, 'title', 'Compliance due: ' || c.title, 'href', '/nonprofit/people', 'severity', 'attention')
        FROM public.nonprofit_compliance_items c
        WHERE c.company_id = _company_id AND c.status = 'open' AND c.due_on IS NOT NULL AND c.due_on <= CURRENT_DATE + 30
      ) actions
    ), '[]'::JSONB)
  );
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'nonprofit\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
  END LOOP;
END $$;
