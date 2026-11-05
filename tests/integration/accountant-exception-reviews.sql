-- This file runs ONLY in an isolated throwaway PostgreSQL container.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.company','10000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.post','yes',false);
SELECT set_config('test.mfa','yes',false);

DO $$
DECLARE
  company uuid := '10000000-0000-4000-8000-000000000001';
  other_company uuid := '10000000-0000-4000-8000-000000000002';
  journal uuid := '20000000-0000-4000-8000-000000000001';
  other_journal uuid := '20000000-0000-4000-8000-000000000002';
  draft_journal uuid := '20000000-0000-4000-8000-000000000003';
  finding text := '20000000-0000-4000-8000-000000000001:missing_memo';
  result jsonb;
BEGIN
  result := public.save_accountant_journal_exception(
    company, journal, finding, 'investigate', 'Bank evidence reviewed', NULL
  );
  IF result->>'status' <> 'investigating' OR (result->>'version')::int <> 1 THEN
    RAISE EXCEPTION 'Initial journal investigation was not saved';
  END IF;

  BEGIN
    PERFORM public.save_accountant_journal_exception(
      company, other_journal, '20000000-0000-4000-8000-000000000002:missing_memo',
      'investigate', 'Wrong company', NULL
    );
    RAISE EXCEPTION 'Cross-company review unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.save_accountant_journal_exception(
      company, draft_journal, '20000000-0000-4000-8000-000000000003:missing_memo',
      'investigate', 'Wrong source', NULL
    );
    RAISE EXCEPTION 'Draft journal review unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.save_accountant_journal_exception(
      company, journal, finding, 'submit', 'Detailed finding', 5
    );
    RAISE EXCEPTION 'Stale version unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;

  result := public.save_accountant_journal_exception(
    company, journal, finding, 'submit', 'Evidence inspected; review requested', 1
  );
  IF result->>'status' <> 'ready_for_review' OR (result->>'version')::int <> 2 THEN
    RAISE EXCEPTION 'Submission did not prepare the review';
  END IF;

  BEGIN
    PERFORM public.save_accountant_journal_exception(
      company, journal, finding, 'approve', 'Approved', 2
    );
    RAISE EXCEPTION 'Self approval unexpectedly succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%Independent reviewer%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
  result := public.save_accountant_journal_exception(
    company, journal, finding, 'approve', 'Independent evidence verified', 2
  );
  IF result->>'status' <> 'reviewed' OR (result->>'version')::int <> 3 THEN
    RAISE EXCEPTION 'Independent review did not succeed';
  END IF;
  IF (SELECT count(*) FROM public.accountant_journal_exception_events
      WHERE company_id = company) <> 3
     OR (SELECT count(*) FROM public.test_audit_events
         WHERE company_id = company) <> 3 THEN
    RAISE EXCEPTION 'Required immutable history or accounting audit event missing';
  END IF;

  result := public.save_accountant_journal_exception(
    company, journal, finding, 'reopen', 'New supporting evidence arrived', 3
  );
  IF result->>'status' <> 'investigating' OR (result->>'version')::int <> 4 THEN
    RAISE EXCEPTION 'Reviewed exception could not be explicitly reopened';
  END IF;
  IF (SELECT prepared_by FROM public.accountant_journal_exception_reviews
      WHERE finding_key = finding) IS NOT NULL
     OR (SELECT reviewed_by FROM public.accountant_journal_exception_reviews
         WHERE finding_key = finding) IS NOT NULL THEN
    RAISE EXCEPTION 'Reopening retained stale sign-off';
  END IF;

  PERFORM set_config('test.company',other_company::text,false);
  IF (SELECT count(*) FROM public.accountant_journal_exception_reviews) <> 0
     OR (SELECT count(*) FROM public.accountant_journal_exception_events) <> 0 THEN
    RAISE EXCEPTION 'Tenant RLS leaked another company records';
  END IF;

  PERFORM set_config('test.company',company::text,false);
  PERFORM set_config('test.post','no',false);
  BEGIN
    PERFORM public.save_accountant_journal_exception(
      company, journal, finding, 'investigate', 'unauthorized', 4
    );
    RAISE EXCEPTION 'A user without accounting.post could write a review';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('test.post','yes',false);
  PERFORM set_config('test.mfa','no',false);
  BEGIN
    PERFORM public.save_accountant_journal_exception(
      company, journal, finding, 'investigate', 'no MFA', 4
    );
    RAISE EXCEPTION 'Missing MFA allowed a write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    DELETE FROM public.accountant_journal_exception_reviews;
    RAISE EXCEPTION 'Direct client mutation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SELECT 'Accountant exception PostgreSQL security and review workflow passed' AS verification;
