-- Disbursement approval posts through the existing ledger.
-- Beneficiary-linked rows stay hidden without nonprofit.beneficiaries.view.

ALTER TABLE public.nonprofit_disbursements
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE OR REPLACE FUNCTION public.nonprofit_request_disbursement(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _beneficiary public.nonprofit_beneficiaries;
  _amount BIGINT;
  _fund UUID;
  _assistance UUID;
  _id UUID;
  _reason TEXT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.beneficiaries.view');
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  _amount := (_payload->>'amount_minor')::BIGINT;
  _fund := NULLIF(_payload->>'fund_id', '')::UUID;
  IF _amount IS NULL OR _amount <= 0 OR _fund IS NULL THEN
    RAISE EXCEPTION 'Disbursement needs a fund and a positive amount';
  END IF;
  SELECT * INTO _beneficiary FROM public.nonprofit_beneficiaries
  WHERE id = NULLIF(_payload->>'beneficiary_id', '')::UUID AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Beneficiary was not found'; END IF;
  INSERT INTO public.nonprofit_assistance (
    company_id, beneficiary_id, request_kind, amount_minor, status, created_by
  ) VALUES (
    _company_id, _beneficiary.id, 'financial', _amount,
    CASE WHEN _beneficiary.eligibility_status = 'eligible' THEN 'requested' ELSE 'rejected' END,
    auth.uid()
  ) RETURNING id INTO _assistance;
  _reason := CASE
    WHEN _beneficiary.eligibility_status = 'eligible' THEN NULL
    ELSE 'Beneficiary is not eligible for a financial disbursement'
  END;
  INSERT INTO public.nonprofit_disbursements (
    company_id, assistance_id, fund_id, beneficiary_id, amount_minor,
    requested_by, status, rejection_reason
  ) VALUES (
    _company_id, _assistance, _fund, _beneficiary.id, _amount, auth.uid(),
    CASE WHEN _reason IS NULL THEN 'draft' ELSE 'rejected' END, _reason
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object(
    'id', _id,
    'status', CASE WHEN _reason IS NULL THEN 'draft' ELSE 'rejected' END,
    'journal_id', NULL,
    'reason', _reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_decide_disbursement(
  _company_id UUID,
  _disbursement_id UUID,
  _decision TEXT,
  _on DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.nonprofit_disbursements;
  _seg BOOLEAN;
  _journal UUID;
  _eligible TEXT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.disbursements.approve');
  IF _decision NOT IN ('posted', 'rejected') THEN
    RAISE EXCEPTION 'Disbursement decision is invalid';
  END IF;
  SELECT * INTO _row FROM public.nonprofit_disbursements
  WHERE id = _disbursement_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disbursement was not found'; END IF;
  IF _row.status <> 'draft' THEN
    RAISE EXCEPTION 'Disbursement is not awaiting a decision';
  END IF;
  SELECT enforce_segregation INTO _seg FROM public.nonprofit_settings WHERE company_id = _company_id;
  IF COALESCE(_seg, false) AND _row.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'The requester cannot approve this disbursement';
  END IF;
  IF _decision = 'rejected' THEN
    UPDATE public.nonprofit_disbursements
    SET status = 'rejected', approved_by = auth.uid(), rejection_reason = 'Rejected by approver'
    WHERE id = _disbursement_id;
    UPDATE public.nonprofit_assistance SET status = 'rejected' WHERE id = _row.assistance_id;
    RETURN jsonb_build_object('id', _disbursement_id, 'status', 'rejected', 'journal_id', NULL);
  END IF;
  SELECT eligibility_status INTO _eligible FROM public.nonprofit_beneficiaries
  WHERE id = _row.beneficiary_id AND company_id = _company_id;
  IF _eligible IS DISTINCT FROM 'eligible' THEN
    RAISE EXCEPTION 'Beneficiary is not eligible for a financial disbursement';
  END IF;
  PERFORM public.nonprofit_assert_spendable(_company_id, _row.fund_id, _on, _row.amount_minor);
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_expense', _disbursement_id, _on, 'Beneficiary disbursement',
    (SELECT base_currency FROM public.companies WHERE id = _company_id), 1,
    'np-disburse-' || _disbursement_id::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _row.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'programme_expense'), 'debit_minor', _row.amount_minor, 'credit_minor', 0, 'description', 'Disbursement'),
      jsonb_build_object('fund_id', _row.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', 0, 'credit_minor', _row.amount_minor, 'description', 'Disbursement paid')
    )
  );
  UPDATE public.nonprofit_disbursements
  SET status = 'posted', approved_by = auth.uid(), journal_id = _journal, rejection_reason = NULL
  WHERE id = _disbursement_id;
  UPDATE public.nonprofit_assistance SET status = 'disbursed' WHERE id = _row.assistance_id;
  RETURN jsonb_build_object('id', _disbursement_id, 'status', 'posted', 'journal_id', _journal);
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
    'disbursements', CASE WHEN _see_beneficiaries THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'display_name', b.display_name, 'amount_minor', d.amount_minor,
        'status', d.status, 'rejection_reason', d.rejection_reason
      ) ORDER BY d.created_at DESC)
      FROM public.nonprofit_disbursements d
      JOIN public.nonprofit_beneficiaries b ON b.id = d.beneficiary_id
      WHERE d.company_id = _company_id
    ), '[]'::JSONB) ELSE NULL END,
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
        UNION ALL
        SELECT jsonb_build_object('id', d.id::TEXT, 'title', 'Disbursement awaiting approval', 'href', '/nonprofit/people', 'severity', 'attention')
        FROM public.nonprofit_disbursements d
        WHERE _see_beneficiaries AND d.company_id = _company_id AND d.status = 'draft'
      ) actions
    ), '[]'::JSONB)
  );
END;
$$;

DROP POLICY IF EXISTS np_member_select ON public.nonprofit_disbursements;
CREATE POLICY np_member_select ON public.nonprofit_disbursements
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'nonprofit.beneficiaries.view')
  );

DROP POLICY IF EXISTS np_member_select ON public.nonprofit_assistance;
CREATE POLICY np_member_select ON public.nonprofit_assistance
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'nonprofit.beneficiaries.view')
  );

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
