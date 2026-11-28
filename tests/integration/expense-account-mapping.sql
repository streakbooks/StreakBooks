INSERT INTO public.test_permissions(company_id, user_id, permission) VALUES
  ('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','expenses.manage_advances'),
  ('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','accounting.post'),
  ('10000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','expenses.manage_policies');

INSERT INTO public.companies(id, name, base_currency, timezone)
VALUES ('10000000-0000-4000-8000-000000000014','Expense Account Guard Fixture','GBP','UTC');

INSERT INTO public.accounts(id, company_id, code, account_type)
VALUES ('20000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000014','1410','asset');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
  _saved jsonb;
  _payload jsonb := jsonb_build_object(
    'version', 0,
    'enabled', true,
    'claim_number_prefix', 'EXP-',
    'default_distance_unit', 'km',
    'employee_advance_account_id', '20000000-0000-4000-8000-000000000040',
    'require_receipt_above_minor', 0,
    'require_spending_request_above_minor', 0,
    'allow_multi_currency_claims', true,
    'prevent_self_approval', true
  );
BEGIN
  _saved := public.save_expense_management_settings(
    '10000000-0000-4000-8000-000000000014', _payload
  );
  IF _saved->>'employee_advance_account_id' <> '20000000-0000-4000-8000-000000000040'
     OR (_saved->>'version')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST: valid same-company account mapping failed on first settings insert';
  END IF;

  _payload := jsonb_set(_payload, '{version}', '1'::jsonb);
  _payload := jsonb_set(_payload, '{employee_advance_account_id}',
    '"20000000-0000-4000-8000-000000000036"'::jsonb);
  BEGIN
    PERFORM public.save_expense_management_settings(
      '10000000-0000-4000-8000-000000000014', _payload
    );
    RAISE EXCEPTION 'TEST: cross-company account was accepted on first settings insert';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%owned by this organisation%' THEN RAISE; END IF;
  END;

  IF (SELECT version FROM public.expense_management_settings
      WHERE company_id = '10000000-0000-4000-8000-000000000014') <> 1 THEN
    RAISE EXCEPTION 'TEST: rejected account insert changed the settings row';
  END IF;
END $$;

INSERT INTO public.accounts(id, company_id, code, account_type)
VALUES
  ('20000000-0000-4000-8000-000000000028','10000000-0000-4000-8000-000000000011','1410','asset'),
  ('20000000-0000-4000-8000-000000000029','10000000-0000-4000-8000-000000000011','1420','asset'),
  ('20000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000011','2200','liability'),
  ('20000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000011','4100','income'),
  ('20000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000011','4200','income'),
  ('20000000-0000-4000-8000-000000000035','10000000-0000-4000-8000-000000000011','6100','expense'),
  ('20000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000011','1010','asset'),
  ('20000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000012','1410','asset'),
  ('20000000-0000-4000-8000-000000000036','10000000-0000-4000-8000-000000000012','1411','asset'),
  ('20000000-0000-4000-8000-000000000037','10000000-0000-4000-8000-000000000012','2200','liability'),
  ('20000000-0000-4000-8000-000000000038','10000000-0000-4000-8000-000000000012','4100','income'),
  ('20000000-0000-4000-8000-000000000039','10000000-0000-4000-8000-000000000012','6100','expense'),
  ('20000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000011','1411','liability');

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
    '"20000000-0000-4000-8000-000000000028"'::jsonb);
  _payload := jsonb_set(_payload, '{petty_cash_account_id}',
    '"20000000-0000-4000-8000-000000000029"'::jsonb);
  _payload := jsonb_set(_payload, '{employee_payable_account_id}',
    '"20000000-0000-4000-8000-000000000032"'::jsonb);
  _payload := jsonb_set(_payload, '{rebilling_income_account_id}',
    '"20000000-0000-4000-8000-000000000033"'::jsonb);
  _payload := jsonb_set(_payload, '{fx_gain_account_id}',
    '"20000000-0000-4000-8000-000000000034"'::jsonb);
  _payload := jsonb_set(_payload, '{fx_loss_account_id}',
    '"20000000-0000-4000-8000-000000000035"'::jsonb);
  PERFORM public.save_expense_management_settings(_settings.company_id, _payload);
END $$;

DO $$
DECLARE
  _settings public.expense_management_settings%ROWTYPE;
  _payload jsonb;
  _version integer;
  _mapping record;
BEGIN
  SELECT * INTO _settings FROM public.expense_management_settings
  WHERE company_id = '10000000-0000-4000-8000-000000000011';
  _version := _settings.version;
  FOR _mapping IN SELECT * FROM (VALUES
    ('employee_payable_account_id', '20000000-0000-4000-8000-000000000037'),
    ('employee_advance_account_id', '20000000-0000-4000-8000-000000000036'),
    ('petty_cash_account_id', '20000000-0000-4000-8000-000000000036'),
    ('rebilling_income_account_id', '20000000-0000-4000-8000-000000000038'),
    ('fx_gain_account_id', '20000000-0000-4000-8000-000000000038'),
    ('fx_loss_account_id', '20000000-0000-4000-8000-000000000039')
  ) AS foreign_mapping(field_name, account_id)
  LOOP
    _payload := jsonb_set(to_jsonb(_settings), ARRAY[_mapping.field_name],
      to_jsonb(_mapping.account_id), true);
    BEGIN
      PERFORM public.save_expense_management_settings(_settings.company_id, _payload);
      RAISE EXCEPTION 'TEST: cross-company % mapping was accepted', _mapping.field_name;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%owned by this organisation%' THEN RAISE; END IF;
    END;
  END LOOP;

  FOR _mapping IN SELECT * FROM (VALUES
    ('employee_payable_account_id', '20000000-0000-4000-8000-000000000028', 'liability account'),
    ('employee_advance_account_id', '20000000-0000-4000-8000-000000000031', 'asset account'),
    ('petty_cash_account_id', '20000000-0000-4000-8000-000000000031', 'asset account'),
    ('rebilling_income_account_id', '20000000-0000-4000-8000-000000000028', 'income account'),
    ('fx_gain_account_id', '20000000-0000-4000-8000-000000000035', 'income account'),
    ('fx_loss_account_id', '20000000-0000-4000-8000-000000000033', 'expense account')
  ) AS wrong_type_mapping(field_name, account_id, expected_type)
  LOOP
    _payload := jsonb_set(to_jsonb(_settings), ARRAY[_mapping.field_name],
      to_jsonb(_mapping.account_id), true);
    BEGIN
      PERFORM public.save_expense_management_settings(_settings.company_id, _payload);
      RAISE EXCEPTION 'TEST: wrong-type % mapping was accepted', _mapping.field_name;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%' || _mapping.expected_type || ' owned by this organisation%' THEN RAISE; END IF;
    END;
  END LOOP;

  IF (SELECT version FROM public.expense_management_settings
      WHERE company_id = '10000000-0000-4000-8000-000000000011') <> _version THEN
    RAISE EXCEPTION 'TEST: rejected account mappings changed the settings version';
  END IF;
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
         AND account_id = '20000000-0000-4000-8000-000000000028'
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
         AND account_id = '20000000-0000-4000-8000-000000000029'
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
