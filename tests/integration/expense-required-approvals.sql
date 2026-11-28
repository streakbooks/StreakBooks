INSERT INTO public.test_permissions(company_id, user_id, permission) VALUES
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'expenses.approve'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'expenses.manage_policies'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'expenses.approve');

INSERT INTO public.expense_claims (
  id, company_id, claim_number, claimant_user_id, approval_status, posting_status,
  reimbursement_status, payment_source, version, total_minor, reimbursement_currency
) VALUES (
  '40000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000011',
  'MULTI-APPROVAL-1',
  '00000000-0000-4000-8000-000000000003',
  'submitted', 'not_posted', 'not_eligible', 'employee_paid', 1, 1000, 'INR'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);
SELECT public.save_expense_required_approval_count(
  '10000000-0000-4000-8000-000000000011', 2
);
SELECT public.approve_expense_claim(
  '10000000-0000-4000-8000-000000000011',
  '40000000-0000-4000-8000-000000000021', 1, 'First review'
);

DO $$
BEGIN
  IF (SELECT approval_status FROM public.expense_claims
      WHERE id = '40000000-0000-4000-8000-000000000021') <> 'in_review'
     OR (SELECT count(*) FROM public.expense_claim_approvals
         WHERE claim_id = '40000000-0000-4000-8000-000000000021') <> 1
     OR (SELECT approved_at FROM public.expense_claims
         WHERE id = '40000000-0000-4000-8000-000000000021') IS NOT NULL THEN
    RAISE EXCEPTION 'TEST: first approval incorrectly completed the two-approver claim';
  END IF;

  BEGIN
    PERFORM public.approve_expense_claim(
      '10000000-0000-4000-8000-000000000011',
      '40000000-0000-4000-8000-000000000021', 2, 'Duplicate review'
    );
    RAISE EXCEPTION 'TEST: same approver was counted twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'You have already approved this claim' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002"}', false);
SELECT public.approve_expense_claim(
  '10000000-0000-4000-8000-000000000011',
  '40000000-0000-4000-8000-000000000021', 2, 'Second review'
);

DO $$
BEGIN
  IF (SELECT approval_status FROM public.expense_claims
      WHERE id = '40000000-0000-4000-8000-000000000021') <> 'approved'
     OR (SELECT approved_by FROM public.expense_claims
         WHERE id = '40000000-0000-4000-8000-000000000021') <>
        '00000000-0000-4000-8000-000000000002'::uuid
     OR (SELECT count(DISTINCT approver_user_id) FROM public.expense_claim_approvals
         WHERE claim_id = '40000000-0000-4000-8000-000000000021') <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.audit_events
       WHERE company_id = '10000000-0000-4000-8000-000000000011'
         AND action = 'settings.expense_management'
         AND details->'after'->>'required_approval_count' = '2'
     ) THEN
    RAISE EXCEPTION 'TEST: two distinct approvals or settings audit evidence missing';
  END IF;
END $$;

SELECT 'PASS: required approval count gates claims until distinct approvers meet the setting' AS result;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);
DO $$
DECLARE
  _settings public.expense_management_settings%ROWTYPE;
BEGIN
  SELECT * INTO _settings FROM public.expense_management_settings
  WHERE company_id = '10000000-0000-4000-8000-000000000011';
  PERFORM public.save_expense_management_settings(
    _settings.company_id,
    jsonb_build_object(
      'version', _settings.version,
      'enabled', _settings.enabled,
      'claim_number_prefix', _settings.claim_number_prefix,
      'default_claim_currency', _settings.default_claim_currency,
      'employee_payable_account_id', _settings.employee_payable_account_id,
      'employee_advance_account_id', _settings.employee_advance_account_id,
      'petty_cash_account_id', _settings.petty_cash_account_id,
      'rebilling_income_account_id', _settings.rebilling_income_account_id,
      'fx_gain_account_id', _settings.fx_gain_account_id,
      'fx_loss_account_id', _settings.fx_loss_account_id,
      'require_receipt_above_minor', 1000,
      'require_spending_request_above_minor', 500,
      'allow_multi_currency_claims', _settings.allow_multi_currency_claims,
      'prevent_self_approval', _settings.prevent_self_approval,
      'default_distance_unit', _settings.default_distance_unit
    )
  );
END $$;
DO $$
DECLARE
  _scan jsonb;
BEGIN
  _scan := public.scan_expense_claim_risks(
    '10000000-0000-4000-8000-000000000011',
    '40000000-0000-4000-8000-000000000021'
  );
  IF NOT (_scan->'flags' @> '[{"code":"missing_receipt"}]'::jsonb)
     OR NOT (_scan->'flags' @> '[{"code":"missing_spending_request"}]'::jsonb) THEN
    RAISE EXCEPTION 'TEST: expense claim risk scan ignored configured receipt or spending thresholds';
  END IF;
END $$;
DO $$
DECLARE
  _settings public.expense_management_settings%ROWTYPE;
BEGIN
  SELECT * INTO _settings FROM public.expense_management_settings
  WHERE company_id = '10000000-0000-4000-8000-000000000011';
  PERFORM public.save_expense_management_settings(
    _settings.company_id,
    jsonb_build_object(
      'version', _settings.version,
      'enabled', _settings.enabled,
      'claim_number_prefix', _settings.claim_number_prefix,
      'default_claim_currency', _settings.default_claim_currency,
      'employee_payable_account_id', _settings.employee_payable_account_id,
      'employee_advance_account_id', _settings.employee_advance_account_id,
      'petty_cash_account_id', _settings.petty_cash_account_id,
      'rebilling_income_account_id', _settings.rebilling_income_account_id,
      'fx_gain_account_id', _settings.fx_gain_account_id,
      'fx_loss_account_id', _settings.fx_loss_account_id,
      'require_receipt_above_minor', 1001,
      'require_spending_request_above_minor', 1001,
      'allow_multi_currency_claims', _settings.allow_multi_currency_claims,
      'prevent_self_approval', _settings.prevent_self_approval,
      'default_distance_unit', _settings.default_distance_unit
    )
  );
END $$;
DO $$
DECLARE
  _scan jsonb;
BEGIN
  _scan := public.scan_expense_claim_risks(
    '10000000-0000-4000-8000-000000000011',
    '40000000-0000-4000-8000-000000000021'
  );
  IF _scan->'flags' @> '[{"code":"missing_receipt"}]'::jsonb
     OR _scan->'flags' @> '[{"code":"missing_spending_request"}]'::jsonb THEN
    RAISE EXCEPTION 'TEST: below-threshold claim was flagged for receipt or spending request';
  END IF;
END $$;

UPDATE public.expense_claims
SET approval_status = 'submitted', submitted_at = clock_timestamp() - interval '6 days'
WHERE id = '40000000-0000-4000-8000-000000000021';
SELECT public.save_expense_approval_escalation_days(
  '10000000-0000-4000-8000-000000000011', 5
);
DO $$
DECLARE
  _list jsonb;
BEGIN
  _list := public.list_expense_approval_escalations(
    '10000000-0000-4000-8000-000000000011'
  );
  IF jsonb_array_length(_list->'claims') <> 1
     OR (_list->>'escalation_days')::integer <> 5 THEN
    RAISE EXCEPTION 'TEST: overdue claim did not follow the five-day escalation setting';
  END IF;
END $$;

SELECT public.save_expense_approval_escalation_days(
  '10000000-0000-4000-8000-000000000011', 7
);
DO $$
DECLARE
  _list jsonb;
BEGIN
  _list := public.list_expense_approval_escalations(
    '10000000-0000-4000-8000-000000000011'
  );
  IF jsonb_array_length(_list->'claims') <> 0
     OR (_list->>'escalation_days')::integer <> 7 THEN
    RAISE EXCEPTION 'TEST: changing the escalation window did not update the overdue queue';
  END IF;
END $$;

SELECT public.save_expense_approval_escalation_days(
  '10000000-0000-4000-8000-000000000011', 0
);
DO $$
DECLARE
  _list jsonb;
BEGIN
  _list := public.list_expense_approval_escalations(
    '10000000-0000-4000-8000-000000000011'
  );
  IF jsonb_array_length(_list->'claims') <> 0
     OR (_list->>'escalation_days')::integer <> 0
     OR NOT EXISTS (
       SELECT 1 FROM public.audit_events
       WHERE company_id = '10000000-0000-4000-8000-000000000011'
         AND action = 'settings.expense_management'
         AND details->'after'->>'approval_escalation_days' = '0'
     ) THEN
    RAISE EXCEPTION 'TEST: zero-day setting did not disable or audit escalation';
  END IF;
END $$;

SELECT 'PASS: expense escalation setting controls overdue queue and audited disable state' AS result;
