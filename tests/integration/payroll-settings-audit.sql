SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

INSERT INTO public.payroll_settings (
  company_id, enabled, payroll_currency, rounding_mode, payslip_footer_note
) VALUES (
  '10000000-0000-4000-8000-000000000011', true, 'INR', 'half_up', 'private employee notice'
);

DO $$
DECLARE
  _audit public.audit_events%ROWTYPE;
  _count integer;
  _company_id uuid := '10000000-0000-4000-8000-000000000011';
BEGIN
  SELECT * INTO _audit FROM public.audit_events
   WHERE company_id = _company_id AND action = 'settings.payroll.configuration'
     AND details->'after'->>'rounding_mode' = 'half_up'
   LIMIT 1;
  IF _audit.id IS NULL
     OR _audit.details->'before' <> '{}'::jsonb
     OR _audit.details->'after'->>'rounding_mode' <> 'half_up'
     OR _audit.details->'after'->>'payslip_footer_note' <> '[redacted]'
     OR _audit.details::text LIKE '%private employee notice%' THEN
    RAISE EXCEPTION 'Payroll settings insert omitted field-level audit evidence or exposed note text';
  END IF;

  UPDATE public.payroll_settings
  SET rounding_mode = 'half_even', payslip_footer_note = 'another private employee notice', version = 2
  WHERE company_id = _company_id;
  SELECT * INTO _audit FROM public.audit_events
   WHERE company_id = _company_id AND action = 'settings.payroll.configuration'
     AND details->'after'->>'rounding_mode' = 'half_even'
   LIMIT 1;
  IF _audit.details->'before'->>'rounding_mode' <> 'half_up'
     OR _audit.details->'after'->>'rounding_mode' <> 'half_even'
     OR _audit.details->'before'->>'payslip_footer_note' <> '[redacted]'
     OR _audit.details->'after'->>'payslip_footer_note' <> '[redacted]'
     OR _audit.details::text LIKE '%another private employee notice%' THEN
    RAISE EXCEPTION 'Payroll settings update omitted values or exposed note text';
  END IF;

  SELECT count(*) INTO _count FROM public.audit_events
   WHERE company_id = _company_id AND action = 'settings.payroll.configuration';
  UPDATE public.payroll_settings SET version = version + 1 WHERE company_id = _company_id;
  IF (SELECT count(*) FROM public.audit_events
      WHERE company_id = _company_id AND action = 'settings.payroll.configuration') <> _count THEN
    RAISE EXCEPTION 'Payroll settings no-op configuration update created audit noise';
  END IF;

  PERFORM set_config('test.fail_audit', 'on', true);
  BEGIN
    UPDATE public.payroll_settings SET payroll_currency = 'USD' WHERE company_id = _company_id;
    RAISE EXCEPTION 'Injected payroll audit failure was ignored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%Injected audit failure%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.fail_audit', 'off', true);

  IF (SELECT payroll_currency FROM public.payroll_settings WHERE company_id = _company_id) <> 'INR'
     OR (SELECT count(*) FROM public.audit_events
         WHERE company_id = _company_id AND action = 'settings.payroll.configuration') <> _count THEN
    RAISE EXCEPTION 'Payroll settings audit failure did not roll back the settings write';
  END IF;
END $$;

SELECT 'PASS: payroll settings field audit, note redaction, no-op and rollback' AS result;

SELECT set_config('request.jwt.claims', '{}', false);
INSERT INTO public.payroll_settings (company_id, payroll_currency)
VALUES ('10000000-0000-4000-8000-000000000013', 'USD');
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE company_id = '10000000-0000-4000-8000-000000000013'
      AND action = 'settings.payroll.configuration'
  ) THEN
    RAISE EXCEPTION 'Unauthenticated payroll service maintenance was attributed as a user change';
  END IF;
END $$;
SELECT 'PASS: unauthenticated payroll maintenance is not attributed to a user' AS result;
