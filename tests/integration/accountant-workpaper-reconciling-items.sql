-- Read/write tests against throwaway PostgreSQL: no company financial records are modified.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.company','10000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.post','yes',false);
SELECT set_config('test.mfa','yes',false);

DO $$
DECLARE
  company uuid := '10000000-0000-4000-8000-000000000001';
  parent uuid := '20000000-0000-4000-8000-000000000001';
  other_parent uuid := '20000000-0000-4000-8000-000000000002';
  entry jsonb;
BEGIN
  entry := public.save_account_workpaper_reconciling_item(
    company, parent,
    jsonb_build_object('action','add','description','Uncleared statement adjustment',
      'amountMinor','-1200','evidenceReference','BANK-2026-10')
  );
  IF entry->>'state' <> 'open' OR (entry->>'version')::integer <> 1 THEN
    RAISE EXCEPTION 'First reconciling issue not created';
  END IF;
  BEGIN
    PERFORM public.save_account_workpaper_reconciling_item(
      company, parent,
      jsonb_build_object('action','resolve','id',entry->>'id',
        'version',9,'reason','Verified later statement')
    );
    RAISE EXCEPTION 'Stale reconciling item edit unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;

  BEGIN
    PERFORM public.save_account_workpaper_reconciling_item(
      company, other_parent,
      jsonb_build_object('action','add','description','Cross-tenant attempt','amountMinor','100')
    );
    RAISE EXCEPTION 'Cross-tenant item mutation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.account_workpaper_reconciling_items;
    RAISE EXCEPTION 'Client direct delete unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF (SELECT count(*) FROM public.account_workpaper_reconciling_items WHERE
      company_id = company AND workpaper_id = parent) <> 1 THEN
    RAISE EXCEPTION 'Reconciling item not saved to correct company and parent';
  END IF;
END $$;
RESET ROLE;

-- Even a direct owner UPDATE of parent status is checked for unresolved items.
DO $$
BEGIN
  BEGIN
    UPDATE public.account_workpapers SET status='prepared'
      WHERE id='20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Unresolved items failed to block sign-off';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%Resolve every open reconciling item%' THEN
      RAISE;
    END IF;
  END;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.company','10000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.post','yes',false);
SELECT set_config('test.mfa','yes',false);
DO $$
DECLARE
  company uuid := '10000000-0000-4000-8000-000000000001';
  parent uuid := '20000000-0000-4000-8000-000000000001';
  item uuid;
  result jsonb;
BEGIN
  SELECT id INTO item FROM public.account_workpaper_reconciling_items
    WHERE company_id=company AND workpaper_id=parent;
  result := public.save_account_workpaper_reconciling_item(
    company, parent,
    jsonb_build_object('action','resolve','id',item,'version',1,
      'reason','Corrected and matched to statement')
  );
  IF result->>'state' <> 'resolved' OR (result->>'version')::int <> 2 THEN
    RAISE EXCEPTION 'Resolution not recorded';
  END IF;
  result := public.save_account_workpaper_reconciling_item(
    company, parent,
    jsonb_build_object('action','reopen','id',item,'version',2,
      'reason','New evidence requires reopening')
  );
  IF result->>'state' <> 'open' OR (result->>'version')::int <> 3 THEN
    RAISE EXCEPTION 'Issue reopening did not work';
  END IF;
  result := public.save_account_workpaper_reconciling_item(
    company, parent,
    jsonb_build_object('action','resolve','id',item,'version',3,
      'reason','Second review resolved evidence')
  );
  IF result->>'state' <> 'resolved' OR (result->>'version')::int <> 4 THEN
    RAISE EXCEPTION 'Re-resolution did not work';
  END IF;
  IF (SELECT count(*) FROM public.account_workpaper_reconciling_item_events
      WHERE company_id=company AND item_id=item) <> 4 THEN
    RAISE EXCEPTION 'Immutable event trail incomplete';
  END IF;
  IF (SELECT count(*) FROM public.test_audit_events
      WHERE company_id=company) <> 4 THEN
    RAISE EXCEPTION 'Accounting audit events incomplete';
  END IF;
  IF (SELECT version FROM public.account_workpapers WHERE id=parent) <> 5 THEN
    RAISE EXCEPTION 'Parent version not invalidated after evidence changes';
  END IF;
  PERFORM set_config('test.company','10000000-0000-4000-8000-000000000002',false);
  IF (SELECT count(*) FROM public.account_workpaper_reconciling_items) <> 0
     OR (SELECT count(*) FROM public.account_workpaper_reconciling_item_events) <> 0 THEN
    RAISE EXCEPTION 'Cross-tenant RLS revealed another workpaper';
  END IF;
  PERFORM set_config('test.company',company::text,false);
END $$;
RESET ROLE;

UPDATE public.account_workpapers SET status='prepared'
  WHERE id='20000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.company','10000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.post','yes',false);
SELECT set_config('test.mfa','yes',false);
DO $$
DECLARE
  company uuid := '10000000-0000-4000-8000-000000000001';
  parent uuid := '20000000-0000-4000-8000-000000000001';
BEGIN
  BEGIN
    PERFORM public.save_account_workpaper_reconciling_item(
      company,parent,
      jsonb_build_object('action','add','description','After approval','amountMinor','100')
    );
    RAISE EXCEPTION 'Signed-off workpaper was edited';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%Reopen the signed-off workpaper%' THEN
      RAISE;
    END IF;
  END;
  PERFORM set_config('test.post','no',false);
  BEGIN
    PERFORM public.save_account_workpaper_reconciling_item(
      company,parent,
      jsonb_build_object('action','add','description','No posting permission','amountMinor','100')
    );
    RAISE EXCEPTION 'Accounting.post permission bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('test.post','yes',false);
  PERFORM set_config('test.mfa','no',false);
  BEGIN
    PERFORM public.save_account_workpaper_reconciling_item(
      company,parent,
      jsonb_build_object('action','add','description','No MFA','amountMinor','100')
    );
    RAISE EXCEPTION 'MFA permission bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'Accountant reconciling item PostgreSQL security, tenant and sign-off checks passed';
