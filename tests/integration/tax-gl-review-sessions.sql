-- Execute after baseline and 20261106134000_tax_gl_review_sessions.sql.
CREATE FUNCTION public.assert_tax_review_error(_statement text, _expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _statement;
  RAISE EXCEPTION 'ASSERT: expected error but operation succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ILIKE 'ASSERT:%' OR SQLERRM NOT ILIKE _expected THEN
    RAISE;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.assert_tax_review_error(text,text) TO authenticated;

-- Fault injection proves session edits and event history roll back atomically.
CREATE FUNCTION public.test_tax_review_audit_failure() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_tax_review_audit',true)='on' THEN
    RAISE EXCEPTION 'Injected tax review audit failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_tax_review_audit_failure
  BEFORE INSERT ON public.tax_gl_review_events
  FOR EACH ROW EXECUTE FUNCTION public.test_tax_review_audit_failure();

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000001"}', false);

DO $$
DECLARE
 a uuid := '10000000-0000-4000-8000-000000000001';
 o uuid := '20000000-0000-4000-8000-000000000001';
 i uuid := '20000000-0000-4000-8000-000000000002';
 id uuid;
 newv int;
BEGIN
 SELECT review_id,new_version INTO id,newv FROM public.save_tax_gl_review(
   a,'2026-01-01','2026-03-31','accrual',o,i,'open',
   'Need to investigate tax difference',NULL,'snapshot-1',NULL
 );
 IF newv <> 1 OR (SELECT count(*) FROM public.tax_gl_review_events WHERE review_id=id)<>1 THEN
   RAISE EXCEPTION 'Initial review or event missing';
 END IF;

 SELECT review_id,new_version INTO id,newv FROM public.save_tax_gl_review(
   a,'2026-01-01','2026-03-31','accrual',o,i,'in_review',
   'Reconciled invoice and bill accounts',
   '00000000-0000-4000-8000-000000000003','snapshot-1',1
 );
 IF newv<>2 OR (SELECT count(*) FROM public.tax_gl_review_events WHERE review_id=id)<>2 THEN
   RAISE EXCEPTION 'Version or audit event mismatch';
 END IF;

 PERFORM public.assert_tax_review_error(format(
  'SELECT public.save_tax_gl_review(%L,%L,%L,%L,%L,%L,%L,%L,NULL,%L,1)',
  a,'2026-01-01','2026-03-31','accrual',o,i,'resolved',
  'Investigated and documented','snapshot-1'
 ),'%changed in another session%');

 PERFORM public.assert_tax_review_error(format(
  'SELECT public.save_tax_gl_review(%L,%L,%L,%L,%L,%L,%L,%L,NULL,%L,2)',
  a,'2026-01-01','2026-03-31','cash',o,i,'resolved',
  'Reviewed with documented difference','snapshot-2'
 ),'%Resolving requires accrual%');

 PERFORM public.assert_tax_review_error(format(
  'SELECT public.save_tax_gl_review(%L,%L,%L,%L,%L,%L,%L,%L,NULL,%L,NULL)',
  a,'2026-01-01','2026-03-31','accrual',o,
  '20000000-0000-4000-8000-000000000003','open',
  'Cross tenant input account','snapshot-2'
 ),'%must belong%');

 -- An audit insert failure must not leave a partial updated review.
 PERFORM set_config('test.fail_tax_review_audit','on',true);
 PERFORM public.assert_tax_review_error(format(
  'SELECT public.save_tax_gl_review(%L,%L,%L,%L,%L,%L,%L,%L,NULL,%L,2)',
  a,'2026-01-01','2026-03-31','accrual',o,i,'in_review',
  'This update must be rolled back','snapshot-1'
 ),'%Injected tax review audit failure%');
 PERFORM set_config('test.fail_tax_review_audit','off',true);
 IF (SELECT version FROM public.tax_gl_review_sessions WHERE company_id=a AND basis='accrual') <> 2 THEN
   RAISE EXCEPTION 'Review version advanced after audit failure';
 END IF;
 IF (SELECT count(*) FROM public.tax_gl_review_events
     WHERE company_id=a)<>2 THEN
   RAISE EXCEPTION 'Audit failure left an orphan event';
 END IF;

 SELECT review_id,new_version INTO id,newv FROM public.save_tax_gl_review(
   a,'2026-01-01','2026-03-31','accrual',o,i,'resolved',
   'Difference has been investigated and documented',
   '00000000-0000-4000-8000-000000000003','snapshot-1',2
 );
 IF newv <> 3 THEN RAISE EXCEPTION 'Resolving valid review failed'; END IF;

 PERFORM public.assert_tax_review_error(format(
  'SELECT public.save_tax_gl_review(%L,%L,%L,%L,%L,%L,%L,%L,NULL,%L,3)',
  a,'2026-01-01','2026-03-31','accrual',o,i,'resolved',
  'Keep old resolution without reopening','snapshot-new'
 ),'%Reopen the changed review%');

 PERFORM public.assert_tax_review_error(
   'UPDATE public.tax_gl_review_events SET new_status=''resolved''',
   '%permission denied%');
 PERFORM public.assert_tax_review_error(
   'UPDATE public.tax_gl_review_sessions SET status=''open''',
   '%permission denied%');

 IF (SELECT count(*) FROM public.tax_gl_review_events WHERE review_id=id)<>3 THEN
   RAISE EXCEPTION 'Rejected review attempts changed audit history';
 END IF;
END $$;

-- A valid other-company user cannot alter A's review.
SELECT set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000002"}', false);
SELECT public.assert_tax_review_error(
 $$SELECT public.save_tax_gl_review(
 '10000000-0000-4000-8000-000000000001','2026-01-01','2026-03-31',
 'accrual','20000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000002',
 'open','Cross company change attempt',NULL,'snapshot-1',3)$$,
 '%Not authorised%');

-- Tenant B can create and read only its own review, never tenant A's.
DO $$
DECLARE
  b uuid := '10000000-0000-4000-8000-000000000002';
  id uuid;
BEGIN
  SELECT review_id INTO id FROM public.save_tax_gl_review(
    b, '2026-01-01', '2026-03-31', 'accrual',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    'in_review', 'Tenant B tax review', NULL, 'snapshot-B', NULL
  );
  IF id IS NULL THEN RAISE EXCEPTION 'Tenant B review not created'; END IF;
  IF (SELECT count(*) FROM public.tax_gl_review_sessions)<>1 THEN
    RAISE EXCEPTION 'Tenant B can read a cross-company review';
  END IF;
  IF (SELECT count(*) FROM public.tax_gl_review_events)<>1 THEN
    RAISE EXCEPTION 'Tenant B can read another company audit history';
  END IF;
END $$;

-- A view-only accountant can see the own company review but not mutate it.
SELECT set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-8000-000000000003"}', false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.tax_gl_review_sessions)<>1 THEN
    RAISE EXCEPTION 'Accountant with accounting.view cannot read own-company review';
  END IF;
  IF (SELECT count(*) FROM public.tax_gl_review_events)<>3 THEN
    RAISE EXCEPTION 'Accountant cannot read own-company review audit events';
  END IF;
END $$;
SELECT public.assert_tax_review_error(
 $$SELECT public.save_tax_gl_review(
 '10000000-0000-4000-8000-000000000001','2026-01-01','2026-03-31',
 'accrual','20000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000002',
 'open','View only write attempt',NULL,'snapshot-1',3)$$,
 '%Not authorised%');

RESET ROLE;
DO $$
BEGIN
 IF has_function_privilege('anon',
  'public.save_tax_gl_review(uuid,date,date,text,uuid,uuid,text,text,uuid,text,integer)',
  'EXECUTE') THEN RAISE EXCEPTION 'Anonymous review RPC access enabled'; END IF;
END $$;
