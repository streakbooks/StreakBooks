-- Billing phase 1 assertions. Run by scripts/test-billing-postgres.mjs after the fixture and
-- migrations are loaded. Every check raises on failure; PASS lines are emitted as NOTICEs.
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

CREATE FUNCTION pg_temp.ok(_cond boolean, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(_cond, false) THEN RAISE EXCEPTION 'FAIL %', _label; END IF;
  RAISE NOTICE 'PASS %', _label;
END $$;
CREATE FUNCTION pg_temp.expect_error(_sql text, _state text, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> _state THEN
      RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but got % (%)', _label, _state, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but the statement succeeded', _label, _state;
END $$;
CREATE FUNCTION pg_temp.act(_uid text, _aal text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN _uid IS NULL THEN '' ELSE json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text END,
    false);
$$;
CREATE FUNCTION pg_temp.account_for(_company uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT billing_account_id FROM billing.billing_account_companies WHERE company_id = _company;
$$;

-- ---------------------------------------------------------------- reference data
SELECT pg_temp.ok((SELECT count(*) FROM billing.currencies) = 155, 'ISO 4217 currencies seeded (155)');
SELECT pg_temp.ok((SELECT count(*) FROM billing.countries) = 249, 'ISO 3166 countries seeded (249)');
SELECT pg_temp.ok((SELECT minor_units FROM billing.currencies WHERE code = 'INR') = 2, 'INR has 2 minor units');
SELECT pg_temp.ok((SELECT minor_units FROM billing.currencies WHERE code = 'JPY') = 0, 'JPY has 0 minor units');
SELECT pg_temp.ok((SELECT minor_units FROM billing.currencies WHERE code = 'KWD') = 3, 'KWD has 3 minor units');
SELECT pg_temp.ok((SELECT default_currency FROM billing.countries WHERE code = 'IN') = 'INR', 'India defaults to INR');
SELECT pg_temp.ok((SELECT default_currency FROM billing.countries WHERE code = 'AQ') IS NULL, 'Antarctica has no currency');
-- Launch migration enables checkout countries; all others stay closed.
SELECT pg_temp.ok(
  (SELECT count(*) FROM billing.countries WHERE billing_enabled AND code IN ('GB', 'US', 'IN', 'AU', 'NZ', 'IE', 'CA')) = 7
  AND NOT EXISTS (
    SELECT 1 FROM billing.countries
     WHERE billing_enabled AND code NOT IN ('GB', 'US', 'IN', 'AU', 'NZ', 'IE', 'CA')
  ),
  'Only launch countries are billing-enabled');

-- ---------------------------------------------------------------- backfill and new companies
SELECT pg_temp.ok((SELECT count(*) FROM billing.billing_account_companies) = 2, 'Existing companies backfilled');
SELECT pg_temp.ok((SELECT a.account_type = 'ORGANIZATION' AND a.billing_country = 'GB' AND a.country_source = 'USER_SELECTED'
  FROM billing.billing_accounts a WHERE a.id = pg_temp.account_for('10000000-0000-0000-0000-00000000000a')),
  'Alpha backfilled as ORGANIZATION in GB');
SELECT pg_temp.ok((SELECT a.billing_country FROM billing.billing_accounts a
  WHERE a.id = pg_temp.account_for('10000000-0000-0000-0000-00000000000b')) = 'IN', 'Beta backfilled in IN');
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000d1', 'new@example.test');
INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('10000000-0000-0000-0000-00000000000d', 'Delta Inc', '00000000-0000-0000-0000-0000000000d1', 'US');
SELECT pg_temp.ok(pg_temp.account_for('10000000-0000-0000-0000-00000000000d') IS NOT NULL, 'New company gets a billing account');

SELECT pg_temp.account_for('10000000-0000-0000-0000-00000000000a') AS acct_a \gset

-- ---------------------------------------------------------------- direct access is closed
SET ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM billing.billing_accounts', '42501', 'anon cannot read billing tables');
SELECT pg_temp.expect_error('SELECT public.billing_my_accounts()', '42501', 'anon cannot call billing_my_accounts');
SELECT pg_temp.ok(jsonb_array_length(public.billing_reference_data()->'currencies') = 155, 'anon can read reference data');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal1');
SELECT pg_temp.expect_error('SELECT * FROM billing.billing_accounts', '42501', 'authenticated cannot read billing tables');
SELECT pg_temp.expect_error('SELECT billing.write_audit(''x.y'', ''t'', null, null, null, null, null)', '42501',
  'clients cannot write billing audit');
SELECT pg_temp.expect_error('SELECT * FROM public.platform_billing_audit', '42501', 'clients cannot read billing audit');

-- ---------------------------------------------------------------- permission matrix
SELECT pg_temp.ok(jsonb_array_length(public.billing_my_accounts()) = 1, 'Owner A sees one billing account');
SELECT pg_temp.ok((public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')->'permissions'->>'manage')::boolean,
  'Owner A can manage Alpha billing');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a2', 'aal1');
SELECT pg_temp.ok((public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')->'permissions'->>'paymentMethods')::boolean,
  'Admin A can manage payment methods');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a3', 'aal1');
SELECT pg_temp.expect_error($q$SELECT public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')$q$, '42501',
  'Staff cannot view billing');
SELECT pg_temp.ok(jsonb_array_length(public.billing_my_accounts()) = 0, 'Staff sees no billing accounts');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a4', 'aal1');
SELECT pg_temp.expect_error($q$SELECT public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')$q$, '42501',
  'Accountant without a grant cannot view billing');
RESET ROLE;
INSERT INTO public.member_permission_adjustments (company_id, user_id, permission, effect)
  VALUES ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'billing.view', 'grant');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a4', 'aal1');
SELECT pg_temp.ok(NOT (public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')->'permissions'->>'manage')::boolean,
  'Accountant with an explicit grant can view but not manage');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000b1', 'aal1');
SELECT pg_temp.expect_error($q$SELECT public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')$q$, '42501',
  'Owner B cannot read Alpha billing (cross-tenant)');
SELECT pg_temp.ok(jsonb_array_length(public.billing_my_accounts()) = 1, 'Owner B sees only Beta');

-- ---------------------------------------------------------------- MFA
RESET ROLE;
INSERT INTO auth.mfa_factors (user_id, status) VALUES ('00000000-0000-0000-0000-0000000000a1', 'verified');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal1');
SELECT pg_temp.expect_error($q$SELECT public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')$q$, '42501',
  'Owner with MFA enrolled is denied at aal1');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.ok(public.billing_account_for_company('10000000-0000-0000-0000-00000000000a') IS NOT NULL,
  'Owner with MFA is allowed at aal2');

-- ---------------------------------------------------------------- profile updates
SELECT pg_temp.expect_error(format($q$SELECT public.billing_update_account_profile(%L, '{"billingEmail":"x@y.z"}', now() - interval '1 day')$q$,
  :'acct_a'), '40001', 'Stale profile update is rejected');
SELECT pg_temp.expect_error(format($q$SELECT public.billing_update_account_profile(%L, '{"cardNumber":"4242"}', now())$q$,
  :'acct_a'), '22023', 'Unknown profile field is rejected');
SELECT pg_temp.expect_error(format($q$SELECT public.billing_update_account_profile(%L, '{"billingCountry":"ZZ"}', (public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')->>'updatedAt')::timestamptz)$q$,
  :'acct_a'), '22023', 'Unknown billing country is rejected');
SELECT pg_temp.ok((public.billing_update_account_profile(
    :'acct_a',
    '{"billingEmail":"Billing@Alpha.Example","billingCountry":"au","city":"Sydney"}',
    (public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')->>'updatedAt')::timestamptz)
  ->>'billingEmail') = 'billing@alpha.example', 'Owner updates billing profile');
SELECT pg_temp.ok((public.billing_account_for_company('10000000-0000-0000-0000-00000000000a')->>'billingCountry') = 'AU',
  'Billing country normalised to AU');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a4', 'aal1');
SELECT pg_temp.expect_error(format($q$SELECT public.billing_update_account_profile(%L, '{"city":"X"}', now())$q$,
  :'acct_a'), '42501', 'View-only accountant cannot update profile');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.platform_billing_audit WHERE action = 'billing_account.profile_updated') = 1,
  'Profile update audited once');
SELECT pg_temp.ok((SELECT actor_user_id FROM public.platform_billing_audit WHERE action = 'billing_account.profile_updated')
  = '00000000-0000-0000-0000-0000000000a1', 'Audit records the acting user');

-- ---------------------------------------------------------------- B2C individual accounts
INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('10000000-0000-0000-0000-00000000000c', 'Solo Books', '00000000-0000-0000-0000-0000000000c1', 'IN');
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c1', 'owner', 'active');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a2', 'aal1');
SELECT pg_temp.expect_error($q$SELECT public.billing_use_individual_account('10000000-0000-0000-0000-00000000000a')$q$, '42501',
  'Admin (not owner) cannot switch to individual billing');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error($q$SELECT public.billing_use_individual_account('10000000-0000-0000-0000-00000000000a')$q$, '23514',
  'Multi-member company cannot use individual billing');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c1', 'aal1');
SELECT pg_temp.ok((public.billing_use_individual_account('10000000-0000-0000-0000-00000000000c')->>'accountType') = 'INDIVIDUAL',
  'Sole owner switches to an INDIVIDUAL account');
SELECT pg_temp.ok((public.billing_account_for_company('10000000-0000-0000-0000-00000000000c')->>'userLimit')::int = 1,
  'Individual account user limit defaults to 1');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM billing.billing_accounts WHERE owner_user_id = '00000000-0000-0000-0000-0000000000c1'
  AND account_type = 'ORGANIZATION' AND status = 'CLOSED') = 1, 'Replaced organisation account is closed');
SELECT pg_temp.expect_error($q$INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a3', 'staff', 'active')$q$, '23514',
  'Individual account blocks a second user');
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a4', 'accountant', 'active');
SELECT pg_temp.ok(true, 'Individual account allows accountant access');
INSERT INTO public.companies (id, name, created_by, country_code)
  VALUES ('10000000-0000-0000-0000-0000000000c2', 'Solo Side Project', '00000000-0000-0000-0000-0000000000c1', 'IN');
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'owner', 'active');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000c1', 'aal1');
SELECT pg_temp.expect_error($q$SELECT public.billing_use_individual_account('10000000-0000-0000-0000-0000000000c2')$q$, '23514',
  'Individual account company limit (1) is enforced');
SELECT pg_temp.ok((public.billing_use_organization_account('10000000-0000-0000-0000-00000000000c')->>'accountType') = 'ORGANIZATION',
  'Owner converts back to an organisation account');
RESET ROLE;
INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a3', 'staff', 'active');
SELECT pg_temp.ok(true, 'Organisation account allows team members again');
SELECT pg_temp.expect_error($q$UPDATE billing.billing_accounts SET account_type = 'INDIVIDUAL'
  WHERE id = pg_temp.account_for('10000000-0000-0000-0000-00000000000c')$q$, '42501', 'Account type cannot be changed in place');

-- ---------------------------------------------------------------- audit chain
SELECT pg_temp.expect_error('UPDATE public.platform_billing_audit SET reason = ''x''', '42501', 'Billing audit is append-only');
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000a1', 'aal2');
SELECT pg_temp.expect_error('SELECT public.platform_verify_billing_audit_chain()', '42501', 'Customers cannot verify the platform chain');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal1');
SELECT pg_temp.expect_error('SELECT public.platform_verify_billing_audit_chain()', '42501', 'Platform finance needs aal2');
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.ok((public.platform_verify_billing_audit_chain()->>'valid')::boolean, 'Audit chain verifies');
SELECT pg_temp.ok((public.platform_verify_billing_audit_chain()->>'checkedRows')::int >= 4, 'Audit chain covers new rows');
RESET ROLE;
ALTER TABLE public.platform_billing_audit DISABLE TRIGGER platform_billing_audit_immutable;
UPDATE public.platform_billing_audit SET reason = 'tampered'
 WHERE seq = (SELECT min(seq) FROM public.platform_billing_audit WHERE row_hash IS NOT NULL);
ALTER TABLE public.platform_billing_audit ENABLE TRIGGER platform_billing_audit_immutable;
SET ROLE authenticated;
SELECT pg_temp.act('00000000-0000-0000-0000-0000000000f1', 'aal2');
SELECT pg_temp.ok(NOT (public.platform_verify_billing_audit_chain()->>'valid')::boolean, 'Tampering is detected');
RESET ROLE;
SELECT pg_temp.act(NULL, NULL);
