-- The new trigger was installed on a throwaway isolated PostgreSQL instance.
-- Verify first-row creation, number collisions, rollback, permissions and tenants.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

-- Explicit contact numbers are never replaced or used to advance the counter.
INSERT INTO public.contacts(company_id,name,kind,account_number) VALUES (
 '10000000-0000-4000-8000-000000000001','Numbering Manual','customer','C1002'
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.company_contact_settings
    WHERE company_id='10000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'Manual numbering unexpectedly created settings'; END IF;
END $$;

INSERT INTO public.contacts(company_id,name,kind) VALUES
 ('10000000-0000-4000-8000-000000000001','Numbering First','customer'),
 ('10000000-0000-4000-8000-000000000001','Numbering Second','supplier');

DO $$
BEGIN
  IF (SELECT account_number FROM public.contacts WHERE name='Numbering First') <> 'C1001'
     OR (SELECT account_number FROM public.contacts WHERE name='Numbering Second') <> 'C1003'
     OR (SELECT next_account_number FROM public.company_contact_settings
         WHERE company_id='10000000-0000-4000-8000-000000000001') <> 1004 THEN
    RAISE EXCEPTION 'The allocator did not skip a manually occupied number';
  END IF;
END $$;

-- A sales.draft user may create a contact but cannot directly rewrite numbering.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002"}', false);
INSERT INTO public.contacts(company_id,name,kind) VALUES (
 '10000000-0000-4000-8000-000000000001','Numbering Sales Draft','customer'
);
DO $$
BEGIN
  IF (SELECT account_number FROM public.contacts WHERE name='Numbering Sales Draft') <> 'C1004'
  THEN RAISE EXCEPTION 'Sales draft contact creation lost its number'; END IF;
  UPDATE public.company_contact_settings SET next_account_number=500
  WHERE company_id='10000000-0000-4000-8000-000000000001';
  IF (SELECT next_account_number FROM public.company_contact_settings
      WHERE company_id='10000000-0000-4000-8000-000000000001') <> 1005 THEN
    RAISE EXCEPTION 'Sales draft writer gained direct settings write access';
  END IF;
END $$;

-- Explicit tenant isolation applies even inside SECURITY DEFINER triggers.
-- The preceding salesperson has B access from the shared workflow fixture.
-- Switch to the A-only actor before asserting that company B is forbidden.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);
DO $$
DECLARE
  other_company uuid := '10000000-0000-4000-8000-000000000002';
BEGIN
  BEGIN
    INSERT INTO public.contacts(company_id,name,kind)
    VALUES (other_company,'Numbering Cross Tenant','customer');
    RAISE EXCEPTION 'Cross-tenant insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.contacts WHERE name='Numbering Cross Tenant') THEN
    RAISE EXCEPTION 'Cross-tenant contact was inserted';
  END IF;
END $$;

-- The counter and inserted contact must both roll back if creation fails.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001"}', false);
DO $$
DECLARE
  before_next integer;
BEGIN
  SELECT next_account_number INTO before_next FROM public.company_contact_settings
  WHERE company_id='10000000-0000-4000-8000-000000000001';
  BEGIN
    INSERT INTO public.contacts(company_id,name,kind) VALUES (
      '10000000-0000-4000-8000-000000000001','Numbering Forced Rollback','customer'
    );
    RAISE EXCEPTION 'Injected failure was not raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Injected contact insertion failure' THEN RAISE; END IF;
  END;
  IF (SELECT next_account_number FROM public.company_contact_settings
      WHERE company_id='10000000-0000-4000-8000-000000000001') <> before_next THEN
    RAISE EXCEPTION 'Counter increment did not roll back with failed insert';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contacts WHERE name='Numbering Forced Rollback') THEN
    RAISE EXCEPTION 'Failed contact insert was not rolled back';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon',
      'private.assign_contact_account_number_before_insert()','EXECUTE')
     OR has_function_privilege('authenticated',
      'private.assign_contact_account_number_before_insert()','EXECUTE') THEN
    RAISE EXCEPTION 'Trigger helper is exposed as callable function';
  END IF;
END $$;
SELECT 'PASS: atomic contact numbering, explicit numbers, collisions, rollback, role and tenant checks' AS result;
