-- CRM gap-closure batch: duplicate detection, conversion match hardening,
-- explainable lead scoring, opportunity reopen, optimistic stage updates.
-- Additive. Does not post journals.

CREATE OR REPLACE FUNCTION public.find_crm_duplicate_leads(
  _company_id UUID,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _organization_name TEXT DEFAULT NULL,
  _exclude_lead_id UUID DEFAULT NULL,
  _limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
  _lim INT := GREATEST(1, LEAST(COALESCE(_limit, 20), 50));
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.view');

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.updated_at DESC), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT
      l.id,
      l.lead_number AS "leadNumber",
      l.status,
      l.email,
      l.phone,
      l.organization_name AS "organizationName",
      l.first_name AS "firstName",
      l.last_name AS "lastName",
      l.updated_at,
      (
        CASE WHEN NULLIF(lower(trim(_email)), '') IS NOT NULL
              AND lower(COALESCE(l.email, '')) = lower(trim(_email)) THEN 50 ELSE 0 END
        + CASE WHEN NULLIF(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), '') IS NOT NULL
              AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g')
                = regexp_replace(_phone, '\D', '', 'g')
              AND length(regexp_replace(_phone, '\D', '', 'g')) >= 7 THEN 30 ELSE 0 END
        + CASE WHEN NULLIF(lower(trim(_organization_name)), '') IS NOT NULL
              AND lower(COALESCE(l.organization_name, '')) = lower(trim(_organization_name)) THEN 25 ELSE 0 END
      ) AS score
    FROM public.crm_leads l
    WHERE l.company_id = _company_id
      AND l.archived_at IS NULL
      AND l.status NOT IN ('converted', 'disqualified')
      AND (_exclude_lead_id IS NULL OR l.id <> _exclude_lead_id)
      AND (
        (NULLIF(lower(trim(_email)), '') IS NOT NULL AND lower(COALESCE(l.email, '')) = lower(trim(_email)))
        OR (
          NULLIF(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), '') IS NOT NULL
          AND length(regexp_replace(_phone, '\D', '', 'g')) >= 7
          AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g')
            = regexp_replace(_phone, '\D', '', 'g')
        )
        OR (
          NULLIF(lower(trim(_organization_name)), '') IS NOT NULL
          AND lower(COALESCE(l.organization_name, '')) = lower(trim(_organization_name))
        )
      )
    ORDER BY score DESC, l.updated_at DESC
    LIMIT _lim
  ) x
  WHERE x.score > 0;

  RETURN jsonb_build_object('matches', COALESCE(_rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.find_crm_duplicate_leads(UUID, TEXT, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_crm_duplicate_leads(UUID, TEXT, TEXT, TEXT, UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_crm_conversion_matches(
  _company_id UUID,
  _lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lead public.crm_leads%ROWTYPE;
  _rows JSONB;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.view');
  SELECT * INTO _lead FROM public.crm_leads WHERE id = _lead_id AND company_id = _company_id;
  IF _lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT
      c.id,
      c.name,
      c.email,
      c.phone,
      c.kind,
      c.is_active AS "isActive",
      (
        CASE WHEN _lead.email IS NOT NULL AND lower(COALESCE(c.email, '')) = lower(_lead.email) THEN 60 ELSE 0 END
        + CASE WHEN _lead.phone IS NOT NULL
              AND length(regexp_replace(_lead.phone, '\D', '', 'g')) >= 7
              AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
                = regexp_replace(_lead.phone, '\D', '', 'g') THEN 25 ELSE 0 END
        + CASE WHEN NULLIF(trim(COALESCE(_lead.organization_name, '')), '') IS NOT NULL
              AND lower(c.name) = lower(trim(_lead.organization_name)) THEN 40 ELSE 0 END
      ) AS score
    FROM public.contacts c
    WHERE c.company_id = _company_id
      AND c.archived_at IS NULL
      AND (
        (_lead.email IS NOT NULL AND lower(COALESCE(c.email, '')) = lower(_lead.email))
        OR (
          _lead.phone IS NOT NULL
          AND length(regexp_replace(_lead.phone, '\D', '', 'g')) >= 7
          AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
            = regexp_replace(_lead.phone, '\D', '', 'g')
        )
        OR (
          NULLIF(trim(COALESCE(_lead.organization_name, '')), '') IS NOT NULL
          AND lower(c.name) = lower(trim(_lead.organization_name))
        )
      )
    LIMIT 25
  ) x
  WHERE x.score > 0;

  RETURN jsonb_build_object(
    'leadId', _lead.id,
    'matches', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.find_crm_conversion_matches(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_crm_conversion_matches(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_crm_lead(
  _company_id UUID,
  _lead_id UUID,
  _create_opportunity BOOLEAN DEFAULT true,
  _existing_contact_id UUID DEFAULT NULL,
  _allow_create_despite_match BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lead public.crm_leads%ROWTYPE;
  _settings public.crm_settings%ROWTYPE;
  _contact_id UUID;
  _contact_name TEXT;
  _opp_id UUID := NULL;
  _stage_id UUID;
  _pipeline_id UUID;
  _opp_number TEXT;
  _match_count INT := 0;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.leads.manage');
  SELECT * INTO _lead FROM public.crm_leads WHERE id = _lead_id AND company_id = _company_id FOR UPDATE;
  IF _lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF _lead.status = 'converted' THEN RAISE EXCEPTION 'Lead is already converted'; END IF;
  IF _lead.status = 'disqualified' THEN RAISE EXCEPTION 'Disqualified leads cannot be converted'; END IF;
  IF _lead.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived leads cannot be converted'; END IF;

  SELECT * INTO _settings FROM public.crm_settings WHERE company_id = _company_id;
  IF NOT COALESCE(_settings.enabled, false) THEN
    RAISE EXCEPTION 'CRM is disabled for this organisation';
  END IF;

  IF _existing_contact_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = _existing_contact_id AND c.company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Contact not found in this organisation';
    END IF;
    _contact_id := _existing_contact_id;
  ELSIF _lead.contact_id IS NOT NULL THEN
    _contact_id := _lead.contact_id;
  ELSE
    SELECT count(*) INTO _match_count
    FROM public.contacts c
    WHERE c.company_id = _company_id
      AND c.archived_at IS NULL
      AND (
        (_lead.email IS NOT NULL AND lower(COALESCE(c.email, '')) = lower(_lead.email))
        OR (
          _lead.phone IS NOT NULL
          AND length(regexp_replace(_lead.phone, '\D', '', 'g')) >= 7
          AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
            = regexp_replace(_lead.phone, '\D', '', 'g')
        )
        OR (
          NULLIF(trim(COALESCE(_lead.organization_name, '')), '') IS NOT NULL
          AND lower(c.name) = lower(trim(_lead.organization_name))
        )
      );

    IF _match_count > 0 AND NOT COALESCE(_allow_create_despite_match, false) THEN
      RAISE EXCEPTION
        'Matching contact(s) found (%). Select an existing contact or explicitly allow creating a new one.',
        _match_count;
    END IF;

    IF NOT public.has_company_permission(_company_id, 'contacts.manage') THEN
      RAISE EXCEPTION 'contacts.manage is required to create a customer from a lead'
        USING ERRCODE = '42501';
    END IF;
    _contact_name := NULLIF(trim(COALESCE(_lead.organization_name, '')), '');
    IF _contact_name IS NULL THEN
      _contact_name := trim(COALESCE(_lead.first_name, '') || ' ' || COALESCE(_lead.last_name, ''));
    END IF;
    IF char_length(trim(_contact_name)) = 0 THEN
      _contact_name := COALESCE(_lead.email, 'CRM Lead ' || _lead.lead_number);
    END IF;

    INSERT INTO public.contacts (
      company_id, name, kind, email, phone, website, notes, is_active,
      billing_address_line1, billing_address_line2, billing_city, billing_region,
      billing_postal, billing_country, default_currency
    ) VALUES (
      _company_id, trim(_contact_name), 'customer', _lead.email, _lead.phone, _lead.website,
      COALESCE(_lead.notes, 'Converted from CRM lead ' || _lead.lead_number), true,
      _lead.address_line1, _lead.address_line2, _lead.city, _lead.region,
      _lead.postal_code, _lead.country, _lead.currency_code
    )
    RETURNING id INTO _contact_id;
  END IF;

  IF _create_opportunity THEN
    _pipeline_id := _settings.default_pipeline_id;
    SELECT s.id INTO _stage_id
    FROM public.crm_pipeline_stages s
    WHERE s.pipeline_id = _pipeline_id AND s.company_id = _company_id
      AND s.is_active AND NOT s.is_won AND NOT s.is_lost
    ORDER BY s.sort_order LIMIT 1;
    IF _pipeline_id IS NULL OR _stage_id IS NULL THEN
      RAISE EXCEPTION 'Default pipeline is not configured';
    END IF;
    _opp_number := private.crm_allocate_number(
      _company_id, 'crm_opportunity', _settings.opportunity_number_prefix
    );
    INSERT INTO public.crm_opportunities (
      company_id, opportunity_number, name, pipeline_id, stage_id, status,
      contact_id, lead_id, owner_user_id, amount_minor, currency_code,
      probability_pct, source_id, notes, created_by, updated_by
    )
    SELECT
      _company_id, _opp_number,
      COALESCE(NULLIF(trim(_lead.organization_name), ''), trim(COALESCE(_lead.first_name, '') || ' ' || COALESCE(_lead.last_name, '')), _lead.lead_number),
      _pipeline_id, _stage_id, 'open', _contact_id, _lead.id,
      COALESCE(_lead.owner_user_id, auth.uid()), _lead.estimated_value_minor, _lead.currency_code,
      s.probability_pct, _lead.source_id, 'Created from lead ' || _lead.lead_number, auth.uid(), auth.uid()
    FROM public.crm_pipeline_stages s WHERE s.id = _stage_id
    RETURNING id INTO _opp_id;

    INSERT INTO public.crm_opportunity_stage_history (
      company_id, opportunity_id, from_stage_id, to_stage_id, status_after, note, acted_by
    ) VALUES (
      _company_id, _opp_id, NULL, _stage_id, 'open', 'Opportunity created from lead', auth.uid()
    );
  END IF;

  UPDATE public.crm_leads SET
    status = 'converted', contact_id = _contact_id, converted_opportunity_id = _opp_id,
    converted_at = now(), converted_by = auth.uid(), version = version + 1,
    updated_by = auth.uid(), updated_at = now()
  WHERE id = _lead.id;

  INSERT INTO public.crm_lead_events (
    company_id, lead_id, event_type, status_after, note, payload, acted_by
  ) VALUES (
    _company_id, _lead.id, 'converted', 'converted', 'Lead converted',
    jsonb_build_object('contactId', _contact_id, 'opportunityId', _opp_id, 'matchedExisting', _existing_contact_id IS NOT NULL),
    auth.uid()
  );

  RETURN jsonb_build_object('leadId', _lead.id, 'contactId', _contact_id, 'opportunityId', _opp_id);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_crm_lead(UUID, UUID, BOOLEAN, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_crm_lead(UUID, UUID, BOOLEAN, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_crm_lead(
  _company_id UUID,
  _lead_id UUID,
  _create_opportunity BOOLEAN DEFAULT true,
  _existing_contact_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.convert_crm_lead(_company_id, _lead_id, _create_opportunity, _existing_contact_id, false);
$$;
REVOKE ALL ON FUNCTION public.convert_crm_lead(UUID, UUID, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_crm_lead(UUID, UUID, BOOLEAN, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.score_crm_lead(
  _company_id UUID,
  _lead_id UUID,
  _persist BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _lead public.crm_leads%ROWTYPE;
  _score INT := 0;
  _reasons JSONB := '[]'::jsonb;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.leads.manage');
  SELECT * INTO _lead FROM public.crm_leads WHERE id = _lead_id AND company_id = _company_id;
  IF _lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

  IF _lead.email IS NOT NULL THEN
    _score := _score + 20;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'email', 'points', 20, 'detail', 'Email present'));
  END IF;
  IF _lead.phone IS NOT NULL THEN
    _score := _score + 10;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'phone', 'points', 10, 'detail', 'Phone present'));
  END IF;
  IF NULLIF(trim(COALESCE(_lead.organization_name, '')), '') IS NOT NULL THEN
    _score := _score + 15;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'organization', 'points', 15, 'detail', 'Organisation named'));
  END IF;
  IF _lead.source_id IS NOT NULL THEN
    _score := _score + 10;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'source', 'points', 10, 'detail', 'Lead source set'));
  END IF;
  IF _lead.estimated_value_minor >= 100000 THEN
    _score := _score + 20;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'value_high', 'points', 20, 'detail', 'Estimated value ≥ 1000.00'));
  ELSIF _lead.estimated_value_minor >= 10000 THEN
    _score := _score + 10;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'value_mid', 'points', 10, 'detail', 'Estimated value ≥ 100.00'));
  END IF;
  IF _lead.owner_user_id IS NOT NULL THEN
    _score := _score + 10;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'owner', 'points', 10, 'detail', 'Owner assigned'));
  END IF;
  IF _lead.status = 'qualified' THEN
    _score := _score + 15;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'qualified', 'points', 15, 'detail', 'Status qualified'));
  ELSIF _lead.status = 'contacted' THEN
    _score := _score + 5;
    _reasons := _reasons || jsonb_build_array(jsonb_build_object('code', 'contacted', 'points', 5, 'detail', 'Status contacted'));
  END IF;
  _score := LEAST(100, _score);

  IF _persist THEN
    UPDATE public.crm_leads
    SET score = _score, version = version + 1, updated_by = auth.uid(), updated_at = now()
    WHERE id = _lead.id;
    INSERT INTO public.crm_lead_events (
      company_id, lead_id, event_type, status_after, note, payload, acted_by
    ) VALUES (
      _company_id, _lead.id, 'scored', _lead.status, 'Lead score recalculated',
      jsonb_build_object('score', _score, 'reasons', _reasons), auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'leadId', _lead.id,
    'score', _score,
    'reasons', _reasons,
    'formula', 'Deterministic LinkBooks CRM score (max 100): email+20, phone+10, organisation+15, source+10, value bands +10/+20, owner+10, status contacted+5/qualified+15.'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.score_crm_lead(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_crm_lead(UUID, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_crm_opportunity(
  _company_id UUID,
  _opportunity_id UUID,
  _stage_id UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_opportunities%ROWTYPE;
  _stage public.crm_pipeline_stages%ROWTYPE;
  _from UUID;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.opportunities.manage');
  SELECT * INTO _row FROM public.crm_opportunities
  WHERE id = _opportunity_id AND company_id = _company_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  IF _row.status NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'Only won or lost opportunities can be reopened';
  END IF;

  IF _stage_id IS NULL THEN
    SELECT id INTO _stage_id FROM public.crm_pipeline_stages
    WHERE pipeline_id = _row.pipeline_id AND company_id = _company_id
      AND is_active AND NOT is_won AND NOT is_lost
    ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT * INTO _stage FROM public.crm_pipeline_stages
  WHERE id = _stage_id AND company_id = _company_id AND pipeline_id = _row.pipeline_id
    AND is_active AND NOT is_won AND NOT is_lost;
  IF _stage.id IS NULL THEN
    RAISE EXCEPTION 'Reopen stage must be an open stage in the same pipeline';
  END IF;

  _from := _row.stage_id;
  UPDATE public.crm_opportunities SET
    stage_id = _stage.id, status = 'open', probability_pct = _stage.probability_pct,
    stage_entered_at = now(), actual_close_date = NULL, win_reason = NULL, loss_reason = NULL,
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  WHERE id = _row.id RETURNING * INTO _row;

  INSERT INTO public.crm_opportunity_stage_history (
    company_id, opportunity_id, from_stage_id, to_stage_id, status_after, note, acted_by
  ) VALUES (
    _company_id, _row.id, _from, _stage.id, 'open',
    COALESCE(NULLIF(trim(_note), ''), 'Opportunity reopened'), auth.uid()
  );

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status, 'stageId', _row.stage_id, 'version', _row.version);
END;
$$;
REVOKE ALL ON FUNCTION public.reopen_crm_opportunity(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_crm_opportunity(UUID, UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_crm_opportunity_stage(
  _company_id UUID,
  _opportunity_id UUID,
  _stage_id UUID,
  _note TEXT DEFAULT NULL,
  _expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_opportunities%ROWTYPE;
  _stage public.crm_pipeline_stages%ROWTYPE;
  _from UUID;
  _status TEXT;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.opportunities.manage');
  SELECT * INTO _row FROM public.crm_opportunities
  WHERE id = _opportunity_id AND company_id = _company_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  IF _expected_version IS NOT NULL AND _row.version <> _expected_version THEN
    RAISE EXCEPTION 'Opportunity was updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO _stage FROM public.crm_pipeline_stages
  WHERE id = _stage_id AND company_id = _company_id AND pipeline_id = _row.pipeline_id;
  IF _stage.id IS NULL THEN RAISE EXCEPTION 'Stage not in this pipeline'; END IF;

  _from := _row.stage_id;
  _status := CASE WHEN _stage.is_won THEN 'won' WHEN _stage.is_lost THEN 'lost' ELSE 'open' END;

  UPDATE public.crm_opportunities SET
    stage_id = _stage_id, status = _status, probability_pct = _stage.probability_pct,
    stage_entered_at = now(),
    actual_close_date = CASE WHEN _status IN ('won', 'lost') THEN COALESCE(actual_close_date, CURRENT_DATE) ELSE NULL END,
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  WHERE id = _row.id RETURNING * INTO _row;

  INSERT INTO public.crm_opportunity_stage_history (
    company_id, opportunity_id, from_stage_id, to_stage_id, status_after, note, acted_by
  ) VALUES (
    _company_id, _row.id, _from, _stage_id, _status, NULLIF(trim(_note), ''), auth.uid()
  );

  RETURN jsonb_build_object(
    'id', _row.id, 'stageId', _row.stage_id, 'status', _row.status,
    'probabilityPct', _row.probability_pct, 'version', _row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_crm_opportunity_stage(
  _company_id UUID,
  _opportunity_id UUID,
  _stage_id UUID,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.set_crm_opportunity_stage(_company_id, _opportunity_id, _stage_id, _note, NULL);
$$;

REVOKE ALL ON FUNCTION public.set_crm_opportunity_stage(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_crm_opportunity_stage(UUID, UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_crm_opportunity_stage(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_crm_opportunity_stage(UUID, UUID, UUID, TEXT, INTEGER) TO authenticated;
