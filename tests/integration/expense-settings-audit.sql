SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

INSERT INTO public.expense_management_settings (
  company_id, enabled, claim_number_prefix, require_receipt_above_minor,
  require_spending_request_above_minor, default_distance_unit,
  approval_escalation_days, required_approval_count
) VALUES (
  '10000000-0000-4000-8000-000000000011', true, 'CLAIM-', 5000, 7500, 'km', 5, 1
);

DO $$
DECLARE
  audit_row public.audit_events%ROWTYPE;
  audit_count integer;
  _insert_audit_id uuid;
  _company_id uuid := '10000000-0000-4000-8000-000000000011';
BEGIN
  SELECT * INTO audit_row FROM public.audit_events AS ae
   WHERE ae.company_id = _company_id AND ae.action = 'settings.expense_management'
   ORDER BY id DESC LIMIT 1;
  IF audit_row.id IS NULL
     OR audit_row.details->'before' <> '{}'::jsonb
     OR audit_row.details->'after'->>'claim_number_prefix' <> 'CLAIM-'
     OR audit_row.details->'after'->>'require_receipt_above_minor' <> '5000'
     OR audit_row.details->'after'->>'require_spending_request_above_minor' <> '7500' THEN
    RAISE EXCEPTION 'Expense settings insert omitted field-level audit evidence';
  END IF;
  _insert_audit_id := audit_row.id;

  UPDATE public.expense_management_settings
  SET default_distance_unit = 'mi', default_claim_currency = 'USD', required_approval_count = 2,
      require_receipt_above_minor = 6000,
      require_spending_request_above_minor = 8000
  WHERE expense_management_settings.company_id = _company_id;

  SELECT * INTO audit_row FROM public.audit_events AS ae
   WHERE ae.company_id = _company_id
     AND ae.action = 'settings.expense_management'
     AND ae.id <> _insert_audit_id
   ORDER BY id DESC LIMIT 1;
  IF audit_row.details->'before'->>'default_distance_unit' <> 'km'
     OR audit_row.details->'after'->>'default_distance_unit' <> 'mi'
     OR audit_row.details->'before'->'default_claim_currency' IS DISTINCT FROM 'null'::jsonb
     OR audit_row.details->'after'->>'default_claim_currency' <> 'USD'
     OR audit_row.details->'before'->>'required_approval_count' <> '1'
     OR audit_row.details->'after'->>'required_approval_count' <> '2'
     OR audit_row.details->'before'->>'require_receipt_above_minor' <> '5000'
     OR audit_row.details->'after'->>'require_receipt_above_minor' <> '6000'
     OR audit_row.details->'before'->>'require_spending_request_above_minor' <> '7500'
     OR audit_row.details->'after'->>'require_spending_request_above_minor' <> '8000' THEN
    RAISE EXCEPTION 'Expense settings update omitted exact before/after values';
  END IF;

  SELECT count(*) INTO audit_count FROM public.audit_events AS ae
   WHERE ae.company_id = _company_id AND ae.action = 'settings.expense_management';

  UPDATE public.expense_management_settings
  SET default_distance_unit = 'mi'
  WHERE expense_management_settings.company_id = _company_id;
  IF (SELECT count(*) FROM public.audit_events AS ae
      WHERE ae.company_id = _company_id AND ae.action = 'settings.expense_management') <> audit_count THEN
    RAISE EXCEPTION 'A no-op expense settings update created audit noise';
  END IF;

  PERFORM set_config('test.fail_audit', 'on', true);
  BEGIN
    UPDATE public.expense_management_settings
    SET claim_number_prefix = 'ROLLBACK-'
      WHERE expense_management_settings.company_id = _company_id;
    RAISE EXCEPTION 'Injected expense settings audit failure was ignored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit', 'off', true);

  IF (SELECT claim_number_prefix FROM public.expense_management_settings
      WHERE expense_management_settings.company_id = _company_id) <> 'CLAIM-'
     OR (SELECT count(*) FROM public.audit_events
         WHERE audit_events.company_id = _company_id
           AND action = 'settings.expense_management') <> audit_count THEN
    RAISE EXCEPTION 'Expense settings audit failure did not roll back the write';
  END IF;
END $$;

SELECT 'PASS: expense settings insert/update before-after audit and audit-failure rollback' AS result;
