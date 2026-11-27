-- Executed inside one rolled-back, network-isolated PostgreSQL fixture.
ALTER TABLE public.contacts ADD COLUMN email text, ADD COLUMN archived_at timestamptz;
CREATE TABLE public.portal_settings(company_id uuid PRIMARY KEY, require_mfa boolean, invite_days int);
CREATE TABLE public.portal_memberships(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, contact_id uuid, email text,
  portal_role text, status text, mfa_required boolean, invite_token_hash text,
  invite_expires_at timestamptz, invited_by uuid
);
-- Scope this fixture to the invitation function. Mail, rate limits and audit have separate owners.
CREATE FUNCTION public.portal_enabled(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public.portal_assert_writable(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN END$$;
CREATE FUNCTION public.portal_rate_limit(text,int,interval) RETURNS void LANGUAGE plpgsql AS $$BEGIN END$$;
CREATE FUNCTION public.portal_audit(uuid,uuid,text,text,uuid,jsonb) RETURNS void LANGUAGE plpgsql AS $$BEGIN END$$;

DO $$
DECLARE
  actor uuid := gen_random_uuid();
  company uuid := gen_random_uuid();
  contact uuid;
  scenario record;
  invite jsonb;
  stored public.portal_memberships%ROWTYPE;
BEGIN
  INSERT INTO public.companies(id) VALUES (company);
  INSERT INTO public.test_permissions VALUES (company, actor, 'sales.draft');
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor)::text, true);
  FOR scenario IN SELECT * FROM (VALUES
    (true, false, true), (true, NULL::boolean, true), (false, true, true),
    (false, false, false), (NULL::boolean, true, true), (NULL::boolean, false, false)
  ) AS cases(policy, requested, expected) LOOP
    DELETE FROM public.portal_settings WHERE company_id = company;
    IF scenario.policy IS NOT NULL THEN
      INSERT INTO public.portal_settings VALUES (company, scenario.policy, 7);
    END IF;
    contact := gen_random_uuid();
    INSERT INTO public.contacts(id, company_id, kind, email)
      VALUES (contact, company, 'customer', 'invite@example.test');
    invite := public.invite_portal_user(jsonb_strip_nulls(jsonb_build_object(
      'company_id', company, 'contact_id', contact, 'role', 'customer', 'mfa_required', scenario.requested
    )));
    SELECT * INTO STRICT stored FROM public.portal_memberships WHERE id = (invite->>'membership_id')::uuid;
    IF stored.mfa_required IS DISTINCT FROM scenario.expected OR
       stored.invite_expires_at IS DISTINCT FROM now() + make_interval(days => CASE WHEN scenario.policy IS NULL THEN 14 ELSE 7 END)
    THEN RAISE EXCEPTION 'Invitation policy mismatch for %, %', scenario.policy, scenario.requested;
    END IF;
  END LOOP;
END $$;
