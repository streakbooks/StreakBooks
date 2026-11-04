-- Run after the recurring-link migration. Never commits fixture data.
BEGIN;
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.firm_engagement_recurring_links'::regclass) THEN
    RAISE EXCEPTION 'Recurring billing RLS disabled';
  END IF;
  IF has_table_privilege('anon','public.firm_engagement_recurring_links','SELECT') THEN
    RAISE EXCEPTION 'Anonymous recurring billing data access';
  END IF;
  IF has_table_privilege('authenticated','public.firm_engagement_recurring_links','UPDATE') THEN
    RAISE EXCEPTION 'Mutable recurring billing identity';
  END IF;
  IF (SELECT count(*) FROM pg_policies
    WHERE tablename='firm_engagement_recurring_links' AND schemaname='public')<>4 THEN
    RAISE EXCEPTION 'Recurring billing policy set incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='firm_engagement_recurring_links' AND schemaname='public'
      AND policyname='mfa_aal2_required' AND permissive='RESTRICTIVE') THEN
    RAISE EXCEPTION 'MFA policy missing';
  END IF;
END $$;
DO $$
DECLARE user_id uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data)
 VALUES(user_id,'unrelated-'||user_id||'@example.invalid','{}');
 PERFORM set_config('request.jwt.claims',
 jsonb_build_object('sub',user_id,'aal','aal1','role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.firm_engagement_recurring_links) THEN
    RAISE EXCEPTION 'Cross-tenant recurring billing rows disclosed';
  END IF;
  BEGIN
    INSERT INTO public.firm_engagement_recurring_links(
      engagement_id,recurring_id,firm_id,company_id,billing_company_id,created_by
    ) VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
      gen_random_uuid(),gen_random_uuid(),auth.uid());
    RAISE EXCEPTION 'TEST: Unauthorized recurring link created';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'firm recurring billing: table privacy, policy, MFA and tenant access assertions passed; rolled back' AS result;
