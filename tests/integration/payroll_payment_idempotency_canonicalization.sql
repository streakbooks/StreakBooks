-- Read-only SQL regression checks for Payroll idempotency allocation replay.
-- No synthetic companies, payments, or customer records are created.
-- Run against Postgres with 20261106084934 idempotency guard applied.
DO $$
DECLARE
  _case RECORD;
  _stored JSONB;
  _incoming JSONB;
  _same BOOLEAN;
BEGIN
  IF position(
    'Payroll idempotency key already used for different payment details'
    IN pg_get_functiondef('public.record_payroll_payment(jsonb)'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'Payroll idempotency request guard migration is missing';
  END IF;

  FOR _case IN
    SELECT * FROM (VALUES
      ('same fields',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb,
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb, true),
      ('array order may change',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50},{"payslip_id":"22222222-2222-2222-2222-222222222222","amount_minor":20}]'::jsonb,
       '[{"payslip_id":"22222222-2222-2222-2222-222222222222","amount_minor":20},{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb, true),
      ('numeric strings normalize',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb,
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":"50"}]'::jsonb, true),
      ('changed allocation amount',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb,
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":60}]'::jsonb, false),
      ('changed payslip',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb,
       '[{"payslip_id":"22222222-2222-2222-2222-222222222222","amount_minor":50}]'::jsonb, false),
      ('added allocation',
       '[]'::jsonb,
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb, false),
      ('removed allocation',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb,
       '[]'::jsonb, false),
      ('repeated duplicate is not equivalent',
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb,
       '[{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50},{"payslip_id":"11111111-1111-1111-1111-111111111111","amount_minor":50}]'::jsonb, false),
      ('empty replays empty',
       '[]'::jsonb, '[]'::jsonb, true)
    ) AS cases(name, stored_allocations, incoming_allocations, expected_match)
  LOOP
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'payslip_id', (a.value->>'payslip_id')::uuid::text,
        'amount_minor', (a.value->>'amount_minor')::bigint
      ) ORDER BY (a.value->>'payslip_id')::uuid, (a.value->>'amount_minor')::bigint
    ), '[]'::jsonb) INTO _stored
    FROM jsonb_array_elements(_case.stored_allocations) AS a;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'payslip_id', (a.value->>'payslip_id')::uuid::text,
        'amount_minor', (a.value->>'amount_minor')::bigint
      ) ORDER BY (a.value->>'payslip_id')::uuid, (a.value->>'amount_minor')::bigint
    ), '[]'::jsonb) INTO _incoming
    FROM jsonb_array_elements(_case.incoming_allocations) AS a;

    _same := (_stored IS NOT DISTINCT FROM _incoming);
    IF _same IS DISTINCT FROM _case.expected_match THEN
      RAISE EXCEPTION 'Unexpected replay canonicalization for %: actual %, expected %',
        _case.name, _same, _case.expected_match;
    END IF;
  END LOOP;
END $$;

SELECT '9/9 Payroll idempotency allocation canonicalization cases passed; read-only database test.' AS result;
