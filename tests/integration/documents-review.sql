-- Exercises the migration with real Postgres RLS, access claims and triggers.
BEGIN;
DO $$
DECLARE u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
        u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
        c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id) VALUES (u1),(u2),(u3),(u4);
  INSERT INTO public.companies(id) VALUES (c1),(c2);
  INSERT INTO public.test_permissions(company_id,user_id,permission) VALUES
    (c1,u1,'company.view'),(c1,u1,'sales.draft'),(c1,u1,'purchases.authorise'),
    (c2,u2,'company.view'),(c2,u2,'sales.draft'),
    (c1,u3,'company.view'),
    (c1,u4,'company.view'),(c1,u4,'sales.draft');
  PERFORM set_config('test.doc.u1',u1::text,true);
  PERFORM set_config('test.doc.u2',u2::text,true);
  PERFORM set_config('test.doc.u3',u3::text,true);
  PERFORM set_config('test.doc.u4',u4::text,true);
  PERFORM set_config('test.doc.c1',c1::text,true);
  PERFORM set_config('test.doc.c2',c2::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid := current_setting('test.doc.c1')::uuid;
        u uuid := current_setting('test.doc.u1')::uuid;
        file_id uuid; review_id uuid; n integer;
BEGIN
  INSERT INTO public.document_attachments(company_id,entity_type,file_name,uploaded_by)
  VALUES(c,'company','invoice.pdf',u) RETURNING id INTO file_id;
  SELECT id INTO review_id FROM public.document_reviews
    WHERE company_id=c AND attachment_id=file_id;
  IF review_id IS NULL THEN RAISE EXCEPTION 'Upload not auto-enqueued'; END IF;
  IF (SELECT status FROM public.document_reviews WHERE id=review_id) <> 'needs_review'
  THEN RAISE EXCEPTION 'Unexpected initial status'; END IF;
  UPDATE public.document_reviews SET status='ready', document_type='bill',
      reference='INV-001',currency_code='USD',total_minor=12345
    WHERE id=review_id AND version=1;
  IF (SELECT version FROM public.document_reviews WHERE id=review_id) <> 2
  THEN RAISE EXCEPTION 'Optimistic version did not increment'; END IF;
  UPDATE public.document_reviews SET status='approved' WHERE id=review_id AND version=2;
  IF NOT EXISTS(
    SELECT 1 FROM public.document_reviews
    WHERE id=review_id AND reviewed_by=u AND reviewed_at IS NOT NULL AND version=3
  ) THEN RAISE EXCEPTION 'Authorised review approval failed'; END IF;
  SELECT count(*) INTO n FROM public.document_review_events WHERE review_id=review_id;
  IF n <> 3 THEN RAISE EXCEPTION 'Missing review audit events: %',n; END IF;
  UPDATE public.document_reviews SET status='ready' WHERE id=review_id AND version=1;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Stale version was accepted'; END IF;
  PERFORM set_config('test.doc.review_id',review_id::text,true);
END $$;
-- A member of another company cannot read or change the review.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.doc.u2'),'role','authenticated')::text,true);
DO $$
DECLARE r uuid := current_setting('test.doc.review_id')::uuid; n integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.document_reviews WHERE id=r)
  THEN RAISE EXCEPTION 'Cross-tenant review leak'; END IF;
  UPDATE public.document_reviews SET status='archived' WHERE id=r;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant review modification'; END IF;
END $$;
-- A read-only same-company member can inspect but cannot modify.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.doc.u3'),'role','authenticated')::text,true);
DO $$
DECLARE r uuid := current_setting('test.doc.review_id')::uuid; n integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.document_reviews WHERE id=r)
  THEN RAISE EXCEPTION 'Authorised read access denied'; END IF;
  UPDATE public.document_reviews SET status='archived' WHERE id=r;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Read-only reviewer modified document'; END IF;
END $$;
-- Staff with draft rights cannot approve or reverse an approval.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.doc.u4'),'role','authenticated')::text,true);
DO $$
DECLARE r uuid := current_setting('test.doc.review_id')::uuid;
BEGIN
  BEGIN
    UPDATE public.document_reviews SET status='rejected' WHERE id=r;
    RAISE EXCEPTION 'TEST unauthorised reversal accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST unauthorised reversal accepted' THEN RAISE; END IF;
  END;
END $$;
-- An approver can reopen, but non-approvers may not approve a ready document.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.doc.u1'),'role','authenticated')::text,true);
UPDATE public.document_reviews SET status='ready'
WHERE id=current_setting('test.doc.review_id')::uuid;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.doc.u4'),'role','authenticated')::text,true);
DO $$
DECLARE r uuid := current_setting('test.doc.review_id')::uuid;
BEGIN
  BEGIN
    UPDATE public.document_reviews SET status='approved' WHERE id=r;
    RAISE EXCEPTION 'TEST unauthorised approval accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST unauthorised approval accepted' THEN RAISE; END IF;
  END;
END $$;
-- Direct Data API inserts/deletes are not permitted; history is write-once.
DO $$
DECLARE c uuid := current_setting('test.doc.c1')::uuid; r uuid := current_setting('test.doc.review_id')::uuid;
BEGIN
  BEGIN
    DELETE FROM public.document_review_events WHERE review_id=r;
    RAISE EXCEPTION 'TEST audit history delete accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST audit history delete accepted' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.document_review_events WHERE review_id=r) < 4
  THEN RAISE EXCEPTION 'Audit history lost'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Document review migration: queue, optimistic locking, approval, audit and multi-tenant RLS passed; rolled back.' AS result;
