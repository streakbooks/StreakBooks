-- AD-02: Advisors catalogue admin — draft/publish, version history, audit.
-- Publishing updates the public catalogue for new visitors. It does not rewrite
-- existing customer subscriptions, agreements or invoices (those arrive in AD-07).

ALTER TABLE public.advisors_services
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_welcome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exclusions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.advisors_service_plans
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS transaction_limit integer,
  ADD COLUMN IF NOT EXISTS account_limit integer,
  ADD COLUMN IF NOT EXISTS sessions_included integer,
  ADD COLUMN IF NOT EXISTS annual_amount_minor integer,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.advisors_service_plans
    ADD CONSTRAINT advisors_service_plans_session_duration_check
    CHECK (session_duration_minutes IS NULL OR session_duration_minutes BETWEEN 15 AND 240);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.advisors_service_plans
    ADD CONSTRAINT advisors_service_plans_limits_check
    CHECK (
      (transaction_limit IS NULL OR transaction_limit >= 0)
      AND (account_limit IS NULL OR account_limit >= 0)
      AND (sessions_included IS NULL OR sessions_included >= 0)
      AND (annual_amount_minor IS NULL OR annual_amount_minor >= 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.advisors_service_plans SET
  transaction_limit = CASE code
    WHEN 'essential_books' THEN 100
    WHEN 'growth_books' THEN 300
    WHEN 'complete_books' THEN 600
    ELSE transaction_limit END,
  account_limit = CASE code
    WHEN 'essential_books' THEN 2
    WHEN 'growth_books' THEN 5
    WHEN 'complete_books' THEN 10
    ELSE account_limit END,
  session_duration_minutes = CASE
    WHEN service_code = 'coaching' THEN 45
    WHEN code = 'growth_books' THEN 30
    WHEN code = 'complete_books' THEN 60
    ELSE session_duration_minutes END,
  sessions_included = CASE code
    WHEN 'quick_guidance' THEN 1
    WHEN 'monthly_coaching' THEN 2
    WHEN 'business_coaching' THEN 4
    WHEN 'growth_books' THEN 1
    WHEN 'complete_books' THEN 1
    ELSE sessions_included END,
  annual_amount_minor = CASE
    WHEN cadence = 'month' THEN amount_minor * 10
    ELSE annual_amount_minor END
WHERE true;

UPDATE public.advisors_services SET
  exclusions = '[
    "Historical bookkeeping cleanup",
    "Tax return preparation and filing",
    "Statutory representation",
    "Payroll processing",
    "Complex inventory valuation",
    "Audits and assurance",
    "Extraordinary transaction volumes",
    "Specialized compliance services"
  ]'::jsonb,
  chat_welcome = CASE code
    WHEN 'bookkeeping' THEN 'Thanks for choosing bookkeeping support. I can help you pick a plan or book a free consultation.'
    WHEN 'coaching' THEN 'Thanks for choosing coaching. I can help you pick a session plan or book a free consultation.'
    ELSE chat_welcome END
WHERE chat_welcome = '' OR exclusions = '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.advisors_catalogue_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  label text NOT NULL DEFAULT '',
  payload jsonb NOT NULL,
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS advisors_catalogue_one_draft
  ON public.advisors_catalogue_versions ((status)) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS advisors_catalogue_one_published
  ON public.advisors_catalogue_versions ((status)) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS advisors_catalogue_versions_created_idx
  ON public.advisors_catalogue_versions (created_at DESC);

CREATE TABLE IF NOT EXISTS public.advisors_catalogue_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  version_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_catalogue_audit_created_idx
  ON public.advisors_catalogue_audit (created_at DESC);

ALTER TABLE public.advisors_catalogue_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_catalogue_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.advisors_catalogue_versions, public.advisors_catalogue_audit FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_catalogue_versions, public.advisors_catalogue_audit FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.advisors_immutable_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Advisors catalogue audit records are append-only' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS advisors_catalogue_audit_immutable ON public.advisors_catalogue_audit;
CREATE TRIGGER advisors_catalogue_audit_immutable
  BEFORE UPDATE OR DELETE ON public.advisors_catalogue_audit
  FOR EACH ROW EXECUTE FUNCTION private.advisors_immutable_audit();

CREATE OR REPLACE FUNCTION private.advisors_current_payload()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', s.code,
        'name', s.name,
        'headline', s.headline,
        'description', s.description,
        'ctaLabel', s.cta_label,
        'startingAmountMinor', s.starting_amount_minor,
        'currency', s.currency,
        'cadence', s.cadence,
        'startingLabel', s.starting_label,
        'benefits', s.benefits,
        'illustrationKey', s.illustration_key,
        'sortOrder', s.sort_order,
        'isPublished', s.is_published,
        'isEnabled', s.is_enabled,
        'chatWelcome', s.chat_welcome,
        'exclusions', s.exclusions,
        'plans', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', p.code,
            'serviceCode', p.service_code,
            'name', p.name,
            'audience', p.audience,
            'summary', p.summary,
            'amountMinor', p.amount_minor,
            'currency', p.currency,
            'cadence', p.cadence,
            'inclusions', p.inclusions,
            'sortOrder', p.sort_order,
            'isPublished', p.is_published,
            'isEnabled', p.is_enabled,
            'isArchived', p.is_archived,
            'sessionDurationMinutes', p.session_duration_minutes,
            'transactionLimit', p.transaction_limit,
            'accountLimit', p.account_limit,
            'sessionsIncluded', p.sessions_included,
            'annualAmountMinor', p.annual_amount_minor,
            'features', p.features
          ) ORDER BY p.sort_order)
          FROM public.advisors_service_plans p
          WHERE p.service_code = s.code
        ), '[]'::jsonb)
      ) ORDER BY s.sort_order)
      FROM public.advisors_services s
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_apply_payload(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc jsonb;
  pl jsonb;
  codes text[] := ARRAY[]::text[];
  plan_codes text[] := ARRAY[]::text[];
BEGIN
  IF _payload IS NULL OR jsonb_typeof(_payload->'services') <> 'array' THEN
    RAISE EXCEPTION 'Catalogue payload must include services[]' USING ERRCODE = '22023';
  END IF;

  FOR svc IN SELECT value FROM jsonb_array_elements(_payload->'services')
  LOOP
    IF coalesce(svc->>'code', '') NOT IN ('bookkeeping', 'coaching') THEN
      RAISE EXCEPTION 'Unsupported Advisors service code' USING ERRCODE = '22023';
    END IF;
    codes := array_append(codes, svc->>'code');
    INSERT INTO public.advisors_services AS t (
      code, name, headline, description, cta_label, starting_amount_minor, currency, cadence,
      starting_label, benefits, illustration_key, sort_order, is_published, is_enabled,
      chat_welcome, exclusions, updated_at
    ) VALUES (
      svc->>'code',
      coalesce(nullif(btrim(svc->>'name'), ''), svc->>'code'),
      coalesce(nullif(btrim(svc->>'headline'), ''), svc->>'name', svc->>'code'),
      coalesce(svc->>'description', ''),
      coalesce(nullif(btrim(svc->>'ctaLabel'), ''), 'Choose this service'),
      greatest(coalesce((svc->>'startingAmountMinor')::integer, 0), 0),
      coalesce(nullif(upper(svc->>'currency'), ''), 'USD'),
      CASE WHEN svc->>'cadence' = 'session' THEN 'session' ELSE 'month' END,
      coalesce(nullif(btrim(svc->>'startingLabel'), ''), 'See pricing'),
      coalesce(svc->'benefits', '[]'::jsonb),
      coalesce(nullif(svc->>'illustrationKey'), 'we-do-your-books'),
      coalesce((svc->>'sortOrder')::integer, 0),
      coalesce((svc->>'isPublished')::boolean, true),
      coalesce((svc->>'isEnabled')::boolean, true),
      coalesce(svc->>'chatWelcome', ''),
      coalesce(svc->'exclusions', '[]'::jsonb),
      now()
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      headline = EXCLUDED.headline,
      description = EXCLUDED.description,
      cta_label = EXCLUDED.cta_label,
      starting_amount_minor = EXCLUDED.starting_amount_minor,
      currency = EXCLUDED.currency,
      cadence = EXCLUDED.cadence,
      starting_label = EXCLUDED.starting_label,
      benefits = EXCLUDED.benefits,
      illustration_key = EXCLUDED.illustration_key,
      sort_order = EXCLUDED.sort_order,
      is_published = EXCLUDED.is_published,
      is_enabled = EXCLUDED.is_enabled,
      chat_welcome = EXCLUDED.chat_welcome,
      exclusions = EXCLUDED.exclusions,
      updated_at = now();

    FOR pl IN SELECT value FROM jsonb_array_elements(coalesce(svc->'plans', '[]'::jsonb))
    LOOP
      IF coalesce(nullif(btrim(pl->>'code'), ''), '') = '' THEN
        RAISE EXCEPTION 'Plan code is required' USING ERRCODE = '22023';
      END IF;
      plan_codes := array_append(plan_codes, pl->>'code');
      INSERT INTO public.advisors_service_plans AS t (
        code, service_code, name, audience, summary, amount_minor, currency, cadence,
        inclusions, sort_order, is_published, is_enabled, is_archived,
        session_duration_minutes, transaction_limit, account_limit, sessions_included,
        annual_amount_minor, features, updated_at
      ) VALUES (
        pl->>'code',
        svc->>'code',
        coalesce(nullif(btrim(pl->>'name'), ''), pl->>'code'),
        coalesce(pl->>'audience', ''),
        coalesce(pl->>'summary', ''),
        greatest(coalesce((pl->>'amountMinor')::integer, 0), 0),
        coalesce(nullif(upper(pl->>'currency'), ''), 'USD'),
        CASE WHEN pl->>'cadence' = 'session' THEN 'session' ELSE 'month' END,
        coalesce(pl->'inclusions', '[]'::jsonb),
        coalesce((pl->>'sortOrder')::integer, 0),
        coalesce((pl->>'isPublished')::boolean, true),
        coalesce((pl->>'isEnabled')::boolean, true),
        coalesce((pl->>'isArchived')::boolean, false),
        NULLIF(pl->>'sessionDurationMinutes', '')::integer,
        NULLIF(pl->>'transactionLimit', '')::integer,
        NULLIF(pl->>'accountLimit', '')::integer,
        NULLIF(pl->>'sessionsIncluded', '')::integer,
        NULLIF(pl->>'annualAmountMinor', '')::integer,
        coalesce(pl->'features', '[]'::jsonb),
        now()
      )
      ON CONFLICT (code) DO UPDATE SET
        service_code = EXCLUDED.service_code,
        name = EXCLUDED.name,
        audience = EXCLUDED.audience,
        summary = EXCLUDED.summary,
        amount_minor = EXCLUDED.amount_minor,
        currency = EXCLUDED.currency,
        cadence = EXCLUDED.cadence,
        inclusions = EXCLUDED.inclusions,
        sort_order = EXCLUDED.sort_order,
        is_published = EXCLUDED.is_published,
        is_enabled = EXCLUDED.is_enabled,
        is_archived = EXCLUDED.is_archived,
        session_duration_minutes = EXCLUDED.session_duration_minutes,
        transaction_limit = EXCLUDED.transaction_limit,
        account_limit = EXCLUDED.account_limit,
        sessions_included = EXCLUDED.sessions_included,
        annual_amount_minor = EXCLUDED.annual_amount_minor,
        features = EXCLUDED.features,
        updated_at = now();
    END LOOP;
  END LOOP;

  UPDATE public.advisors_service_plans
     SET is_archived = true, is_published = false, is_enabled = false, updated_at = now()
   WHERE NOT (code = ANY (plan_codes));

  UPDATE public.advisors_services
     SET is_published = false, is_enabled = false, updated_at = now()
   WHERE NOT (code = ANY (codes));
END;
$$;

CREATE OR REPLACE FUNCTION private.advisors_log(
  _action text, _version_id uuid, _before jsonb, _after jsonb, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.advisors_catalogue_audit(actor_user_id, action, version_id, before_state, after_state, reason)
  VALUES (auth.uid(), _action, _version_id, _before, _after, trim(_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_advisor_services()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.sort_order), '[]'::jsonb)
  FROM (
    SELECT
      svc.code,
      svc.name,
      svc.headline,
      svc.description,
      svc.cta_label AS "ctaLabel",
      svc.starting_amount_minor AS "startingAmountMinor",
      svc.currency,
      svc.cadence,
      svc.starting_label AS "startingLabel",
      svc.benefits,
      svc.illustration_key AS "illustrationKey",
      svc.sort_order AS "sortOrder",
      svc.exclusions,
      (
        SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_order), '[]'::jsonb)
        FROM (
          SELECT
            pl.code,
            pl.service_code AS "serviceCode",
            pl.name,
            pl.audience,
            pl.summary,
            pl.amount_minor AS "amountMinor",
            pl.currency,
            pl.cadence,
            pl.inclusions,
            pl.sort_order AS "sortOrder",
            pl.session_duration_minutes AS "sessionDurationMinutes",
            pl.transaction_limit AS "transactionLimit",
            pl.account_limit AS "accountLimit",
            pl.sessions_included AS "sessionsIncluded",
            pl.annual_amount_minor AS "annualAmountMinor"
          FROM public.advisors_service_plans pl
          WHERE pl.service_code = svc.code
            AND pl.is_published = true
            AND pl.is_enabled = true
            AND pl.is_archived = false
        ) p
      ) AS plans
    FROM public.advisors_services svc
    WHERE svc.is_published = true AND svc.is_enabled = true
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_catalogue_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role text;
BEGIN
  PERFORM private.require_platform('billing.view');
  role := public.platform_role();
  RETURN jsonb_build_object(
    'role', role,
    'live', private.advisors_current_payload(),
    'draft', (
      SELECT jsonb_build_object(
        'id', v.id,
        'versionNumber', v.version_number,
        'status', v.status,
        'label', v.label,
        'payload', v.payload,
        'updatedAt', v.updated_at
      )
      FROM public.advisors_catalogue_versions v
      WHERE v.status = 'draft'
      LIMIT 1
    ),
    'versions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id,
        'versionNumber', v.version_number,
        'status', v.status,
        'label', v.label,
        'publishedAt', v.published_at,
        'createdAt', v.created_at,
        'updatedAt', v.updated_at
      ) ORDER BY v.version_number DESC)
      FROM public.advisors_catalogue_versions v
    ), '[]'::jsonb),
    'audit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'versionId', a.version_id,
        'reason', a.reason,
        'createdAt', a.created_at,
        'actorUserId', a.actor_user_id
      ) ORDER BY a.created_at DESC)
      FROM (
        SELECT * FROM public.advisors_catalogue_audit ORDER BY created_at DESC LIMIT 50
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_save_draft(
  _payload jsonb, _label text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft public.advisors_catalogue_versions;
  next_no integer;
  before_state jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF jsonb_typeof(_payload->'services') <> 'array' OR jsonb_array_length(_payload->'services') < 1 THEN
    RAISE EXCEPTION 'Save at least one Advisors service in the draft' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO draft FROM public.advisors_catalogue_versions WHERE status = 'draft' LIMIT 1;
  before_state := CASE WHEN draft.id IS NULL THEN NULL ELSE draft.payload END;

  IF draft.id IS NULL THEN
    SELECT coalesce(max(version_number), 0) + 1 INTO next_no FROM public.advisors_catalogue_versions;
    INSERT INTO public.advisors_catalogue_versions(version_number, status, label, payload, created_by)
    VALUES (next_no, 'draft', coalesce(nullif(btrim(_label), ''), format('Draft %s', next_no)), _payload, auth.uid())
    RETURNING * INTO draft;
  ELSE
    UPDATE public.advisors_catalogue_versions
       SET payload = _payload,
           label = coalesce(nullif(btrim(_label), ''), label),
           updated_at = now()
     WHERE id = draft.id
     RETURNING * INTO draft;
  END IF;

  PERFORM private.advisors_log('save_draft', draft.id, before_state, draft.payload, _reason);
  RETURN jsonb_build_object(
    'id', draft.id,
    'versionNumber', draft.version_number,
    'status', draft.status,
    'label', draft.label,
    'payload', draft.payload,
    'updatedAt', draft.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_publish_draft(_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft public.advisors_catalogue_versions;
  published public.advisors_catalogue_versions;
  before_live jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  SELECT * INTO draft FROM public.advisors_catalogue_versions WHERE status = 'draft' LIMIT 1;
  IF draft.id IS NULL THEN
    RAISE EXCEPTION 'Save a draft before publishing' USING ERRCODE = 'P0002';
  END IF;

  before_live := private.advisors_current_payload();
  PERFORM private.advisors_apply_payload(draft.payload);

  UPDATE public.advisors_catalogue_versions
     SET status = 'archived', updated_at = now()
   WHERE status = 'published';

  UPDATE public.advisors_catalogue_versions
     SET status = 'published',
         published_by = auth.uid(),
         published_at = now(),
         updated_at = now()
   WHERE id = draft.id
   RETURNING * INTO published;

  PERFORM private.advisors_log('publish', published.id, before_live, published.payload, _reason);
  RETURN jsonb_build_object(
    'id', published.id,
    'versionNumber', published.version_number,
    'status', published.status,
    'publishedAt', published.published_at,
    'note', 'Published catalogue applies to new Advisors visitors. Existing subscriptions and invoices are unchanged.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_restore_version(
  _version_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source public.advisors_catalogue_versions;
BEGIN
  PERFORM private.require_platform('billing.manage');
  SELECT * INTO source FROM public.advisors_catalogue_versions WHERE id = _version_id;
  IF source.id IS NULL THEN
    RAISE EXCEPTION 'Catalogue version not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.platform_advisors_save_draft(
    source.payload,
    format('Restored from v%s', source.version_number),
    _reason
  );
END;
$$;

-- Seed an initial published version snapshot from the live AD-01 catalogue.
INSERT INTO public.advisors_catalogue_versions(version_number, status, label, payload, published_at, published_by)
SELECT 1, 'published', 'AD-01 initial catalogue', private.advisors_current_payload(), now(), NULL
WHERE NOT EXISTS (SELECT 1 FROM public.advisors_catalogue_versions);

REVOKE ALL ON FUNCTION public.platform_advisors_catalogue_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_save_draft(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_publish_draft(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_restore_version(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_advisors_catalogue_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_save_draft(jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_publish_draft(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_restore_version(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_advisor_services() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_advisor_services() TO anon, authenticated;
