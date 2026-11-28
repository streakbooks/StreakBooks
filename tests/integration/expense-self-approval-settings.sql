INSERT INTO public.test_permissions(company_id, user_id, permission) VALUES
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'expenses.approve'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'expenses.approve');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
BEGIN
  BEGIN
    PERFORM private.expense_claim_assert_approver(
      '10000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'TEST: self-approval was accepted while the setting was enabled';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT ILIKE '%cannot approve your own expense claim%' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002"}', false);

DO $$
BEGIN
  PERFORM private.expense_claim_assert_approver(
    '10000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001'
  );
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);
UPDATE public.expense_management_settings
SET prevent_self_approval = false
WHERE company_id = '10000000-0000-4000-8000-000000000011';

DO $$
BEGIN
  PERFORM private.expense_claim_assert_approver(
    '10000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001'
  );
END $$;

SELECT 'PASS: self-approval setting guards own claim and allows independent approver' AS result;
