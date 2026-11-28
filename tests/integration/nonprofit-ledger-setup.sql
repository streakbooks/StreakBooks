BEGIN;
INSERT INTO public.accounts(id,company_id,code,name,account_type) VALUES
  ('00000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000002','1999','Other tenant','asset');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',true);
DO $$
DECLARE
  c uuid := '20000000-0000-4000-8000-000000000001';
  v integer;
  other uuid := '00000000-0000-4000-8000-000000000099';
BEGIN
  v := public.nonprofit_save_ledger_setup(c,0,false,'configurable','CA','{}');
  PERFORM public.test_assert(v=1,'first setup acquired version one');
  PERFORM public.nonprofit_upsert_settings(c,'{"enforce_segregation":true,"allow_unrestricted_deficit":true,"gateway_configured":true}');
  BEGIN
    PERFORM public.nonprofit_save_ledger_setup(c,v,false,'configurable','AU','{}');
    RAISE EXCEPTION 'stale edit succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Nonprofit settings changed.%' THEN RAISE; END IF; END;
  SELECT version INTO STRICT v FROM public.nonprofit_settings WHERE company_id=c;
  PERFORM public.nonprofit_save_ledger_setup(c,v,false,'configurable','AU','{"bank":""}');
  PERFORM public.test_assert((SELECT enforce_segregation AND allow_unrestricted_deficit AND gateway_configured
    AND country_code='AU' FROM public.nonprofit_settings WHERE company_id=c),'unrelated ledger edit preserves policies');
  BEGIN
    PERFORM public.nonprofit_save_ledger_setup(c,v+1,false,'configurable','GB',jsonb_build_object('bank',other));
    RAISE EXCEPTION 'invalid mapping succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Choose active posting accounts%' THEN RAISE; END IF; END;
  PERFORM public.test_assert((SELECT version=v+1 FROM public.nonprofit_settings WHERE company_id=c),'invalid mapping preserved version');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004"}',true);
DO $$ BEGIN
  PERFORM public.nonprofit_save_ledger_setup('20000000-0000-4000-8000-000000000001',3,true,'configurable','US','{}');
  RAISE EXCEPTION 'cross-company save succeeded';
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'You do not have access%' THEN RAISE; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.audit_events WHERE action='nonprofit.settings.updated') <> 2 THEN
    RAISE EXCEPTION 'expected only the two successful setup changes to be audited';
  END IF;
END $$;
ROLLBACK;
