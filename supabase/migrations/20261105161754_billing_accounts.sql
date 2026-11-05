-- Billing platform, phase 1: billing accounts (B2B organisations and B2C individuals).
-- A billing account owns subscriptions (later phases). Companies link to exactly one
-- billing account. ORGANIZATION accounts derive access from company permissions;
-- INDIVIDUAL accounts are owned by one user with a one-user limit by default.
-- Additive and idempotent: backfills one ORGANIZATION account per existing company.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type text NOT NULL CHECK (account_type IN ('INDIVIDUAL', 'ORGANIZATION')),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 200),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  billing_email text CHECK (
    billing_email IS NULL
    OR (char_length(billing_email) <= 320 AND billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  legal_name text CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 200),
  address_line1 text CHECK (address_line1 IS NULL OR char_length(address_line1) <= 200),
  address_line2 text CHECK (address_line2 IS NULL OR char_length(address_line2) <= 200),
  city text CHECK (city IS NULL OR char_length(city) <= 120),
  region text CHECK (region IS NULL OR char_length(region) <= 120),
  postal_code text CHECK (postal_code IS NULL OR char_length(postal_code) <= 20),
  billing_country char(2) REFERENCES billing.countries(code) ON DELETE RESTRICT,
  country_source text CHECK (country_source IN ('IP_GEOLOCATION', 'USER_SELECTED', 'VERIFIED_BILLING_ADDRESS')),
  user_limit integer CHECK (user_limit IS NULL OR user_limit > 0),
  company_limit integer NOT NULL DEFAULT 1 CHECK (company_limit > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_accounts_country_source_pair CHECK ((billing_country IS NULL) = (country_source IS NULL)),
  CONSTRAINT billing_accounts_individual_user_limit CHECK (account_type <> 'INDIVIDUAL' OR user_limit IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS billing_accounts_owner_idx ON billing.billing_accounts (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_one_active_individual
  ON billing.billing_accounts (owner_user_id) WHERE account_type = 'INDIVIDUAL' AND status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS billing.billing_account_companies (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  billing_account_id uuid NOT NULL REFERENCES billing.billing_accounts(id) ON DELETE RESTRICT,
  linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_account_companies_account_idx
  ON billing.billing_account_companies (billing_account_id);

ALTER TABLE billing.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_account_companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.billing_accounts, billing.billing_account_companies FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON billing.billing_accounts, billing.billing_account_companies FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_accounts_touch ON billing.billing_accounts;
CREATE TRIGGER billing_accounts_touch BEFORE UPDATE ON billing.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION billing.touch_updated_at();

-- Owner and type are fixed once created; conversion creates a new account instead.
CREATE OR REPLACE FUNCTION billing.guard_account_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'Billing account type and owner cannot change' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'A closed billing account cannot be reopened' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_accounts_identity ON billing.billing_accounts;
CREATE TRIGGER billing_accounts_identity BEFORE UPDATE ON billing.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION billing.guard_account_identity();

-- A link must target an active account and respect the account's company limit.
CREATE OR REPLACE FUNCTION billing.guard_account_company_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  acct billing.billing_accounts%ROWTYPE;
  linked integer;
BEGIN
  SELECT * INTO acct FROM billing.billing_accounts WHERE id = NEW.billing_account_id FOR UPDATE;
  IF NOT FOUND OR acct.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Billing account is not active' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO linked
    FROM billing.billing_account_companies l
   WHERE l.billing_account_id = NEW.billing_account_id
     AND l.company_id <> NEW.company_id;
  IF linked + 1 > acct.company_limit THEN
    RAISE EXCEPTION 'Billing account company limit (%) reached', acct.company_limit USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_account_companies_guard ON billing.billing_account_companies;
CREATE TRIGGER billing_account_companies_guard BEFORE INSERT OR UPDATE ON billing.billing_account_companies
  FOR EACH ROW EXECUTE FUNCTION billing.guard_account_company_link();

-- Individual (B2C) accounts enforce their user limit on company membership.
-- Accountant members are excluded: accountant access is a separate allowance.
CREATE OR REPLACE FUNCTION billing.enforce_individual_user_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  acct billing.billing_accounts%ROWTYPE;
  members integer;
BEGIN
  IF NEW.status::text NOT IN ('active', 'invited') OR NEW.role::text = 'accountant' THEN
    RETURN NEW;
  END IF;
  SELECT a.* INTO acct
    FROM billing.billing_account_companies l
    JOIN billing.billing_accounts a ON a.id = l.billing_account_id
   WHERE l.company_id = NEW.company_id;
  IF NOT FOUND OR acct.account_type <> 'INDIVIDUAL' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO members
    FROM public.company_members m
   WHERE m.company_id = NEW.company_id
     AND m.status::text IN ('active', 'invited')
     AND m.role::text <> 'accountant'
     AND m.user_id IS DISTINCT FROM NEW.user_id;
  IF members + 1 > acct.user_limit THEN
    RAISE EXCEPTION 'This individual billing account allows % user(s). Convert to an organisation account to add team members.',
      acct.user_limit USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_members_individual_user_limit ON public.company_members;
CREATE TRIGGER company_members_individual_user_limit BEFORE INSERT OR UPDATE OF role, status ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION billing.enforce_individual_user_limit();

-- ---------------------------------------------------------------------------
-- Organisation accounts for every company (new and existing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.create_organization_account(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  co record;
  acct uuid;
  country char(2);
BEGIN
  SELECT l.billing_account_id INTO acct FROM billing.billing_account_companies l WHERE l.company_id = _company_id;
  IF acct IS NOT NULL THEN
    RETURN acct;
  END IF;
  SELECT c.id, c.name, c.created_by, c.country_code INTO co FROM public.companies c WHERE c.id = _company_id;
  IF NOT FOUND OR co.created_by IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT k.code INTO country FROM billing.countries k WHERE k.code = upper(co.country_code);
  INSERT INTO billing.billing_accounts
    (account_type, display_name, owner_user_id, billing_country, country_source, created_by)
  VALUES
    ('ORGANIZATION', left(coalesce(nullif(btrim(co.name), ''), 'Organisation'), 200), co.created_by,
     country, CASE WHEN country IS NULL THEN NULL ELSE 'USER_SELECTED' END, co.created_by)
  RETURNING id INTO acct;
  INSERT INTO billing.billing_account_companies (company_id, billing_account_id, linked_by)
  VALUES (_company_id, acct, co.created_by);
  RETURN acct;
END $$;
REVOKE ALL ON FUNCTION billing.create_organization_account(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION billing.on_company_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM billing.create_organization_account(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companies_billing_account ON public.companies;
CREATE TRIGGER companies_billing_account AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION billing.on_company_created();

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT co.id FROM public.companies co
    WHERE NOT EXISTS (SELECT 1 FROM billing.billing_account_companies l WHERE l.company_id = co.id)
  LOOP
    PERFORM billing.create_organization_account(c.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
-- billing.view: subscription, invoices, usage. billing.payment_methods: recurring
-- payment authorisation. Accountants and other roles receive these only through an
-- explicit member permission grant.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'billing.view'),
  ('admin', 'billing.view'),
  ('owner', 'billing.payment_methods'),
  ('admin', 'billing.payment_methods')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION billing.can_access_account(_account_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _permission IN ('billing.view', 'billing.manage', 'billing.payment_methods')
     AND coalesce((
       SELECT CASE
         WHEN a.status <> 'ACTIVE' AND _permission <> 'billing.view' THEN false
         WHEN a.account_type = 'INDIVIDUAL' THEN a.owner_user_id = auth.uid() AND private.customer_access_ok()
         ELSE EXISTS (
           SELECT 1 FROM billing.billing_account_companies l
            WHERE l.billing_account_id = a.id
              AND public.has_company_permission(l.company_id, _permission))
       END
       FROM billing.billing_accounts a
       WHERE a.id = _account_id), false);
$$;
REVOKE ALL ON FUNCTION billing.can_access_account(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION billing.account_json(_account_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'accountType', a.account_type,
    'displayName', a.display_name,
    'status', a.status,
    'billingEmail', a.billing_email,
    'legalName', a.legal_name,
    'address', jsonb_build_object(
      'line1', a.address_line1, 'line2', a.address_line2, 'city', a.city,
      'region', a.region, 'postalCode', a.postal_code),
    'billingCountry', a.billing_country,
    'countrySource', a.country_source,
    'userLimit', a.user_limit,
    'companyLimit', a.company_limit,
    'isOwner', a.owner_user_id = auth.uid(),
    'updatedAt', a.updated_at,
    'companies', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
        FROM billing.billing_account_companies l
        JOIN public.companies c ON c.id = l.company_id
       WHERE l.billing_account_id = a.id), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'view', billing.can_access_account(a.id, 'billing.view'),
      'manage', billing.can_access_account(a.id, 'billing.manage'),
      'paymentMethods', billing.can_access_account(a.id, 'billing.payment_methods'))
  )
  FROM billing.billing_accounts a
  WHERE a.id = _account_id;
$$;
REVOKE ALL ON FUNCTION billing.account_json(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Client-callable functions (authenticated only; every call re-checks access)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_my_accounts()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(billing.account_json(x.id) ORDER BY x.display_name), '[]'::jsonb)
  FROM (
    SELECT DISTINCT a.id, a.display_name
      FROM billing.billing_accounts a
      LEFT JOIN billing.billing_account_companies l ON l.billing_account_id = a.id
      LEFT JOIN public.company_members m ON m.company_id = l.company_id AND m.user_id = auth.uid()
     WHERE a.status = 'ACTIVE'
       AND (a.owner_user_id = auth.uid() OR m.user_id IS NOT NULL)
  ) x
  WHERE billing.can_access_account(x.id, 'billing.view');
$$;

CREATE OR REPLACE FUNCTION public.billing_account_for_company(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE acct uuid;
BEGIN
  SELECT l.billing_account_id INTO acct FROM billing.billing_account_companies l WHERE l.company_id = _company_id;
  IF acct IS NULL OR NOT billing.can_access_account(acct, 'billing.view') THEN
    RAISE EXCEPTION 'Billing access requires the billing.view permission for this organisation' USING ERRCODE = '42501';
  END IF;
  RETURN billing.account_json(acct);
END $$;

CREATE OR REPLACE FUNCTION public.billing_update_account_profile(
  _account_id uuid, _profile jsonb, _expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  before_row billing.billing_accounts%ROWTYPE;
  after_row billing.billing_accounts%ROWTYPE;
  country char(2);
  t text;
BEGIN
  IF NOT billing.can_access_account(_account_id, 'billing.manage') THEN
    RAISE EXCEPTION 'Billing changes require the billing.manage permission' USING ERRCODE = '42501';
  END IF;
  IF _profile IS NULL OR jsonb_typeof(_profile) <> 'object' THEN
    RAISE EXCEPTION 'Profile must be an object' USING ERRCODE = '22023';
  END IF;
  FOR t IN SELECT jsonb_object_keys(_profile) LOOP
    IF t NOT IN ('displayName', 'billingEmail', 'legalName', 'addressLine1', 'addressLine2',
                 'city', 'region', 'postalCode', 'billingCountry') THEN
      RAISE EXCEPTION 'Unknown billing profile field %', t USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO before_row FROM billing.billing_accounts WHERE id = _account_id FOR UPDATE;
  IF before_row.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Billing account is not active' USING ERRCODE = '23514';
  END IF;
  IF _expected_updated_at IS NULL OR before_row.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'Billing profile changed since it was loaded. Reload and try again.' USING ERRCODE = '40001';
  END IF;

  IF _profile ? 'billingCountry' AND nullif(btrim(_profile->>'billingCountry'), '') IS NOT NULL THEN
    SELECT k.code INTO country FROM billing.countries k WHERE k.code = upper(btrim(_profile->>'billingCountry'));
    IF country IS NULL THEN
      RAISE EXCEPTION 'Unknown billing country' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE billing.billing_accounts a SET
    display_name = CASE WHEN _profile ? 'displayName' THEN btrim(_profile->>'displayName') ELSE a.display_name END,
    billing_email = CASE WHEN _profile ? 'billingEmail' THEN nullif(lower(btrim(_profile->>'billingEmail')), '') ELSE a.billing_email END,
    legal_name = CASE WHEN _profile ? 'legalName' THEN nullif(btrim(_profile->>'legalName'), '') ELSE a.legal_name END,
    address_line1 = CASE WHEN _profile ? 'addressLine1' THEN nullif(btrim(_profile->>'addressLine1'), '') ELSE a.address_line1 END,
    address_line2 = CASE WHEN _profile ? 'addressLine2' THEN nullif(btrim(_profile->>'addressLine2'), '') ELSE a.address_line2 END,
    city = CASE WHEN _profile ? 'city' THEN nullif(btrim(_profile->>'city'), '') ELSE a.city END,
    region = CASE WHEN _profile ? 'region' THEN nullif(btrim(_profile->>'region'), '') ELSE a.region END,
    postal_code = CASE WHEN _profile ? 'postalCode' THEN nullif(btrim(_profile->>'postalCode'), '') ELSE a.postal_code END,
    billing_country = CASE WHEN _profile ? 'billingCountry' THEN country ELSE a.billing_country END,
    country_source = CASE
      WHEN NOT (_profile ? 'billingCountry') THEN a.country_source
      WHEN country IS NULL THEN NULL
      WHEN country IS NOT DISTINCT FROM a.billing_country THEN a.country_source
      ELSE 'USER_SELECTED' END
  WHERE a.id = _account_id
  RETURNING * INTO after_row;

  PERFORM billing.write_audit('billing_account.profile_updated', 'billing_account', _account_id::text, _account_id,
    to_jsonb(before_row) - 'updated_at', to_jsonb(after_row) - 'updated_at', NULL);
  RETURN billing.account_json(_account_id);
END $$;

-- B2C: a sole owner moves their company onto a personal (INDIVIDUAL) billing account.
CREATE OR REPLACE FUNCTION public.billing_use_individual_account(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  current_acct billing.billing_accounts%ROWTYPE;
  individual uuid;
  others integer;
BEGIN
  IF uid IS NULL OR NOT private.customer_access_ok() THEN
    RAISE EXCEPTION 'Sign-in is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
     WHERE m.company_id = _company_id AND m.user_id = uid
       AND m.role::text = 'owner' AND m.status::text = 'active')
  THEN
    RAISE EXCEPTION 'Only the organisation owner can choose individual billing' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO others FROM public.company_members m
   WHERE m.company_id = _company_id AND m.user_id <> uid
     AND m.status::text IN ('active', 'invited') AND m.role::text <> 'accountant';
  IF others > 0 THEN
    RAISE EXCEPTION 'Individual billing allows one user. Remove other team members first.' USING ERRCODE = '23514';
  END IF;

  SELECT a.* INTO current_acct
    FROM billing.billing_account_companies l
    JOIN billing.billing_accounts a ON a.id = l.billing_account_id
   WHERE l.company_id = _company_id
   FOR UPDATE OF l;
  IF FOUND AND current_acct.account_type = 'INDIVIDUAL' THEN
    RETURN billing.account_json(current_acct.id);
  END IF;

  SELECT a.id INTO individual FROM billing.billing_accounts a
   WHERE a.owner_user_id = uid AND a.account_type = 'INDIVIDUAL' AND a.status = 'ACTIVE'
   FOR UPDATE;
  IF individual IS NULL THEN
    INSERT INTO billing.billing_accounts
      (account_type, display_name, owner_user_id, billing_email, legal_name, address_line1, address_line2,
       city, region, postal_code, billing_country, country_source, user_limit, company_limit, created_by)
    SELECT 'INDIVIDUAL', current_acct.display_name, uid, current_acct.billing_email, current_acct.legal_name,
           current_acct.address_line1, current_acct.address_line2, current_acct.city, current_acct.region,
           current_acct.postal_code, current_acct.billing_country, current_acct.country_source, 1, 1, uid
    RETURNING id INTO individual;
    PERFORM billing.write_audit('billing_account.created', 'billing_account', individual::text, individual,
      NULL, jsonb_build_object('accountType', 'INDIVIDUAL', 'companyId', _company_id), NULL);
  END IF;

  UPDATE billing.billing_account_companies SET billing_account_id = individual, linked_by = uid, linked_at = now()
   WHERE company_id = _company_id;

  IF current_acct.id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM billing.billing_account_companies l WHERE l.billing_account_id = current_acct.id)
  THEN
    UPDATE billing.billing_accounts SET status = 'CLOSED' WHERE id = current_acct.id;
  END IF;
  PERFORM billing.write_audit('billing_account.company_relinked', 'company', _company_id::text, individual,
    jsonb_build_object('billingAccountId', current_acct.id, 'accountType', current_acct.account_type),
    jsonb_build_object('billingAccountId', individual, 'accountType', 'INDIVIDUAL'), NULL);
  RETURN billing.account_json(individual);
END $$;

-- Back to an organisation account (e.g. to add team members). Owner only.
CREATE OR REPLACE FUNCTION public.billing_use_organization_account(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  current_acct billing.billing_accounts%ROWTYPE;
  org uuid;
  company_name text;
BEGIN
  IF uid IS NULL OR NOT private.customer_access_ok() THEN
    RAISE EXCEPTION 'Sign-in is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
     WHERE m.company_id = _company_id AND m.user_id = uid
       AND m.role::text = 'owner' AND m.status::text = 'active')
  THEN
    RAISE EXCEPTION 'Only the organisation owner can change billing type' USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO current_acct
    FROM billing.billing_account_companies l
    JOIN billing.billing_accounts a ON a.id = l.billing_account_id
   WHERE l.company_id = _company_id
   FOR UPDATE OF l;
  IF FOUND AND current_acct.account_type = 'ORGANIZATION' THEN
    RETURN billing.account_json(current_acct.id);
  END IF;

  SELECT c.name INTO company_name FROM public.companies c WHERE c.id = _company_id;
  INSERT INTO billing.billing_accounts
    (account_type, display_name, owner_user_id, billing_email, legal_name, address_line1, address_line2,
     city, region, postal_code, billing_country, country_source, created_by)
  VALUES
    ('ORGANIZATION', left(coalesce(nullif(btrim(company_name), ''), 'Organisation'), 200), uid,
     current_acct.billing_email, current_acct.legal_name, current_acct.address_line1, current_acct.address_line2,
     current_acct.city, current_acct.region, current_acct.postal_code, current_acct.billing_country,
     current_acct.country_source, uid)
  RETURNING id INTO org;
  UPDATE billing.billing_account_companies SET billing_account_id = org, linked_by = uid, linked_at = now()
   WHERE company_id = _company_id;
  PERFORM billing.write_audit('billing_account.company_relinked', 'company', _company_id::text, org,
    jsonb_build_object('billingAccountId', current_acct.id, 'accountType', current_acct.account_type),
    jsonb_build_object('billingAccountId', org, 'accountType', 'ORGANIZATION'), NULL);
  RETURN billing.account_json(org);
END $$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated users only; anon has no access to billing accounts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.touch_updated_at()', 'billing.guard_account_identity()', 'billing.guard_account_company_link()',
    'billing.enforce_individual_user_limit()', 'billing.on_company_created()',
    'billing.can_access_account(uuid, text)', 'billing.account_json(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.billing_my_accounts()', 'public.billing_account_for_company(uuid)',
    'public.billing_update_account_profile(uuid, jsonb, timestamptz)',
    'public.billing_use_individual_account(uuid)', 'public.billing_use_organization_account(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;
