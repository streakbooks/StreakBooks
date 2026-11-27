INSERT INTO public.test_permissions(company_id, user_id, permission) VALUES
  ('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','expenses.manage_advances'),
  ('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','accounting.post');

INSERT INTO public.accounts(id, company_id, code, account_type)
VALUES
  ('20000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000011','1410','asset'),
  ('20000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000011','1420','asset'),
  ('20000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000011','1010','asset');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  _settings public.expense_management_settings%ROWTYPE;
  _payload jsonb;
BEGIN
  SELECT * INTO _settings FROM public.expense_management_settings
  WHERE company_id = '10000000-0000-4000-8000-000000000011';
  _payload := to_jsonb(_settings);
  _payload := jsonb_set(_payload, '{employee_advance_account_id}',
    '"20000000-0000-4000-8000-000000000021"'::jsonb);
  _payload := jsonb_set(_payload, '{petty_cash_account_id}',
    '"20000000-0000-4000-8000-000000000022"'::jsonb);
  PERFORM public.save_expense_management_settings(_settings.company_id, _payload);
END $$;

INSERT INTO public.expense_cash_advances (
  id, company_id, advance_number, title, employee_user_id, advance_date,
  currency_code, amount_minor, remaining_minor, status
) VALUES (
  '40000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000011', 'ADV-TEST-1', 'Travel advance',
  '00000000-0000-4000-8000-000000000003', current_date, 'GBP', 25000, 25000, 'draft'
);

INSERT INTO public.expense_petty_cash_floats (
  id, company_id, float_number, name, custodian_user_id, currency_code,
  target_minor, status
) VALUES (
  '40000000-0000-4000-8000-000000000032',
  '10000000-0000-4000-8000-000000000011', 'PC-TEST-1', 'Office petty cash',
  '00000000-0000-4000-8000-000000000003', 'GBP', 50000, 'active'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  _advance jsonb;
  _float jsonb;
  _advance_journal uuid;
  _float_journal uuid;
BEGIN
  _advance := public.issue_expense_cash_advance(
    '10000000-0000-4000-8000-000000000011',
    '40000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000023', 1, current_date
  );
  _advance_journal := (_advance->>'issue_journal_id')::uuid;
  IF _advance->>'status' <> 'issued'
     OR _advance_journal IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.journal_lines
       WHERE journal_id = _advance_journal
         AND account_id = '20000000-0000-4000-8000-000000000021'
         AND debit_minor = 25000 AND credit_minor = 0
     ) OR NOT EXISTS (
       SELECT 1 FROM public.journal_lines
       WHERE journal_id = _advance_journal
         AND account_id = '20000000-0000-4000-8000-000000000023'
         AND debit_minor = 0 AND credit_minor = 25000
     ) OR (
       SELECT COALESCE(sum(debit_minor - credit_minor), 1)
       FROM public.journal_lines WHERE journal_id = _advance_journal
     ) <> 0 THEN
    RAISE EXCEPTION 'TEST: configured employee advance account did not reach a balanced issue journal';
  END IF;

  _float := public.fund_expense_petty_cash_float(
    '10000000-0000-4000-8000-000000000011',
    '40000000-0000-4000-8000-000000000032',
    '20000000-0000-4000-8000-000000000023', 30000, 1, current_date
  );
  _float_journal := (
    SELECT id FROM public.journals
    WHERE company_id = '10000000-0000-4000-8000-000000000011'
      AND source_id = '40000000-0000-4000-8000-000000000032'
      AND idempotency_key LIKE 'expense_petty_cash:%:fund:%'
  );
  IF _float->>'balance_minor' <> '30000'
     OR _float_journal IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.journal_lines
       WHERE journal_id = _float_journal
         AND account_id = '20000000-0000-4000-8000-000000000022'
         AND debit_minor = 30000 AND credit_minor = 0
     ) OR NOT EXISTS (
       SELECT 1 FROM public.journal_lines
       WHERE journal_id = _float_journal
         AND account_id = '20000000-0000-4000-8000-000000000023'
         AND debit_minor = 0 AND credit_minor = 30000
     ) OR (
       SELECT COALESCE(sum(debit_minor - credit_minor), 1)
       FROM public.journal_lines WHERE journal_id = _float_journal
     ) <> 0 THEN
    RAISE EXCEPTION 'TEST: configured petty cash account did not reach a balanced funding journal';
  END IF;
END $$;

SELECT 'PASS: configured employee advance and petty cash accounts reach balanced production journals' AS result;
