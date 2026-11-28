-- Church and congregation records sit on the existing nonprofit ledger.
-- Collection batches post by calling nonprofit_submit_donation. They do not
-- replace post_journal, store card data, or issue a tax certificate.

ALTER TABLE public.nonprofit_settings
  ADD COLUMN IF NOT EXISTS organisation_kind TEXT NOT NULL DEFAULT 'ngo';

ALTER TABLE public.nonprofit_settings
  DROP CONSTRAINT IF EXISTS nonprofit_settings_organisation_kind_check;
ALTER TABLE public.nonprofit_settings
  ADD CONSTRAINT nonprofit_settings_organisation_kind_check
  CHECK (organisation_kind IN (
    'ngo', 'charity', 'church', 'temple', 'mosque', 'gurdwara', 'ministry', 'foundation'
  ));

DO $$
DECLARE
  _name TEXT;
BEGIN
  SELECT con.conname INTO _name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'nonprofit_funds'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%category%'
    AND pg_get_constraintdef(con.oid) ILIKE '%general%';
  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.nonprofit_funds DROP CONSTRAINT %I', _name);
  END IF;
END $$;

ALTER TABLE public.nonprofit_funds
  ADD CONSTRAINT nonprofit_funds_category_check
  CHECK (category IN (
    'general', 'programme', 'project', 'emergency', 'capital', 'scholarship',
    'government_grant', 'international_grant', 'endowment', 'custom',
    'building', 'mission', 'welfare'
  ));

CREATE TABLE IF NOT EXISTS public.nonprofit_congregations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nonprofit_congregations_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  congregation_id UUID REFERENCES public.nonprofit_congregations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nonprofit_households_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_household_members (
  household_id UUID NOT NULL REFERENCES public.nonprofit_households(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.nonprofit_donors(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL CHECK (member_role IN ('head', 'adult', 'child')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, donor_id),
  UNIQUE (company_id, donor_id)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_collection_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  congregation_id UUID REFERENCES public.nonprofit_congregations(id) ON DELETE SET NULL,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  collected_on DATE NOT NULL,
  giving_kind TEXT NOT NULL CHECK (giving_kind IN ('donation', 'tithe', 'offering', 'special_collection')),
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'rejected')),
  idempotency_key TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_gift_designations (
  donation_id UUID PRIMARY KEY REFERENCES public.nonprofit_donations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.nonprofit_collection_batches(id) ON DELETE SET NULL,
  giving_kind TEXT NOT NULL CHECK (giving_kind IN ('donation', 'tithe', 'offering', 'special_collection')),
  anonymous BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.nonprofit_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.nonprofit_events(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.nonprofit_donors(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, donor_id)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_volunteer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES public.nonprofit_volunteers(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.nonprofit_events(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (volunteer_id, event_id)
);

ALTER TABLE public.nonprofit_congregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonprofit_households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonprofit_household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonprofit_collection_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonprofit_gift_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonprofit_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonprofit_volunteer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS np_member_select ON public.nonprofit_congregations;
CREATE POLICY np_member_select ON public.nonprofit_congregations
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));
DROP POLICY IF EXISTS np_member_select ON public.nonprofit_households;
CREATE POLICY np_member_select ON public.nonprofit_households
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));
DROP POLICY IF EXISTS np_member_select ON public.nonprofit_household_members;
CREATE POLICY np_member_select ON public.nonprofit_household_members
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));
DROP POLICY IF EXISTS np_member_select ON public.nonprofit_collection_batches;
CREATE POLICY np_member_select ON public.nonprofit_collection_batches
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));
DROP POLICY IF EXISTS np_member_select ON public.nonprofit_gift_designations;
CREATE POLICY np_member_select ON public.nonprofit_gift_designations
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));
DROP POLICY IF EXISTS np_member_select ON public.nonprofit_attendance;
CREATE POLICY np_member_select ON public.nonprofit_attendance
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));
DROP POLICY IF EXISTS np_member_select ON public.nonprofit_volunteer_assignments;
CREATE POLICY np_member_select ON public.nonprofit_volunteer_assignments
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'nonprofit.view'));

GRANT SELECT ON public.nonprofit_congregations, public.nonprofit_households, public.nonprofit_household_members,
  public.nonprofit_collection_batches, public.nonprofit_gift_designations, public.nonprofit_attendance,
  public.nonprofit_volunteer_assignments TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.nonprofit_congregations, public.nonprofit_households,
  public.nonprofit_household_members, public.nonprofit_collection_batches, public.nonprofit_gift_designations,
  public.nonprofit_attendance, public.nonprofit_volunteer_assignments FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.nonprofit_set_organisation_kind(_company_id UUID, _kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.admin');
  IF _kind NOT IN ('ngo', 'charity', 'church', 'temple', 'mosque', 'gurdwara', 'ministry', 'foundation') THEN
    RAISE EXCEPTION 'Organisation kind is invalid';
  END IF;
  INSERT INTO public.nonprofit_settings (company_id, organisation_kind)
  VALUES (_company_id, _kind)
  ON CONFLICT (company_id) DO UPDATE
    SET organisation_kind = EXCLUDED.organisation_kind, updated_at = now();
  RETURN jsonb_build_object('organisation_kind', _kind, 'statutory_filing', false, 'tax_certificate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_congregation(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  INSERT INTO public.nonprofit_congregations (company_id, name, location)
  VALUES (_company_id, trim(_payload->>'name'), NULLIF(_payload->>'location', ''))
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_household(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.donors.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  INSERT INTO public.nonprofit_households (company_id, congregation_id, name)
  VALUES (
    _company_id,
    NULLIF(_payload->>'congregation_id', '')::UUID,
    trim(_payload->>'name')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_add_household_member(
  _company_id UUID,
  _household_id UUID,
  _donor_id UUID,
  _role TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.donors.manage');
  IF _role NOT IN ('head', 'adult', 'child') THEN
    RAISE EXCEPTION 'Household role is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.nonprofit_households WHERE id = _household_id AND company_id = _company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.nonprofit_donors WHERE id = _donor_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Household member was not found in this organisation';
  END IF;
  INSERT INTO public.nonprofit_household_members (household_id, company_id, donor_id, member_role)
  VALUES (_household_id, _company_id, _donor_id, _role)
  ON CONFLICT (household_id, donor_id) DO UPDATE SET member_role = EXCLUDED.member_role;
  RETURN jsonb_build_object('household_id', _household_id, 'donor_id', _donor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_post_collection_batch(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.nonprofit_collection_batches;
  _batch UUID;
  _fund UUID;
  _on DATE;
  _kind TEXT;
  _currency TEXT;
  _line JSONB;
  _index INTEGER := 0;
  _amount BIGINT;
  _donor UUID;
  _anonymous BOOLEAN;
  _posted JSONB;
  _donation UUID;
  _posted_count INTEGER := 0;
  _anonymous_count INTEGER := 0;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.donations.manage');
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  PERFORM public.nonprofit_enabled(_company_id);
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;
  SELECT * INTO _existing FROM public.nonprofit_collection_batches
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'status', _existing.status, 'replayed', true);
  END IF;
  _fund := NULLIF(_payload->>'fund_id', '')::UUID;
  _on := NULLIF(_payload->>'collected_on', '')::DATE;
  _kind := COALESCE(NULLIF(_payload->>'giving_kind', ''), 'donation');
  _currency := upper(COALESCE(NULLIF(_payload->>'currency_code', ''), 'USD'));
  IF _fund IS NULL OR _on IS NULL OR _kind NOT IN ('donation', 'tithe', 'offering', 'special_collection') THEN
    RAISE EXCEPTION 'A collection batch needs a fund, a date and a giving kind';
  END IF;
  IF jsonb_typeof(_payload->'lines') <> 'array' OR jsonb_array_length(_payload->'lines') < 1 THEN
    RAISE EXCEPTION 'A collection batch needs at least one line';
  END IF;
  INSERT INTO public.nonprofit_collection_batches (
    company_id, congregation_id, fund_id, collected_on, giving_kind, currency_code, idempotency_key, created_by
  ) VALUES (
    _company_id, NULLIF(_payload->>'congregation_id', '')::UUID, _fund, _on, _kind, _currency,
    _payload->>'idempotency_key', auth.uid()
  ) RETURNING id INTO _batch;
  FOR _line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    _index := _index + 1;
    _amount := (_line->>'amount_minor')::BIGINT;
    _anonymous := COALESCE((_line->>'anonymous')::BOOLEAN, false) OR NULLIF(_line->>'donor_id', '') IS NULL;
    _donor := CASE WHEN _anonymous THEN NULL ELSE NULLIF(_line->>'donor_id', '')::UUID END;
    IF _amount IS NULL OR _amount <= 0 THEN
      RAISE EXCEPTION 'Collection line amount is invalid';
    END IF;
    _posted := public.nonprofit_submit_donation(_company_id, jsonb_build_object(
      'donor_id', _donor,
      'donated_on', _on,
      'currency_code', _currency,
      'amount_minor', _amount,
      'method', 'cash',
      'anonymous', _anonymous,
      'idempotency_key', _payload->>'idempotency_key' || '-' || _index::TEXT,
      'memo', _kind,
      'allocations', jsonb_build_array(jsonb_build_object('fund_id', _fund, 'amount_minor', _amount))
    ));
    _donation := (_posted->>'id')::UUID;
    INSERT INTO public.nonprofit_gift_designations (donation_id, company_id, batch_id, giving_kind, anonymous)
    VALUES (_donation, _company_id, _batch, _kind, _anonymous)
    ON CONFLICT (donation_id) DO NOTHING;
    _posted_count := _posted_count + 1;
    IF _anonymous THEN _anonymous_count := _anonymous_count + 1; END IF;
  END LOOP;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    _company_id, auth.uid(), 'nonprofit.collection.posted', 'nonprofit_collection_batch', _batch,
    jsonb_build_object('posted', _posted_count, 'anonymous', _anonymous_count, 'giving_kind', _kind)
  );
  RETURN jsonb_build_object(
    'id', _batch,
    'status', 'posted',
    'replayed', false,
    'posted', _posted_count,
    'anonymous', _anonymous_count,
    'statutory_filing', false,
    'tax_certificate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_household_statement(
  _company_id UUID,
  _household_id UUID,
  _from DATE,
  _as_of DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT;
  _result JSONB;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  SELECT name INTO _name FROM public.nonprofit_households
  WHERE id = _household_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Household was not found'; END IF;
  WITH docs AS (
    SELECT
      m.donor_id,
      CASE WHEN d.anonymous THEN 'Anonymous donor' ELSE d.display_name END AS display_name,
      public.np_donor_statement_document(_company_id, _from, _as_of, m.donor_id, 'none') AS document
    FROM public.nonprofit_household_members m
    JOIN public.nonprofit_donors d ON d.id = m.donor_id
    WHERE m.household_id = _household_id AND m.company_id = _company_id
  ),
  totals AS (
    SELECT
      currency->>'currency_code' AS currency_code,
      SUM((currency->>'net_minor')::BIGINT) AS net_minor,
      SUM((currency->>'journal_support_minor')::BIGINT) AS journal_support_minor
    FROM docs
    CROSS JOIN LATERAL jsonb_array_elements(docs.document->'currencies') currency
    GROUP BY currency->>'currency_code'
  )
  SELECT jsonb_build_object(
    'statutory_filing', false,
    'government_approved', false,
    'tax_certificate', false,
    'wording', 'This family statement sums the members'' recognised gifts and their tagged contribution revenue. It is not a government filing and it is not a tax certificate.',
    'household_id', _household_id,
    'name', _name,
    'period_from', _from,
    'as_of', _as_of,
    'currencies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'currency_code', totals.currency_code,
        'net_minor', totals.net_minor,
        'journal_support_minor', totals.journal_support_minor,
        'reconciled', totals.net_minor = totals.journal_support_minor
      ) ORDER BY totals.currency_code)
      FROM totals
    ), '[]'::JSONB),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'donor_id', docs.donor_id,
        'display_name', docs.display_name,
        'currencies', docs.document->'currencies'
      ) ORDER BY docs.display_name)
      FROM docs
    ), '[]'::JSONB)
  ) INTO _result;
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_record_attendance(
  _company_id UUID,
  _event_id UUID,
  _donor_id UUID,
  _present BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.manage');
  IF NOT EXISTS (SELECT 1 FROM public.nonprofit_events WHERE id = _event_id AND company_id = _company_id)
    OR NOT EXISTS (SELECT 1 FROM public.nonprofit_donors WHERE id = _donor_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Attendance record was not found in this organisation';
  END IF;
  INSERT INTO public.nonprofit_attendance (company_id, event_id, donor_id, present)
  VALUES (_company_id, _event_id, _donor_id, COALESCE(_present, false))
  ON CONFLICT (event_id, donor_id) DO UPDATE SET present = EXCLUDED.present;
  RETURN jsonb_build_object('event_id', _event_id, 'donor_id', _donor_id, 'present', COALESCE(_present, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_schedule_volunteer(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.manage');
  IF NOT EXISTS (
    SELECT 1 FROM public.nonprofit_volunteers WHERE id = (_payload->>'volunteer_id')::UUID AND company_id = _company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.nonprofit_events WHERE id = (_payload->>'event_id')::UUID AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Volunteer assignment was not found in this organisation';
  END IF;
  INSERT INTO public.nonprofit_volunteer_assignments (company_id, volunteer_id, event_id, role_name)
  VALUES (
    _company_id, (_payload->>'volunteer_id')::UUID, (_payload->>'event_id')::UUID, trim(_payload->>'role_name')
  )
  ON CONFLICT (volunteer_id, event_id) DO UPDATE SET role_name = EXCLUDED.role_name
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'journal_id', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_workspace(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings JSONB;
  _see_beneficiaries BOOLEAN;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  SELECT jsonb_build_object(
    'enabled', enabled, 'accounting_framework', accounting_framework, 'country_code', country_code,
    'allow_unrestricted_deficit', allow_unrestricted_deficit, 'enforce_segregation', enforce_segregation,
    'gateway_configured', gateway_configured, 'account_map', account_map, 'version', version,
    'organisation_kind', organisation_kind
  ) INTO _settings
  FROM public.nonprofit_settings WHERE company_id = _company_id;
  _see_beneficiaries := public.has_company_permission(_company_id, 'nonprofit.beneficiaries.view');
  RETURN jsonb_build_object(
    'settings', COALESCE(_settings, jsonb_build_object('enabled', false, 'account_map', '{}'::JSONB, 'organisation_kind', 'ngo')),
    'funds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', f.id, 'code', f.code, 'name', f.name, 'restriction', f.restriction, 'category', f.category,
      'status', f.status, 'spendable_minor', public.nonprofit_fund_spendable(_company_id, f.id, CURRENT_DATE)
    ) ORDER BY f.code) FROM public.nonprofit_funds f WHERE f.company_id = _company_id), '[]'::JSONB),
    'donors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_name', d.display_name, 'donor_kind', d.donor_kind, 'email', d.email) ORDER BY d.display_name) FROM public.nonprofit_donors d WHERE d.company_id = _company_id), '[]'::JSONB),
    'donations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'donation_number', d.donation_number, 'amount_minor', d.amount_minor, 'status', d.status, 'journal_id', d.journal_id, 'donated_on', d.donated_on, 'conditional', d.conditional, 'giving_kind', g.giving_kind) ORDER BY d.created_at DESC) FROM public.nonprofit_donations d LEFT JOIN public.nonprofit_gift_designations g ON g.donation_id = d.id WHERE d.company_id = _company_id), '[]'::JSONB),
    'pledges', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'pledge_number', p.pledge_number, 'amount_minor', p.amount_minor, 'status', p.status, 'collected_minor', p.collected_minor, 'impaired_minor', p.impaired_minor) ORDER BY p.created_at DESC) FROM public.nonprofit_pledges p WHERE p.company_id = _company_id), '[]'::JSONB),
    'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'code', g.code, 'title', g.title, 'award_minor', g.award_minor, 'received_minor', g.received_minor, 'recognised_minor', g.recognised_minor, 'conditional', g.conditional, 'conditions_met', g.conditions_met, 'status', g.status) ORDER BY g.code) FROM public.nonprofit_grants g WHERE g.company_id = _company_id), '[]'::JSONB),
    'expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'amount_minor', e.amount_minor, 'functional_class', e.functional_class, 'category', e.category, 'status', e.status, 'rejection_reason', e.rejection_reason, 'allocated_minor', e.allocated_minor, 'journal_id', e.journal_id) ORDER BY e.created_at DESC) FROM public.nonprofit_expenses e WHERE e.company_id = _company_id), '[]'::JSONB),
    'campaigns', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'target_minor', c.target_minor, 'status', c.status)) FROM public.nonprofit_campaigns c WHERE c.company_id = _company_id), '[]'::JSONB),
    'programmes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'objective', p.objective, 'status', p.status)) FROM public.nonprofit_programmes p WHERE p.company_id = _company_id), '[]'::JSONB),
    'volunteers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'display_name', v.display_name, 'status', v.status)) FROM public.nonprofit_volunteers v WHERE v.company_id = _company_id), '[]'::JSONB),
    'memberships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'category', m.category, 'status', m.status)) FROM public.nonprofit_memberships m WHERE m.company_id = _company_id), '[]'::JSONB),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'event_on', e.event_on, 'status', e.status, 'present_count', (SELECT count(*) FROM public.nonprofit_attendance a WHERE a.event_id = e.id AND a.present)) ORDER BY e.event_on DESC NULLS LAST) FROM public.nonprofit_events e WHERE e.company_id = _company_id), '[]'::JSONB),
    'board', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'display_name', b.display_name, 'office', b.office)) FROM public.nonprofit_board_members b WHERE b.company_id = _company_id), '[]'::JSONB),
    'compliance', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'due_on', c.due_on, 'status', c.status, 'pack_id', c.pack_id)) FROM public.nonprofit_compliance_items c WHERE c.company_id = _company_id), '[]'::JSONB),
    'receipts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'receipt_number', r.receipt_number, 'amount_minor', r.amount_minor, 'donation_id', r.donation_id, 'wording', r.wording)) FROM public.nonprofit_receipts r WHERE r.company_id = _company_id), '[]'::JSONB),
    'congregations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'location', c.location, 'status', c.status) ORDER BY c.name) FROM public.nonprofit_congregations c WHERE c.company_id = _company_id), '[]'::JSONB),
    'households', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'display_name', h.name) ORDER BY h.name) FROM public.nonprofit_households h WHERE h.company_id = _company_id), '[]'::JSONB),
    'collections', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'giving_kind', b.giving_kind, 'status', b.status, 'donated_on', b.collected_on, 'amount_minor', (SELECT COALESCE(SUM(d.amount_minor), 0) FROM public.nonprofit_gift_designations g JOIN public.nonprofit_donations d ON d.id = g.donation_id WHERE g.batch_id = b.id)) ORDER BY b.collected_on DESC) FROM public.nonprofit_collection_batches b WHERE b.company_id = _company_id), '[]'::JSONB),
    'schedules', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'display_name', v.display_name, 'name', e.name, 'role', a.role_name) ORDER BY e.event_on) FROM public.nonprofit_volunteer_assignments a JOIN public.nonprofit_volunteers v ON v.id = a.volunteer_id JOIN public.nonprofit_events e ON e.id = a.event_id WHERE a.company_id = _company_id), '[]'::JSONB),
    'beneficiaries', CASE WHEN _see_beneficiaries THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'display_name', b.display_name, 'eligibility_status', b.eligibility_status)) FROM public.nonprofit_beneficiaries b WHERE b.company_id = _company_id), '[]'::JSONB) ELSE NULL END,
    'disbursements', CASE WHEN _see_beneficiaries THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'display_name', b.display_name, 'amount_minor', d.amount_minor,
        'status', d.status, 'rejection_reason', d.rejection_reason
      ) ORDER BY d.created_at DESC)
      FROM public.nonprofit_disbursements d
      JOIN public.nonprofit_beneficiaries b ON b.id = d.beneficiary_id
      WHERE d.company_id = _company_id
    ), '[]'::JSONB) ELSE NULL END,
    'actions', COALESCE((
      SELECT jsonb_agg(item) FROM (
        SELECT jsonb_build_object('id', p.id::TEXT, 'title', 'Outstanding pledge ' || p.pledge_number, 'href', '/nonprofit/pledges', 'severity', 'attention') AS item
        FROM public.nonprofit_pledges p
        WHERE p.company_id = _company_id AND (p.amount_minor - p.collected_minor - p.impaired_minor) > 0
        UNION ALL
        SELECT jsonb_build_object('id', g.id::TEXT, 'title', 'Grant conditions open for ' || g.code, 'href', '/nonprofit/grants', 'severity', 'attention')
        FROM public.nonprofit_grants g
        WHERE g.company_id = _company_id AND g.conditional AND NOT g.conditions_met AND g.status = 'active' AND g.received_minor > g.recognised_minor
        UNION ALL
        SELECT jsonb_build_object('id', c.id::TEXT, 'title', 'Compliance due: ' || c.title, 'href', '/nonprofit/people', 'severity', 'attention')
        FROM public.nonprofit_compliance_items c
        WHERE c.company_id = _company_id AND c.status = 'open' AND c.due_on IS NOT NULL AND c.due_on <= CURRENT_DATE + 30
        UNION ALL
        SELECT jsonb_build_object('id', d.id::TEXT, 'title', 'Disbursement awaiting approval', 'href', '/nonprofit/people', 'severity', 'attention')
        FROM public.nonprofit_disbursements d
        WHERE _see_beneficiaries AND d.company_id = _company_id AND d.status = 'draft'
      ) actions
    ), '[]'::JSONB)
  );
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'nonprofit_set_organisation_kind',
      'nonprofit_create_congregation',
      'nonprofit_create_household',
      'nonprofit_add_household_member',
      'nonprofit_post_collection_batch',
      'nonprofit_household_statement',
      'nonprofit_record_attendance',
      'nonprofit_schedule_volunteer',
      'nonprofit_workspace'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
  END LOOP;
END $$;
