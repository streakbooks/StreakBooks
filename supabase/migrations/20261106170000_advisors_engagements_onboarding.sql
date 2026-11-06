-- AD-06: Advisors engagements, proposals, agreements and onboarding.
-- Acceptance does not start a paid subscription (billing is AD-07).

CREATE TABLE IF NOT EXISTS public.advisors_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.advisors_clients(id) ON DELETE RESTRICT,
  assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  service_code text NOT NULL CHECK (service_code IN ('bookkeeping', 'coaching')),
  plan_code text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'proposed', 'accepted', 'onboarding', 'active', 'paused', 'closed')),
  currency text NOT NULL DEFAULT 'USD',
  amount_minor integer NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  billing_interval text
    CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year', 'session', 'one_time')),
  scope_summary text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.advisors_engagements(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  public_token text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  scope_text text NOT NULL DEFAULT '',
  exclusions_text text NOT NULL DEFAULT '',
  service_code text NOT NULL CHECK (service_code IN ('bookkeeping', 'coaching')),
  plan_code text,
  currency text NOT NULL DEFAULT 'USD',
  amount_minor integer NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  billing_interval text
    CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year', 'session', 'one_time')),
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_until timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  response_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.advisors_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.advisors_engagements(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.advisors_proposals(id) ON DELETE SET NULL,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'presented', 'accepted', 'withdrawn')),
  public_token text NOT NULL UNIQUE,
  title text NOT NULL,
  body_text text NOT NULL,
  presented_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  accepted_email text,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.advisors_onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.advisors_engagements(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'blocked', 'done', 'skipped')),
  sort_order integer NOT NULL DEFAULT 100,
  requires_document boolean NOT NULL DEFAULT false,
  document_label text NOT NULL DEFAULT '',
  customer_note text NOT NULL DEFAULT '',
  admin_note text NOT NULL DEFAULT '',
  assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, code)
);

CREATE INDEX IF NOT EXISTS advisors_engagements_client_idx
  ON public.advisors_engagements (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS advisors_proposals_engagement_idx
  ON public.advisors_proposals (engagement_id, version_number DESC);
CREATE INDEX IF NOT EXISTS advisors_proposals_status_idx
  ON public.advisors_proposals (status, sent_at DESC);
CREATE INDEX IF NOT EXISTS advisors_agreements_engagement_idx
  ON public.advisors_agreements (engagement_id, version_number DESC);
CREATE INDEX IF NOT EXISTS advisors_onboarding_tasks_engagement_idx
  ON public.advisors_onboarding_tasks (engagement_id, sort_order);

ALTER TABLE public.advisors_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_onboarding_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.advisors_engagements, public.advisors_proposals, public.advisors_agreements, public.advisors_onboarding_tasks FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_engagements, public.advisors_proposals, public.advisors_agreements, public.advisors_onboarding_tasks FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.advisors_new_public_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT encode(gen_random_bytes(24), 'hex');
$$;

CREATE OR REPLACE FUNCTION private.advisors_engagement_json(e public.advisors_engagements)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', e.id,
    'clientId', e.client_id,
    'assignedAdvisorId', e.assigned_advisor_id,
    'serviceCode', e.service_code,
    'planCode', e.plan_code,
    'title', e.title,
    'status', e.status,
    'currency', e.currency,
    'amountMinor', e.amount_minor,
    'billingInterval', e.billing_interval,
    'scopeSummary', e.scope_summary,
    'notes', e.notes,
    'createdAt', e.created_at,
    'updatedAt', e.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_proposal_json(p public.advisors_proposals)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'engagementId', p.engagement_id,
    'versionNumber', p.version_number,
    'status', p.status,
    'publicToken', p.public_token,
    'title', p.title,
    'summary', p.summary,
    'scopeText', p.scope_text,
    'exclusionsText', p.exclusions_text,
    'serviceCode', p.service_code,
    'planCode', p.plan_code,
    'currency', p.currency,
    'amountMinor', p.amount_minor,
    'billingInterval', p.billing_interval,
    'pricingSnapshot', p.pricing_snapshot,
    'validUntil', p.valid_until,
    'sentAt', p.sent_at,
    'respondedAt', p.responded_at,
    'responseNote', p.response_note,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_agreement_json(a public.advisors_agreements)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'engagementId', a.engagement_id,
    'proposalId', a.proposal_id,
    'versionNumber', a.version_number,
    'status', a.status,
    'publicToken', a.public_token,
    'title', a.title,
    'bodyText', a.body_text,
    'presentedAt', a.presented_at,
    'acceptedAt', a.accepted_at,
    'acceptedName', a.accepted_name,
    'acceptedEmail', a.accepted_email,
    'consentAt', a.consent_at,
    'createdAt', a.created_at,
    'updatedAt', a.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_onboarding_task_json(t public.advisors_onboarding_tasks)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'engagementId', t.engagement_id,
    'code', t.code,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'sortOrder', t.sort_order,
    'requiresDocument', t.requires_document,
    'documentLabel', t.document_label,
    'customerNote', t.customer_note,
    'adminNote', t.admin_note,
    'assignedAdvisorId', t.assigned_advisor_id,
    'dueAt', t.due_at,
    'completedAt', t.completed_at,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_default_agreement_body(
  _service text, _plan text, _amount integer, _currency text, _interval text
) RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN trim(both E'\n' from format($fmt$
LinkBooks Advisors Service Agreement

This agreement covers %s services%son the LinkBooks Advisors platform.

Proposed commercial terms
- Amount: %s %s
- Billing interval: %s
- This acceptance confirms scope and pricing for onboarding. It does not by itself charge a card or start a paid subscription.

Customer responsibilities
- Provide accurate business information.
- Upload requested documents securely when asked.
- Respond to advisor questions during onboarding.

Advisor responsibilities
- Deliver the selected service within the agreed inclusions.
- Keep customer financial documents confidential.
- Use LinkBooks systems for delivery tracking.

Exclusions
- Statutory tax filing, audit, certification and regulated representation are excluded unless separately contracted after eligibility checks.

Acceptance
By accepting, the customer confirms they have read these terms and authorise LinkBooks Advisors to begin onboarding for the selected service.
$fmt$,
    _service,
    CASE WHEN nullif(_plan, '') IS NULL THEN '' ELSE ' (' || _plan || ')' END,
    (_amount::numeric / 100)::text,
    coalesce(nullif(_currency, ''), 'USD'),
    coalesce(nullif(_interval, ''), 'as proposed')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION private.advisors_seed_onboarding(_engagement_id uuid, _service text, _advisor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _service = 'bookkeeping' THEN
    INSERT INTO public.advisors_onboarding_tasks(
      engagement_id, code, title, description, sort_order, requires_document, document_label, assigned_advisor_id
    ) VALUES
      (_engagement_id, 'business_profile', 'Confirm business profile', 'Legal name, trading name, country and contact details.', 10, false, '', _advisor),
      (_engagement_id, 'bank_access', 'Share bank feed access', 'Provide read-only bank connection details or statements.', 20, true, 'Recent bank statements', _advisor),
      (_engagement_id, 'chart_accounts', 'Review chart of accounts', 'Confirm account structure before monthly bookkeeping starts.', 30, false, '', _advisor),
      (_engagement_id, 'opening_balances', 'Provide opening balances', 'Balances as at the agreed start date.', 40, true, 'Opening balance workbook', _advisor),
      (_engagement_id, 'document_pack', 'Upload document pack', 'Sales, purchases and payroll source documents for the first period.', 50, true, 'Source documents ZIP/PDF', _advisor),
      (_engagement_id, 'kickoff', 'Advisor kickoff', 'Confirm cadence, reporting pack and points of contact.', 60, false, '', _advisor)
    ON CONFLICT (engagement_id, code) DO NOTHING;
  ELSE
    INSERT INTO public.advisors_onboarding_tasks(
      engagement_id, code, title, description, sort_order, requires_document, document_label, assigned_advisor_id
    ) VALUES
      (_engagement_id, 'goals', 'Capture coaching goals', 'Priority outcomes for the coaching engagement.', 10, false, '', _advisor),
      (_engagement_id, 'availability', 'Confirm session availability', 'Preferred days, timezone and session length.', 20, false, '', _advisor),
      (_engagement_id, 'materials', 'Share current materials', 'Budgets, reports or process notes the coach should review.', 30, true, 'Current finance materials', _advisor),
      (_engagement_id, 'session_plan', 'Agree first-session plan', 'Agenda and success criteria for session one.', 40, false, '', _advisor),
      (_engagement_id, 'kickoff', 'Advisor kickoff', 'Confirm coaching cadence and communication channel.', 50, false, '', _advisor)
    ON CONFLICT (engagement_id, code) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_engagements(
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle text := lower(btrim(coalesce(_search, '')));
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('draft', 'proposed', 'accepted', 'onboarding', 'active', 'paused', 'closed') THEN
    RAISE EXCEPTION 'Unsupported engagement status filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
      private.advisors_engagement_json(e)
        || jsonb_build_object(
          'clientEmail', c.email,
          'clientName', c.name,
          'clientBusinessName', c.business_name,
          'proposalCount', (SELECT count(*)::int FROM public.advisors_proposals p WHERE p.engagement_id = e.id),
          'onboardingDone', (
            SELECT count(*)::int FROM public.advisors_onboarding_tasks t
            WHERE t.engagement_id = e.id AND t.status = 'done'
          ),
          'onboardingTotal', (
            SELECT count(*)::int FROM public.advisors_onboarding_tasks t
            WHERE t.engagement_id = e.id
          )
        )
      ORDER BY e.updated_at DESC
    )
    FROM (
      SELECT e.*
      FROM public.advisors_engagements e
      JOIN public.advisors_clients c ON c.id = e.client_id
      WHERE (_status IS NULL OR e.status = _status)
        AND (
          needle = ''
          OR lower(e.title) LIKE '%' || needle || '%'
          OR lower(c.email) LIKE '%' || needle || '%'
          OR lower(c.name) LIKE '%' || needle || '%'
          OR lower(c.business_name) LIKE '%' || needle || '%'
        )
      ORDER BY e.updated_at DESC
      LIMIT lim
    ) e
    JOIN public.advisors_clients c ON c.id = e.client_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_upsert_engagement(
  _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eng public.advisors_engagements;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF nullif(_payload->>'clientId', '') IS NULL THEN
    RAISE EXCEPTION 'Client is required' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(_payload->>'title'), '') IS NULL THEN
    RAISE EXCEPTION 'Engagement title is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_payload->>'serviceCode', '') NOT IN ('bookkeeping', 'coaching') THEN
    RAISE EXCEPTION 'Choose a valid Advisors service' USING ERRCODE = '22023';
  END IF;
  next_status := coalesce(nullif(_payload->>'status', ''), 'draft');
  IF next_status NOT IN ('draft', 'proposed', 'accepted', 'onboarding', 'active', 'paused', 'closed') THEN
    RAISE EXCEPTION 'Unsupported engagement status' USING ERRCODE = '22023';
  END IF;

  IF nullif(_payload->>'id', '') IS NOT NULL THEN
    UPDATE public.advisors_engagements
       SET client_id = (_payload->>'clientId')::uuid,
           assigned_advisor_id = nullif(_payload->>'assignedAdvisorId', '')::uuid,
           service_code = _payload->>'serviceCode',
           plan_code = nullif(_payload->>'planCode', ''),
           title = btrim(_payload->>'title'),
           status = next_status,
           currency = coalesce(nullif(_payload->>'currency', ''), currency),
           amount_minor = coalesce((_payload->>'amountMinor')::integer, amount_minor),
           billing_interval = nullif(_payload->>'billingInterval', ''),
           scope_summary = coalesce(_payload->>'scopeSummary', scope_summary),
           notes = coalesce(_payload->>'notes', notes),
           updated_at = now()
     WHERE id = (_payload->>'id')::uuid
     RETURNING * INTO eng;
    IF eng.id IS NULL THEN
      RAISE EXCEPTION 'Engagement not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.advisors_engagements(
      client_id, assigned_advisor_id, service_code, plan_code, title, status,
      currency, amount_minor, billing_interval, scope_summary, notes
    ) VALUES (
      (_payload->>'clientId')::uuid,
      nullif(_payload->>'assignedAdvisorId', '')::uuid,
      _payload->>'serviceCode',
      nullif(_payload->>'planCode', ''),
      btrim(_payload->>'title'),
      next_status,
      coalesce(nullif(_payload->>'currency', ''), 'USD'),
      coalesce((_payload->>'amountMinor')::integer, 0),
      nullif(_payload->>'billingInterval', ''),
      coalesce(_payload->>'scopeSummary', ''),
      coalesce(_payload->>'notes', '')
    )
    RETURNING * INTO eng;
  END IF;

  PERFORM private.platform_log('advisors.engagement.upsert', 'advisors_engagements', eng.id::text, NULL, _payload, _reason);
  RETURN private.advisors_engagement_json(eng);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_get_engagement(_engagement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eng public.advisors_engagements;
  client public.advisors_clients;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = _engagement_id;
  IF eng.id IS NULL THEN
    RAISE EXCEPTION 'Engagement not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO client FROM public.advisors_clients WHERE id = eng.client_id;
  RETURN private.advisors_engagement_json(eng)
    || jsonb_build_object(
      'clientEmail', client.email,
      'clientName', client.name,
      'clientBusinessName', client.business_name,
      'proposals', COALESCE((
        SELECT jsonb_agg(private.advisors_proposal_json(p) ORDER BY p.version_number DESC)
        FROM public.advisors_proposals p WHERE p.engagement_id = eng.id
      ), '[]'::jsonb),
      'agreements', COALESCE((
        SELECT jsonb_agg(private.advisors_agreement_json(a) ORDER BY a.version_number DESC)
        FROM public.advisors_agreements a WHERE a.engagement_id = eng.id
      ), '[]'::jsonb),
      'onboardingTasks', COALESCE((
        SELECT jsonb_agg(private.advisors_onboarding_task_json(t) ORDER BY t.sort_order, t.created_at)
        FROM public.advisors_onboarding_tasks t WHERE t.engagement_id = eng.id
      ), '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_upsert_proposal(
  _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eng public.advisors_engagements;
  proposal public.advisors_proposals;
  next_version integer;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = (_payload->>'engagementId')::uuid FOR UPDATE;
  IF eng.id IS NULL THEN
    RAISE EXCEPTION 'Engagement not found' USING ERRCODE = 'P0002';
  END IF;

  IF nullif(_payload->>'id', '') IS NOT NULL THEN
    UPDATE public.advisors_proposals
       SET title = coalesce(nullif(btrim(_payload->>'title'), ''), title),
           summary = coalesce(_payload->>'summary', summary),
           scope_text = coalesce(_payload->>'scopeText', scope_text),
           exclusions_text = coalesce(_payload->>'exclusionsText', exclusions_text),
           service_code = coalesce(nullif(_payload->>'serviceCode', ''), service_code),
           plan_code = CASE
             WHEN _payload ? 'planCode' THEN nullif(_payload->>'planCode', '')
             ELSE plan_code
           END,
           currency = coalesce(nullif(_payload->>'currency', ''), currency),
           amount_minor = coalesce((_payload->>'amountMinor')::integer, amount_minor),
           billing_interval = CASE
             WHEN _payload ? 'billingInterval' THEN nullif(_payload->>'billingInterval', '')
             ELSE billing_interval
           END,
           pricing_snapshot = coalesce(_payload->'pricingSnapshot', pricing_snapshot),
           valid_until = CASE
             WHEN _payload ? 'validUntil' AND nullif(_payload->>'validUntil', '') IS NULL THEN NULL
             WHEN nullif(_payload->>'validUntil', '') IS NOT NULL THEN (_payload->>'validUntil')::timestamptz
             ELSE valid_until
           END,
           updated_at = now()
     WHERE id = (_payload->>'id')::uuid AND engagement_id = eng.id AND status = 'draft'
     RETURNING * INTO proposal;
    IF proposal.id IS NULL THEN
      RAISE EXCEPTION 'Only draft proposals can be edited' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT coalesce(max(version_number), 0) + 1 INTO next_version
    FROM public.advisors_proposals WHERE engagement_id = eng.id;
    INSERT INTO public.advisors_proposals(
      engagement_id, version_number, public_token, title, summary, scope_text, exclusions_text,
      service_code, plan_code, currency, amount_minor, billing_interval, pricing_snapshot, valid_until
    ) VALUES (
      eng.id,
      next_version,
      private.advisors_new_public_token(),
      coalesce(nullif(btrim(_payload->>'title'), ''), eng.title || ' proposal'),
      coalesce(_payload->>'summary', eng.scope_summary),
      coalesce(_payload->>'scopeText', ''),
      coalesce(_payload->>'exclusionsText', ''),
      coalesce(nullif(_payload->>'serviceCode', ''), eng.service_code),
      coalesce(nullif(_payload->>'planCode', ''), eng.plan_code),
      coalesce(nullif(_payload->>'currency', ''), eng.currency),
      coalesce((_payload->>'amountMinor')::integer, eng.amount_minor),
      coalesce(nullif(_payload->>'billingInterval', ''), eng.billing_interval),
      coalesce(_payload->'pricingSnapshot', '{}'::jsonb),
      CASE WHEN nullif(_payload->>'validUntil', '') IS NULL THEN now() + interval '14 days'
           ELSE (_payload->>'validUntil')::timestamptz END
    )
    RETURNING * INTO proposal;
  END IF;

  PERFORM private.platform_log('advisors.proposal.upsert', 'advisors_proposals', proposal.id::text, NULL, _payload, _reason);
  RETURN private.advisors_proposal_json(proposal);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_send_proposal(
  _proposal_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal public.advisors_proposals;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_proposals
     SET status = 'sent',
         sent_at = coalesce(sent_at, now()),
         updated_at = now()
   WHERE id = _proposal_id AND status = 'draft'
   RETURNING * INTO proposal;
  IF proposal.id IS NULL THEN
    RAISE EXCEPTION 'Only draft proposals can be sent' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_engagements
     SET status = CASE WHEN status = 'draft' THEN 'proposed' ELSE status END,
         amount_minor = proposal.amount_minor,
         currency = proposal.currency,
         billing_interval = proposal.billing_interval,
         plan_code = coalesce(proposal.plan_code, plan_code),
         updated_at = now()
   WHERE id = proposal.engagement_id;
  PERFORM private.platform_log('advisors.proposal.send', 'advisors_proposals', proposal.id::text, NULL, private.advisors_proposal_json(proposal), _reason);
  RETURN private.advisors_proposal_json(proposal);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_get_proposal(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal public.advisors_proposals;
  eng public.advisors_engagements;
  client public.advisors_clients;
BEGIN
  SELECT * INTO proposal FROM public.advisors_proposals WHERE public_token = _token;
  IF proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF proposal.status = 'draft' THEN
    RAISE EXCEPTION 'Proposal is not available' USING ERRCODE = '42501';
  END IF;
  IF proposal.status = 'sent' AND proposal.valid_until IS NOT NULL AND proposal.valid_until < now() THEN
    UPDATE public.advisors_proposals SET status = 'expired', updated_at = now() WHERE id = proposal.id
    RETURNING * INTO proposal;
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = proposal.engagement_id;
  SELECT * INTO client FROM public.advisors_clients WHERE id = eng.client_id;
  RETURN private.advisors_proposal_json(proposal) || jsonb_build_object(
    'clientName', client.name,
    'clientEmail', client.email,
    'clientBusinessName', client.business_name,
    'engagementTitle', eng.title
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_respond_proposal(
  _token text, _decision text, _name text, _email text, _note text, _bucket text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal public.advisors_proposals;
  eng public.advisors_engagements;
  agreement public.advisors_agreements;
  next_agreement_version integer;
BEGIN
  PERFORM private.advisors_chat_rate_ok(coalesce(nullif(_bucket, ''), 'proposal:' || left(_token, 16)), 20);
  IF _decision NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'Choose accept or decline' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO proposal FROM public.advisors_proposals WHERE public_token = _token FOR UPDATE;
  IF proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF proposal.status <> 'sent' THEN
    RAISE EXCEPTION 'Proposal is not open for response' USING ERRCODE = '22023';
  END IF;
  IF proposal.valid_until IS NOT NULL AND proposal.valid_until < now() THEN
    UPDATE public.advisors_proposals SET status = 'expired', updated_at = now() WHERE id = proposal.id;
    RAISE EXCEPTION 'Proposal has expired' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Your name is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_proposals
     SET status = CASE WHEN _decision = 'accept' THEN 'accepted' ELSE 'declined' END,
         responded_at = now(),
         response_note = coalesce(_note, ''),
         updated_at = now()
   WHERE id = proposal.id
   RETURNING * INTO proposal;

  SELECT * INTO eng FROM public.advisors_engagements WHERE id = proposal.engagement_id FOR UPDATE;

  IF _decision = 'decline' THEN
    UPDATE public.advisors_engagements
       SET status = CASE WHEN status = 'proposed' THEN 'draft' ELSE status END,
           updated_at = now()
     WHERE id = eng.id;
    RETURN private.advisors_proposal_json(proposal);
  END IF;

  UPDATE public.advisors_engagements
     SET status = 'accepted',
         plan_code = coalesce(proposal.plan_code, plan_code),
         amount_minor = proposal.amount_minor,
         currency = proposal.currency,
         billing_interval = proposal.billing_interval,
         updated_at = now()
   WHERE id = eng.id;

  UPDATE public.advisors_clients
     SET status = CASE WHEN status = 'prospect' THEN 'active' ELSE status END,
         primary_service_code = coalesce(primary_service_code, proposal.service_code),
         name = CASE WHEN nullif(name, '') IS NULL THEN btrim(_name) ELSE name END,
         updated_at = now()
   WHERE id = eng.client_id;

  SELECT coalesce(max(version_number), 0) + 1 INTO next_agreement_version
  FROM public.advisors_agreements WHERE engagement_id = eng.id;

  INSERT INTO public.advisors_agreements(
    engagement_id, proposal_id, version_number, status, public_token, title, body_text, presented_at
  ) VALUES (
    eng.id,
    proposal.id,
    next_agreement_version,
    'presented',
    private.advisors_new_public_token(),
    proposal.title || ' — service agreement',
    private.advisors_default_agreement_body(
      proposal.service_code, proposal.plan_code, proposal.amount_minor, proposal.currency, proposal.billing_interval
    ),
    now()
  )
  RETURNING * INTO agreement;

  RETURN private.advisors_proposal_json(proposal) || jsonb_build_object(
    'agreementToken', agreement.public_token,
    'agreementId', agreement.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_get_agreement(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agreement public.advisors_agreements;
  eng public.advisors_engagements;
  client public.advisors_clients;
BEGIN
  SELECT * INTO agreement FROM public.advisors_agreements WHERE public_token = _token;
  IF agreement.id IS NULL THEN
    RAISE EXCEPTION 'Agreement not found' USING ERRCODE = 'P0002';
  END IF;
  IF agreement.status = 'draft' THEN
    RAISE EXCEPTION 'Agreement is not available' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = agreement.engagement_id;
  SELECT * INTO client FROM public.advisors_clients WHERE id = eng.client_id;
  RETURN private.advisors_agreement_json(agreement) || jsonb_build_object(
    'clientName', client.name,
    'clientEmail', client.email,
    'clientBusinessName', client.business_name,
    'engagementTitle', eng.title,
    'serviceCode', eng.service_code,
    'planCode', eng.plan_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_accept_agreement(
  _token text, _name text, _email text, _consent boolean, _bucket text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agreement public.advisors_agreements;
  eng public.advisors_engagements;
BEGIN
  PERFORM private.advisors_chat_rate_ok(coalesce(nullif(_bucket, ''), 'agreement:' || left(_token, 16)), 20);
  IF coalesce(_consent, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Explicit consent is required to accept the agreement' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Your full name is required' USING ERRCODE = '22023';
  END IF;
  IF position('@' in lower(btrim(coalesce(_email, '')))) = 0 THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO agreement FROM public.advisors_agreements WHERE public_token = _token FOR UPDATE;
  IF agreement.id IS NULL THEN
    RAISE EXCEPTION 'Agreement not found' USING ERRCODE = 'P0002';
  END IF;
  IF agreement.status = 'accepted' THEN
    RETURN private.advisors_agreement_json(agreement);
  END IF;
  IF agreement.status <> 'presented' THEN
    RAISE EXCEPTION 'Agreement is not open for acceptance' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_agreements
     SET status = 'accepted',
         accepted_at = now(),
         accepted_name = btrim(_name),
         accepted_email = lower(btrim(_email)),
         consent_at = now(),
         updated_at = now()
   WHERE id = agreement.id
   RETURNING * INTO agreement;

  SELECT * INTO eng FROM public.advisors_engagements WHERE id = agreement.engagement_id FOR UPDATE;
  UPDATE public.advisors_engagements
     SET status = 'onboarding',
         updated_at = now()
   WHERE id = eng.id;

  PERFORM private.advisors_seed_onboarding(eng.id, eng.service_code, eng.assigned_advisor_id);

  -- Explicitly does not create a subscription or capture payment (AD-07).
  RETURN private.advisors_agreement_json(agreement) || jsonb_build_object(
    'engagementStatus', 'onboarding',
    'subscriptionStarted', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_present_agreement(
  _engagement_id uuid, _proposal_id uuid, _title text, _body text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eng public.advisors_engagements;
  proposal_ref uuid;
  agreement public.advisors_agreements;
  next_version integer;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = _engagement_id FOR UPDATE;
  IF eng.id IS NULL THEN
    RAISE EXCEPTION 'Engagement not found' USING ERRCODE = 'P0002';
  END IF;
  proposal_ref := _proposal_id;
  IF proposal_ref IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.advisors_proposals p
      WHERE p.id = proposal_ref AND p.engagement_id = eng.id
    ) THEN
      RAISE EXCEPTION 'Proposal not found for engagement' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  SELECT coalesce(max(version_number), 0) + 1 INTO next_version
  FROM public.advisors_agreements WHERE engagement_id = eng.id;
  INSERT INTO public.advisors_agreements(
    engagement_id, proposal_id, version_number, status, public_token, title, body_text, presented_at
  ) VALUES (
    eng.id,
    proposal_ref,
    next_version,
    'presented',
    private.advisors_new_public_token(),
    coalesce(nullif(btrim(_title), ''), eng.title || ' — service agreement'),
    coalesce(nullif(_body, ''), private.advisors_default_agreement_body(
      eng.service_code, eng.plan_code, eng.amount_minor, eng.currency, eng.billing_interval
    )),
    now()
  )
  RETURNING * INTO agreement;
  PERFORM private.platform_log('advisors.agreement.present', 'advisors_agreements', agreement.id::text, NULL, private.advisors_agreement_json(agreement), _reason);
  RETURN private.advisors_agreement_json(agreement);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_set_onboarding_task(
  _task_id uuid, _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task public.advisors_onboarding_tasks;
  next_status text;
  remaining integer;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO task FROM public.advisors_onboarding_tasks WHERE id = _task_id FOR UPDATE;
  IF task.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding task not found' USING ERRCODE = 'P0002';
  END IF;
  next_status := coalesce(nullif(_payload->>'status', ''), task.status);
  IF next_status NOT IN ('pending', 'in_progress', 'blocked', 'done', 'skipped') THEN
    RAISE EXCEPTION 'Unsupported onboarding task status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_onboarding_tasks
     SET status = next_status,
         admin_note = coalesce(_payload->>'adminNote', admin_note),
         customer_note = coalesce(_payload->>'customerNote', customer_note),
         assigned_advisor_id = CASE
           WHEN _payload ? 'assignedAdvisorId' AND nullif(_payload->>'assignedAdvisorId', '') IS NULL THEN NULL
           WHEN nullif(_payload->>'assignedAdvisorId', '') IS NOT NULL THEN (_payload->>'assignedAdvisorId')::uuid
           ELSE assigned_advisor_id
         END,
         completed_at = CASE
           WHEN next_status IN ('done', 'skipped') THEN coalesce(completed_at, now())
           ELSE NULL
         END,
         updated_at = now()
   WHERE id = task.id
   RETURNING * INTO task;

  SELECT count(*)::int INTO remaining
  FROM public.advisors_onboarding_tasks
  WHERE engagement_id = task.engagement_id
    AND status NOT IN ('done', 'skipped');

  IF remaining = 0 THEN
    UPDATE public.advisors_engagements
       SET status = CASE WHEN status = 'onboarding' THEN 'active' ELSE status END,
           updated_at = now()
     WHERE id = task.engagement_id;
  END IF;

  PERFORM private.platform_log('advisors.onboarding.task', 'advisors_onboarding_tasks', task.id::text, NULL, _payload, _reason);
  RETURN private.advisors_onboarding_task_json(task);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_onboarding(
  _status text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('onboarding', 'active', 'accepted') THEN
    RAISE EXCEPTION 'Unsupported onboarding filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
      private.advisors_engagement_json(e)
        || jsonb_build_object(
          'clientEmail', c.email,
          'clientName', c.name,
          'onboardingDone', (
            SELECT count(*)::int FROM public.advisors_onboarding_tasks t
            WHERE t.engagement_id = e.id AND t.status IN ('done', 'skipped')
          ),
          'onboardingTotal', (
            SELECT count(*)::int FROM public.advisors_onboarding_tasks t
            WHERE t.engagement_id = e.id
          ),
          'tasks', COALESCE((
            SELECT jsonb_agg(private.advisors_onboarding_task_json(t) ORDER BY t.sort_order)
            FROM public.advisors_onboarding_tasks t WHERE t.engagement_id = e.id
          ), '[]'::jsonb)
        )
      ORDER BY e.updated_at DESC
    )
    FROM (
      SELECT e.*
      FROM public.advisors_engagements e
      WHERE e.status IN ('onboarding', 'active', 'accepted')
        AND (_status IS NULL OR e.status = _status)
        AND EXISTS (
          SELECT 1 FROM public.advisors_onboarding_tasks t WHERE t.engagement_id = e.id
        )
      ORDER BY e.updated_at DESC
      LIMIT lim
    ) e
    JOIN public.advisors_clients c ON c.id = e.client_id
  ), '[]'::jsonb);
END;
$$;

-- Extend overview with engagement metrics.
CREATE OR REPLACE FUNCTION public.platform_advisors_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'newInquiries', (SELECT count(*)::int FROM public.advisors_leads WHERE status = 'new'),
    'openConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'open'),
    'handedOffConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'handed_off'),
    'pendingConsultations', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed' AND starts_at >= now()
    ),
    'upcomingAppointments', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed'
        AND starts_at >= now()
        AND starts_at < now() + interval '7 days'
    ),
    'activeClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'active'),
    'prospectClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'prospect'),
    'activeAdvisors', (SELECT count(*)::int FROM public.advisors_staff WHERE is_active),
    'openProposals', (SELECT count(*)::int FROM public.advisors_proposals WHERE status = 'sent'),
    'onboardingEngagements', (SELECT count(*)::int FROM public.advisors_engagements WHERE status = 'onboarding'),
    'recentInquiries', COALESCE((
      SELECT jsonb_agg(private.advisors_lead_json(l) ORDER BY l.created_at DESC)
      FROM (
        SELECT * FROM public.advisors_leads ORDER BY created_at DESC LIMIT 8
      ) l
    ), '[]'::jsonb),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'startsAt', a.starts_at,
        'endsAt', a.ends_at,
        'customerName', a.customer_name,
        'customerEmail', a.customer_email,
        'businessName', a.business_name,
        'serviceCode', a.service_code
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE status = 'confirmed' AND starts_at >= now()
        ORDER BY starts_at
        LIMIT 8
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_advisors_list_engagements(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_upsert_engagement(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_get_engagement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_upsert_proposal(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_send_proposal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_get_proposal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_respond_proposal(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_get_agreement(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_accept_agreement(text, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_present_agreement(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_set_onboarding_task(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_onboarding(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.platform_advisors_list_engagements(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_upsert_engagement(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_get_engagement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_upsert_proposal(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_send_proposal(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_get_proposal(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_respond_proposal(text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_get_agreement(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_accept_agreement(text, text, text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_present_agreement(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_set_onboarding_task(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_onboarding(text, integer) TO authenticated, service_role;
