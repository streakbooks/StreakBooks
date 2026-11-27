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
