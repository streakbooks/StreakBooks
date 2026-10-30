-- Test new import RPC with an isolated PostgreSQL database (not production).
\set ON_ERROR_STOP on
DO $$
BEGIN
 IF has_function_privilege('anon','public.import_fixed_asset_register(uuid,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Anonymous can execute privileged asset import RPC';
 END IF;
 IF NOT has_function_privilege('authenticated','public.import_fixed_asset_register(uuid,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Authenticated cannot execute privileged asset import RPC';
 END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  _id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  _source jsonb := '[{"external_code":"LEGACY-1","payload":{"name":"Laptop","cost_minor":100000}},
     {"external_code":"LEGACY-2","payload":{"name":"Printer","cost_minor":200000}}]'::jsonb;
  _result jsonb;
  _n integer;
BEGIN
  _result := public.import_fixed_asset_register(_id, _source);
  IF (_result->>'created')::int<>2 OR (_result->>'skipped')::int<>0 THEN
    RAISE EXCEPTION 'Initial batch result is incorrect: %', _result;
  END IF;
  SELECT count(*) INTO _n FROM public.fixed_asset_import_refs WHERE company_id=_id;
  IF _n<>2 THEN RAISE EXCEPTION 'Two references not persisted'; END IF;

  _result := public.import_fixed_asset_register(_id, _source);
  IF (_result->>'created')::int<>0 OR (_result->>'skipped')::int<>2 THEN
    RAISE EXCEPTION 'Exact retry did not skip records: %', _result;
  END IF;

  -- Idempotency also requires recognising a case-only external reference.
  _result := public.import_fixed_asset_register(_id,
    '[{"external_code":"legacy-1","payload":{"name":"Laptop","cost_minor":100000}}]'::jsonb);
  IF (_result->>'skipped')::int<>1 THEN RAISE EXCEPTION 'Case-only duplicate not recognised'; END IF;

  -- Existing external code with different value MUST fail without changing assets.
  BEGIN
    PERFORM public.import_fixed_asset_register(_id,
      '[{"external_code":"LEGACY-1","payload":{"name":"Different","cost_minor":100000}}]'::jsonb);
    RAISE EXCEPTION 'BAD: conflicting reimport accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%different values%' THEN RAISE; END IF;
  END;

  -- If second domain writer fails, earlier successful assets in same batch must rollback.
  BEGIN
    PERFORM public.import_fixed_asset_register(_id,
      '[{"external_code":"NEW-3","payload":{"name":"Monitor","cost_minor":30000}},
        {"external_code":"NEW-4","payload":{"name":"FORCE_FAILURE","cost_minor":30000}}]'::jsonb);
    RAISE EXCEPTION 'BAD: domain failure was not rolled back';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Simulated domain writer failure%' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO _n FROM public.fixed_assets WHERE company_id=_id;
  IF _n<>2 THEN RAISE EXCEPTION 'Failed batch partially inserted assets: %', _n; END IF;
  SELECT count(*) INTO _n FROM public.fixed_asset_import_refs WHERE company_id=_id;
  IF _n<>2 THEN RAISE EXCEPTION 'Failed batch partially inserted references: %', _n; END IF;

  -- Scope never trusts the requested company id.
  BEGIN
    PERFORM public.import_fixed_asset_register('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '[{"external_code":"CROSS-1","payload":{"name":"Other company","cost_minor":100}}]'::jsonb);
    RAISE EXCEPTION 'BAD: cross-tenant import accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%No permission%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
BEGIN
  -- A valid member without accounts.manage must be denied by server AND RPC.
  BEGIN
    PERFORM public.import_fixed_asset_register('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '[{"external_code":"DENIED-1","payload":{"name":"No Permission","cost_minor":100}}]'::jsonb);
    RAISE EXCEPTION 'BAD: user without accounts.manage imported assets';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%No permission%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.import_fixed_asset_register('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','[]'::jsonb);
    RAISE EXCEPTION 'BAD: anonymous imported assets';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
ROLLBACK;
