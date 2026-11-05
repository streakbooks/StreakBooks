-- Pre-billing-platform subscription stack (plans, versions, limits, prices, subscriptions and the
-- entitlement engine) as deployed before the billing platform series, for the isolated billing
-- suite. Loaded after baseline.sql. Function bodies are verbatim; foreign keys, policies, grants
-- and unrelated triggers are omitted. Catalogue rows carry no user or provider identifiers.


CREATE TYPE public.firm_access_level AS ENUM ('view', 'bookkeep', 'full');

CREATE TABLE private.platform_request_buckets (
    user_id uuid NOT NULL,
    minute timestamp with time zone NOT NULL,
    requests integer NOT NULL
);

CREATE TABLE public.billing_checkouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plan_code text NOT NULL,
    billing_interval text NOT NULL,
    provider text NOT NULL,
    currency character(3) NOT NULL,
    unit_amount_minor integer NOT NULL,
    offer_code text,
    status text DEFAULT 'open'::text NOT NULL,
    provider_session_id text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_checkouts_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text]))),
    CONSTRAINT billing_checkouts_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'razorpay'::text]))),
    CONSTRAINT billing_checkouts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'complete'::text, 'expired'::text]))),
    CONSTRAINT billing_checkouts_unit_amount_minor_check CHECK ((unit_amount_minor >= 0))
);

CREATE TABLE public.billing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    provider text NOT NULL,
    event_id text,
    event_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.billing_features (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'module'::text NOT NULL,
    module text DEFAULT 'accounting'::text NOT NULL,
    metering text DEFAULT 'none'::text NOT NULL,
    cost_tag text,
    catalogue_status text DEFAULT 'live'::text NOT NULL,
    default_enabled boolean DEFAULT true NOT NULL,
    version_no integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.billing_plans (
    code text NOT NULL,
    name text NOT NULL,
    audience text NOT NULL,
    summary text NOT NULL,
    monthly_gbp integer NOT NULL,
    monthly_usd integer NOT NULL,
    monthly_inr integer NOT NULL,
    users_included integer NOT NULL,
    invoices_per_month integer,
    bills_per_month integer,
    multi_currency boolean DEFAULT false NOT NULL,
    highlights jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_plans_bills_per_month_check CHECK (((bills_per_month IS NULL) OR (bills_per_month >= 0))),
    CONSTRAINT billing_plans_invoices_per_month_check CHECK (((invoices_per_month IS NULL) OR (invoices_per_month >= 0))),
    CONSTRAINT billing_plans_monthly_gbp_check CHECK ((monthly_gbp >= 0)),
    CONSTRAINT billing_plans_monthly_inr_check CHECK ((monthly_inr >= 0)),
    CONSTRAINT billing_plans_monthly_usd_check CHECK ((monthly_usd >= 0)),
    CONSTRAINT billing_plans_users_included_check CHECK ((users_included >= 1))
);

CREATE TABLE public.billing_settings (
    id boolean DEFAULT true NOT NULL,
    trial_days integer DEFAULT 30 NOT NULL,
    trial_plan_code text DEFAULT 'standard'::text NOT NULL,
    annual_free_months integer DEFAULT 2 NOT NULL,
    past_due_grace_days integer DEFAULT 7 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    card_required boolean DEFAULT false NOT NULL,
    require_owner_approval boolean DEFAULT true NOT NULL,
    CONSTRAINT billing_settings_annual_free_months_check CHECK (((annual_free_months >= 0) AND (annual_free_months <= 11))),
    CONSTRAINT billing_settings_id_check CHECK (id),
    CONSTRAINT billing_settings_past_due_grace_days_check CHECK (((past_due_grace_days >= 0) AND (past_due_grace_days <= 60))),
    CONSTRAINT billing_settings_trial_days_check CHECK (((trial_days >= 0) AND (trial_days <= 365)))
);

CREATE TABLE public.company_subscriptions (
    company_id uuid NOT NULL,
    plan_code text NOT NULL,
    status text NOT NULL,
    billing_interval text DEFAULT 'month'::text NOT NULL,
    provider text DEFAULT 'none'::text NOT NULL,
    provider_customer_id text,
    provider_subscription_id text,
    trial_started_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    offer_code text,
    currency character(3) DEFAULT 'GBP'::bpchar NOT NULL,
    unit_amount_minor integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_version_id uuid,
    grandfathered boolean DEFAULT true NOT NULL,
    scheduled_plan_code text,
    scheduled_at timestamp with time zone,
    read_only_until timestamp with time zone,
    paused_at timestamp with time zone,
    price_lock_until timestamp with time zone,
    started_at timestamp with time zone,
    CONSTRAINT company_subscriptions_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text]))),
    CONSTRAINT company_subscriptions_provider_check CHECK ((provider = ANY (ARRAY['none'::text, 'stripe'::text, 'razorpay'::text]))),
    CONSTRAINT company_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'expired'::text, 'complimentary'::text, 'paused'::text])))
);

CREATE TABLE public.email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    template text NOT NULL,
    to_addresses text[] NOT NULL,
    subject text NOT NULL,
    provider text NOT NULL,
    provider_message_id text,
    status text NOT NULL,
    error text,
    sent_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_outbox_recipients CHECK (((cardinality(to_addresses) >= 1) AND (cardinality(to_addresses) <= 10))),
    CONSTRAINT email_outbox_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);

CREATE TABLE public.entitlement_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feature_key text NOT NULL,
    scope text NOT NULL,
    scope_id uuid,
    plan_code text,
    source text NOT NULL,
    effect text NOT NULL,
    limit_value bigint,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    reason text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    approval_status text DEFAULT 'approved'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entitlement_overrides_approval_status_check CHECK ((approval_status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT entitlement_overrides_check CHECK (((expires_at IS NULL) OR (starts_at IS NULL) OR (expires_at > starts_at))),
    CONSTRAINT entitlement_overrides_check1 CHECK ((((scope = ANY (ARRAY['user'::text, 'business'::text, 'firm'::text])) AND (scope_id IS NOT NULL)) OR ((scope = 'plan'::text) AND (plan_code IS NOT NULL)) OR (scope = 'global'::text))),
    CONSTRAINT entitlement_overrides_effect_check CHECK ((effect = ANY (ARRAY['allow'::text, 'deny'::text]))),
    CONSTRAINT entitlement_overrides_reason_check CHECK ((length(TRIM(BOTH FROM reason)) >= 3)),
    CONSTRAINT entitlement_overrides_scope_check CHECK ((scope = ANY (ARRAY['user'::text, 'business'::text, 'firm'::text, 'plan'::text, 'global'::text]))),
    CONSTRAINT entitlement_overrides_source_check CHECK ((source = ANY (ARRAY['kill_switch'::text, 'suspension'::text, 'revoke'::text, 'grant'::text, 'addon'::text, 'trial'::text, 'plan'::text, 'default'::text])))
);

CREATE TABLE public.feature_rollouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feature_key text NOT NULL,
    mode text NOT NULL,
    percent integer DEFAULT 100 NOT NULL,
    allowlist uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    target_region text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    reason text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feature_rollouts_mode_check CHECK ((mode = ANY (ARRAY['immediate'::text, 'scheduled'::text, 'percentage'::text, 'allowlist'::text, 'internal'::text, 'trial'::text, 'region'::text, 'killed'::text]))),
    CONSTRAINT feature_rollouts_percent_check CHECK (((percent >= 0) AND (percent <= 100))),
    CONSTRAINT feature_rollouts_reason_check CHECK ((length(TRIM(BOTH FROM reason)) >= 3))
);

CREATE TABLE public.firm_client_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    firm_id uuid NOT NULL,
    company_id uuid NOT NULL,
    access_level public.firm_access_level DEFAULT 'view'::public.firm_access_level NOT NULL,
    linked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);

CREATE TABLE public.plan_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    currency character(3) NOT NULL,
    billing_interval text NOT NULL,
    amount_minor integer NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    stripe_price_id text,
    archived_at timestamp with time zone,
    CONSTRAINT plan_prices_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT plan_prices_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text])))
);

CREATE TABLE public.plan_version_limits (
    version_id uuid NOT NULL,
    feature_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    limit_value bigint
);

CREATE TABLE public.plan_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_code text NOT NULL,
    version_no integer NOT NULL,
    status text NOT NULL,
    name text NOT NULL,
    audience text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    badge text,
    sort_order integer DEFAULT 0 NOT NULL,
    visibility text DEFAULT 'live'::text NOT NULL,
    effective_from timestamp with time zone,
    published_at timestamp with time zone,
    created_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT plan_versions_visibility_check CHECK ((visibility = ANY (ARRAY['draft'::text, 'live'::text, 'hidden'::text])))
);

CREATE TABLE public.platform_audit (
    id bigint NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    reason text NOT NULL,
    session_id uuid,
    request_ip text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    prev_hash text,
    row_hash text
);

ALTER TABLE public.platform_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.platform_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.platform_tenant_controls (
    company_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    storage_quota_bytes bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_tenant_controls_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'archived'::text]))),
    CONSTRAINT platform_tenant_controls_storage_quota_bytes_check CHECK ((storage_quota_bytes >= 0))
);

ALTER TABLE ONLY private.platform_request_buckets
    ADD CONSTRAINT platform_request_buckets_pkey PRIMARY KEY (user_id, minute);

ALTER TABLE ONLY public.billing_checkouts
    ADD CONSTRAINT billing_checkouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_features
    ADD CONSTRAINT billing_features_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.billing_settings
    ADD CONSTRAINT billing_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.company_subscriptions
    ADD CONSTRAINT company_subscriptions_pkey PRIMARY KEY (company_id);

ALTER TABLE ONLY public.email_outbox
    ADD CONSTRAINT email_outbox_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.entitlement_overrides
    ADD CONSTRAINT entitlement_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feature_rollouts
    ADD CONSTRAINT feature_rollouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.firm_client_links
    ADD CONSTRAINT firm_client_links_firm_id_company_id_key UNIQUE (firm_id, company_id);

ALTER TABLE ONLY public.firm_client_links
    ADD CONSTRAINT firm_client_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plan_prices
    ADD CONSTRAINT plan_prices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plan_prices
    ADD CONSTRAINT plan_prices_version_id_currency_billing_interval_key UNIQUE (version_id, currency, billing_interval);

ALTER TABLE ONLY public.plan_version_limits
    ADD CONSTRAINT plan_version_limits_pkey PRIMARY KEY (version_id, feature_key);

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_plan_code_version_no_key UNIQUE (plan_code, version_no);

ALTER TABLE ONLY public.platform_audit
    ADD CONSTRAINT platform_audit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_tenant_controls
    ADD CONSTRAINT platform_tenant_controls_pkey PRIMARY KEY (company_id);

CREATE INDEX platform_request_buckets_minute ON private.platform_request_buckets USING btree (minute);

CREATE INDEX billing_checkouts_company_idx ON public.billing_checkouts USING btree (company_id, created_at DESC);

CREATE UNIQUE INDEX billing_events_provider_event_uidx ON public.billing_events USING btree (provider, event_id) WHERE (event_id IS NOT NULL);

CREATE INDEX email_outbox_company_idx ON public.email_outbox USING btree (company_id, created_at DESC);

CREATE INDEX email_outbox_entity_idx ON public.email_outbox USING btree (company_id, entity_type, entity_id, created_at DESC);

CREATE INDEX entitlement_overrides_lookup ON public.entitlement_overrides USING btree (feature_key, scope, scope_id) WHERE (approval_status = 'approved'::text);

CREATE INDEX firm_client_links_company_idx ON public.firm_client_links USING btree (company_id);

CREATE INDEX plan_versions_published_idx ON public.plan_versions USING btree (plan_code) WHERE (status = 'published'::text);

CREATE INDEX platform_audit_date ON public.platform_audit USING btree (created_at DESC);

CREATE INDEX platform_audit_entity ON public.platform_audit USING btree (entity_type, entity_id, created_at DESC);

CREATE TABLE private.platform_job_schedules (
    kind text NOT NULL,
    interval_seconds integer NOT NULL,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_job_schedules_interval_seconds_check CHECK (((interval_seconds >= 60) AND (interval_seconds <= 86400))),
    CONSTRAINT platform_job_schedules_kind_check CHECK ((kind = ANY (ARRAY['expire_support'::text, 'check_operations'::text])))
);

CREATE TABLE private.platform_worker_state (
    singleton boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    last_jobs integer,
    error_code text,
    CONSTRAINT platform_worker_state_singleton_check CHECK (singleton)
);

CREATE TABLE public.platform_job_runs (
    id bigint NOT NULL,
    job_id uuid NOT NULL,
    attempt integer NOT NULL,
    started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    error_code text,
    result jsonb,
    CONSTRAINT platform_job_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);

ALTER TABLE public.platform_job_runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.platform_job_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.platform_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text,
    origin text DEFAULT 'operator'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    last_error text,
    result jsonb,
    row_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT platform_jobs_actor CHECK (((created_by IS NOT NULL) OR (origin = 'schedule'::text))),
    CONSTRAINT platform_jobs_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT platform_jobs_kind_check CHECK ((kind = ANY (ARRAY['expire_support'::text, 'check_operations'::text]))),
    CONSTRAINT platform_jobs_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 30))),
    CONSTRAINT platform_jobs_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 80))),
    CONSTRAINT platform_jobs_origin_check CHECK ((origin = ANY (ARRAY['operator'::text, 'schedule'::text]))),
    CONSTRAINT platform_jobs_row_version_check CHECK ((row_version > 0)),
    CONSTRAINT platform_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY private.platform_job_schedules
    ADD CONSTRAINT platform_job_schedules_pkey PRIMARY KEY (kind);

ALTER TABLE ONLY private.platform_worker_state
    ADD CONSTRAINT platform_worker_state_pkey PRIMARY KEY (singleton);

ALTER TABLE ONLY public.platform_job_runs
    ADD CONSTRAINT platform_job_runs_job_id_attempt_key UNIQUE (job_id, attempt);

ALTER TABLE ONLY public.platform_job_runs
    ADD CONSTRAINT platform_job_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_jobs
    ADD CONSTRAINT platform_jobs_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX platform_jobs_one_queued ON public.platform_jobs USING btree (name) WHERE (status = 'queued'::text);

CREATE INDEX platform_jobs_ready ON public.platform_jobs USING btree (next_run_at, created_at) WHERE ((status = 'queued'::text) AND (kind IS NOT NULL));

-- Reduced stubs for objects outside the subscription stack.
CREATE FUNCTION private.platform_session_ok() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
CREATE FUNCTION private.platform_expire_support_jobs() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION private.platform_check_operations() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE public.sales_invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.purchase_bills (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.document_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, size_bytes bigint NOT NULL DEFAULT 0);
CREATE TABLE public.usage_counters (company_id uuid NOT NULL, metric text NOT NULL, period_start date NOT NULL, quantity bigint NOT NULL DEFAULT 0, PRIMARY KEY (company_id, metric, period_start));

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT private.customer_access_ok() AND (
 EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=auth.uid() AND status='active')
 OR (private.scoped_permission(_company_id,'company.view') AND private.scoped_permission(_company_id,'accounting.view')));
$function$
;

CREATE OR REPLACE FUNCTION public.platform_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT role FROM public.platform_roles WHERE user_id=auth.uid()
 AND auth.jwt()->>'aal'='aal2' AND private.platform_session_ok();
$function$
;

CREATE OR REPLACE FUNCTION public.rollout_decision(_mode text, _percent integer, _organisation text, _company_id uuid, _feature text, _allowlist uuid[], _region text, _target_region text, _trialing boolean, _starts timestamp with time zone, _ends timestamp with time zone, _now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  bucket integer;
  percent integer;
BEGIN
  IF _ends IS NOT NULL AND _ends <= _now THEN
    RETURN jsonb_build_object('included', true, 'reason', 'Rollout has ended and no longer gates the feature.');
  END IF;
  IF _mode = 'killed' THEN
    RETURN jsonb_build_object('included', false, 'reason', 'Global kill switch.');
  END IF;
  IF _mode = 'scheduled' THEN
    IF _starts IS NOT NULL AND _starts > _now THEN
      RETURN jsonb_build_object('included', false, 'reason', 'Rollout has not started.');
    END IF;
    RETURN jsonb_build_object('included', true, 'reason', 'Scheduled window is open.');
  END IF;
  IF _mode = 'percentage' THEN
    bucket := public.rollout_bucket(_organisation, _feature);
    percent := least(100, greatest(0, coalesce(_percent, 0)));
    IF bucket < percent THEN
      RETURN jsonb_build_object('included', true, 'reason', 'Bucket ' || bucket || ' is inside ' || percent || '%.');
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', 'Bucket ' || bucket || ' is outside ' || percent || '%.');
  END IF;
  IF _mode IN ('allowlist', 'internal') THEN
    IF _company_id = ANY(coalesce(_allowlist, '{}')) THEN
      RETURN jsonb_build_object('included', true, 'reason', CASE WHEN _mode = 'internal' THEN 'Internal group.' ELSE 'Organisation is on the allowlist.' END);
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', CASE WHEN _mode = 'internal' THEN 'Not an internal organisation.' ELSE 'Organisation is not on the allowlist.' END);
  END IF;
  IF _mode = 'trial' THEN
    IF _trialing THEN
      RETURN jsonb_build_object('included', true, 'reason', 'Trial organisation.');
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', 'Not on a trial.');
  END IF;
  IF _mode = 'region' THEN
    IF _region IS NOT NULL AND _region = _target_region THEN
      RETURN jsonb_build_object('included', true, 'reason', 'Region ' || _region || '.');
    END IF;
    RETURN jsonb_build_object('included', false, 'reason', 'Region does not match.');
  END IF;
  IF _mode = 'immediate' THEN
    RETURN jsonb_build_object('included', true, 'reason', 'Immediate rollout.');
  END IF;
  RETURN jsonb_build_object('included', false, 'reason', 'Unknown rollout mode.');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.winning_entitlements(_company_id uuid, _user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan text;
  _version uuid;
  _result jsonb;
  _region text;
  _trialing boolean;
  _patch record;
  _roll public.feature_rollouts%ROWTYPE;
  _decision jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(_company_id) AND public.platform_role() IS NULL THEN
    RAISE EXCEPTION 'You do not have access to that organisation.';
  END IF;
  SELECT plan_code, price_version_id INTO _plan, _version
  FROM public.company_subscriptions WHERE company_id = _company_id;
  IF _version IS NULL AND _plan IS NOT NULL THEN
    SELECT id INTO _version FROM public.plan_versions
    WHERE plan_code = _plan AND status = 'published'
    ORDER BY version_no DESC LIMIT 1;
  END IF;
  SELECT coalesce(jsonb_object_agg(feature_key, jsonb_build_object(
    'allowed', effect = 'allow',
    'source', source,
    'scope', scope,
    'reason', reason,
    'limit', limit_value
  )), '{}'::jsonb)
  INTO _result
  FROM (
    SELECT DISTINCT ON (feature_key)
      feature_key, effect, source, scope, reason, limit_value
    FROM (
      SELECT o.feature_key, o.effect, o.source, o.scope, o.reason, o.limit_value,
        CASE o.source
          WHEN 'kill_switch' THEN 1 WHEN 'suspension' THEN 2 WHEN 'revoke' THEN 3
          WHEN 'grant' THEN 4 WHEN 'addon' THEN 5 WHEN 'trial' THEN 6 WHEN 'plan' THEN 7 ELSE 8
        END AS source_rank,
        CASE o.scope
          WHEN 'user' THEN 1 WHEN 'business' THEN 2 WHEN 'firm' THEN 3 WHEN 'plan' THEN 4 ELSE 5
        END AS scope_rank
      FROM public.entitlement_overrides o
      WHERE o.approval_status = 'approved'
        AND (o.starts_at IS NULL OR o.starts_at <= now())
        AND (o.expires_at IS NULL OR o.expires_at > now())
        AND (
          o.scope = 'global'
          OR (o.scope = 'plan' AND o.plan_code = _plan)
          OR (o.scope = 'business' AND o.scope_id = _company_id)
          OR (o.scope = 'user' AND _user_id IS NOT NULL AND o.scope_id = _user_id)
          OR (o.scope = 'firm' AND o.scope_id IN (
            SELECT l.firm_id FROM public.firm_client_links l
            WHERE l.company_id = _company_id AND l.revoked_at IS NULL
          ))
        )
      UNION ALL
      SELECT l.feature_key,
        CASE WHEN l.enabled THEN 'allow' ELSE 'deny' END,
        'plan', 'plan', 'Included on the subscribed plan version.', l.limit_value,
        7, 4
      FROM public.plan_version_limits l
      WHERE l.version_id = _version
      UNION ALL
      SELECT f.key, 'deny', 'suspension', 'business',
        'The business is suspended. Records stay available to read.', NULL::bigint,
        2, 2
      FROM public.billing_features f
      WHERE EXISTS (
        SELECT 1 FROM public.platform_tenant_controls t
        WHERE t.company_id = _company_id AND t.status = 'suspended'
      )
      UNION ALL
      SELECT r.feature_key, 'deny', 'kill_switch', 'global', 'Global kill switch.', NULL::bigint, 1, 5
      FROM public.feature_rollouts r
      WHERE r.mode = 'killed' AND (r.ends_at IS NULL OR r.ends_at > now())
      UNION ALL
      SELECT f.key,
        CASE WHEN f.default_enabled THEN 'allow' ELSE 'deny' END,
        'default', 'global', 'Catalogue default.', NULL::bigint,
        8, 5
      FROM public.billing_features f
    ) candidates
    ORDER BY feature_key, source_rank, scope_rank, CASE effect WHEN 'deny' THEN 0 ELSE 1 END
  ) winners;

  SELECT c.country_code INTO _region FROM public.companies c WHERE c.id = _company_id;
  SELECT s.status = 'trialing' AND s.trial_ends_at > now() INTO _trialing
  FROM public.company_subscriptions s WHERE s.company_id = _company_id;
  _trialing := coalesce(_trialing, false);

  FOR _patch IN SELECT key AS feature_key, value AS decision FROM jsonb_each(_result)
  LOOP
    IF (_patch.decision ->> 'allowed') IS DISTINCT FROM 'true' THEN CONTINUE; END IF;
    IF (_patch.decision ->> 'source') NOT IN ('plan', 'default') THEN CONTINUE; END IF;
    SELECT * INTO _roll FROM public.feature_rollouts r
    WHERE r.feature_key = _patch.feature_key
    ORDER BY r.created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    _decision := public.rollout_decision(
      _roll.mode, _roll.percent, _company_id::text, _company_id, _patch.feature_key, _roll.allowlist,
      _region, _roll.target_region, _trialing, _roll.starts_at, _roll.ends_at, now()
    );
    IF (_decision ->> 'included') = 'true' THEN CONTINUE; END IF;
    _result := jsonb_set(_result, ARRAY[_patch.feature_key], jsonb_build_object(
      'allowed', false,
      'source', _patch.decision ->> 'source',
      'scope', _patch.decision ->> 'scope',
      'reason', _decision ->> 'reason',
      'limit', _patch.decision -> 'limit'
    ));
  END LOOP;
  RETURN _result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_entitlements(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _version uuid;
  _access text;
  _decisions jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(_company_id) AND public.platform_role() IS NULL THEN
    RAISE EXCEPTION 'You do not have access to that organisation.';
  END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id;
  _access := CASE WHEN public.subscription_allows_posting(_company_id) THEN 'full' ELSE 'read_only' END;
  _version := _sub.price_version_id;
  IF _version IS NULL AND _sub.plan_code IS NOT NULL THEN
    SELECT id INTO _version FROM public.plan_versions
    WHERE plan_code = _sub.plan_code AND status = 'published'
    ORDER BY version_no DESC LIMIT 1;
  END IF;
  _decisions := public.winning_entitlements(_company_id, auth.uid());
  RETURN jsonb_build_object(
    'access', _access,
    'planCode', _sub.plan_code,
    'versionId', _version,
    'limits', COALESCE((
      SELECT jsonb_object_agg(key, (value ->> 'limit')::bigint)
      FROM jsonb_each(_decisions)
      WHERE (value ->> 'allowed')::boolean AND value ->> 'limit' IS NOT NULL
    ), '{}'::jsonb),
    'features', COALESCE((
      SELECT jsonb_object_agg(key, (value ->> 'allowed')::boolean)
      FROM jsonb_each(_decisions)
    ), '{}'::jsonb),
    'decisions', _decisions,
    'usage', jsonb_build_object(
      'invoices', (SELECT count(*) FROM public.sales_invoices WHERE company_id = _company_id AND created_at >= date_trunc('month', now())),
      'bills', (SELECT count(*) FROM public.purchase_bills WHERE company_id = _company_id AND created_at >= date_trunc('month', now())),
      'users', (SELECT count(*) FROM public.company_members WHERE company_id = _company_id AND status = 'active' AND role <> 'accountant'),
      'accountant_seats', (SELECT count(*) FROM public.company_members WHERE company_id = _company_id AND status = 'active' AND role = 'accountant'),
      'storage_bytes', COALESCE((SELECT sum(size_bytes) FROM public.document_attachments WHERE company_id = _company_id), 0),
      'ai_queries', COALESCE((SELECT quantity FROM public.usage_counters WHERE company_id = _company_id AND metric = 'ai_queries' AND period_start = date_trunc('month', now())::date), 0)
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.subscription_allows_posting(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.is_demo) THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.company_subscriptions s WHERE s.company_id = _company_id) THEN false
    ELSE COALESCE((
      SELECT CASE
        WHEN s.status = 'complimentary' THEN true
        WHEN s.status = 'paused' THEN false
        WHEN s.status IN ('cancelled', 'expired') THEN false
        WHEN s.status = 'trialing' AND s.trial_ends_at > now() THEN true
        WHEN s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN true
        WHEN s.status = 'past_due' AND (
          s.current_period_end IS NULL
          OR s.current_period_end + make_interval(days => COALESCE(st.past_due_grace_days, 7)) > now()
        ) THEN true
        ELSE false
      END
      FROM public.company_subscriptions s
      LEFT JOIN public.billing_settings st ON st.id = true
      WHERE s.company_id = _company_id
    ), false)
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_billing_allowance(_company_id uuid, _metric text, _adding bigint DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ent JSONB;
  _limit BIGINT;
  _used BIGINT;
  _enabled BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND is_demo) THEN
    RETURN;
  END IF;
  IF NOT public.subscription_allows_posting(_company_id) THEN
    RAISE EXCEPTION 'This organisation is read-only until a plan is active. Existing reports and files stay available. Open Settings → Subscription.';
  END IF;
  _ent := public.get_entitlements(_company_id);
  _enabled := COALESCE((_ent -> 'features' ->> _metric)::boolean, true);
  IF _enabled IS FALSE THEN
    RAISE EXCEPTION 'This feature is not included on the current plan. Open Settings → Subscription to compare plans. Existing records stay available.';
  END IF;
  IF (_ent -> 'limits' ->> _metric) IS NULL THEN
    RETURN;
  END IF;
  _limit := (_ent -> 'limits' ->> _metric)::bigint;
  _used := COALESCE((_ent -> 'usage' ->> _metric)::bigint, 0);
  IF _used + COALESCE(_adding, 1) > _limit THEN
    RAISE EXCEPTION 'The % limit of % is reached. Open Settings → Subscription to upgrade. Existing records stay available.', replace(_metric, '_', ' '), _limit;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_company_allowance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing INTEGER;
  _limit BIGINT;
  _sample UUID;
BEGIN
  IF NEW.is_demo IS TRUE OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO _existing
  FROM public.companies
  WHERE created_by = NEW.created_by AND is_demo IS NOT TRUE AND id IS DISTINCT FROM NEW.id;
  IF _existing = 0 THEN
    RETURN NEW;
  END IF;
  SELECT s.company_id INTO _sample
  FROM public.company_subscriptions s
  JOIN public.companies c ON c.id = s.company_id
  WHERE c.created_by = NEW.created_by AND c.is_demo IS NOT TRUE
  ORDER BY CASE s.plan_code WHEN 'practice' THEN 4 WHEN 'pro' THEN 3 WHEN 'growth' THEN 2 ELSE 1 END DESC
  LIMIT 1;
  IF _sample IS NULL THEN
    RAISE EXCEPTION 'Choose a plan that includes another company before opening a second organisation.';
  END IF;
  _limit := (public.get_entitlements(_sample) -> 'limits' ->> 'companies')::bigint;
  IF _limit IS NOT NULL AND _existing >= _limit THEN
    RAISE EXCEPTION 'This plan includes % companies. Upgrade, or add the extra company add-on, before opening another. Existing organisations stay available.', _limit;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_subscription_seats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.role = NEW.role THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_billing_allowance(
    NEW.company_id,
    CASE WHEN NEW.role = 'accountant' THEN 'accountant_seats' ELSE 'users' END,
    1
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.attach_company_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _settings public.billing_settings%ROWTYPE;
  _currency CHAR(3);
  _plan TEXT;
  _version UUID;
BEGIN
  SELECT * INTO _settings FROM public.billing_settings WHERE id = true;
  _currency := CASE
    WHEN NEW.base_currency IN ('USD', 'GBP', 'AUD', 'NZD', 'INR') THEN NEW.base_currency
    ELSE 'USD'
  END;
  _plan := CASE WHEN NEW.is_demo THEN 'practice' ELSE COALESCE(_settings.trial_plan_code, 'growth') END;
  SELECT id INTO _version FROM public.plan_versions
  WHERE plan_code = _plan AND status = 'published'
  ORDER BY version_no DESC LIMIT 1;
  INSERT INTO public.company_subscriptions (
    company_id, plan_code, status, billing_interval, provider, currency,
    trial_started_at, trial_ends_at, price_version_id
  ) VALUES (
    NEW.id,
    _plan,
    CASE WHEN NEW.is_demo THEN 'complimentary' ELSE 'trialing' END,
    'month',
    'none',
    _currency,
    CASE WHEN NEW.is_demo THEN NULL ELSE now() END,
    CASE WHEN NEW.is_demo THEN NULL ELSE now() + make_interval(days => COALESCE(_settings.trial_days, 14)) END,
    _version
  )
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_public_billing_plans()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_order), '[]'::jsonb)
  FROM (
    SELECT v.plan_code AS code, v.name, v.audience, v.summary, v.badge, v.sort_order,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'currency', pr.currency,
          'interval', pr.billing_interval,
          'amountMinor', pr.amount_minor,
          'needsReview', pr.needs_review
        ))
        FROM public.plan_prices pr
        WHERE pr.version_id = v.id AND pr.archived_at IS NULL
      ) AS prices
    FROM public.plan_versions v
    INNER JOIN public.billing_plans bp ON bp.code = v.plan_code
    WHERE v.status = 'published'
      AND v.visibility = 'live'
      AND bp.is_active
      AND bp.is_public
  ) p;
$function$
;

CREATE OR REPLACE FUNCTION public.start_company_trial(_company_id uuid, _plan_code text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _days INTEGER;
  _ends TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE code = _plan_code AND is_active) THEN
    RAISE EXCEPTION 'Choose an active plan.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions
    WHERE company_id = _company_id AND trial_started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This organisation has already used its free trial.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions
    WHERE company_id = _company_id AND status = 'complimentary'
  ) THEN
    RAISE EXCEPTION 'Demo organisations are not billed.';
  END IF;
  SELECT trial_days INTO _days FROM public.billing_settings WHERE id = true;
  _ends := now() + make_interval(days => COALESCE(_days, 30));
  INSERT INTO public.company_subscriptions (
    company_id, plan_code, status, billing_interval, provider, trial_started_at, trial_ends_at, currency
  )
  SELECT _company_id, _plan_code, 'trialing', 'month', 'none', now(), _ends,
    CASE WHEN c.base_currency IN ('GBP', 'USD', 'INR') THEN c.base_currency ELSE 'GBP' END
  FROM public.companies c
  WHERE c.id = _company_id
  ON CONFLICT (company_id) DO UPDATE
    SET plan_code = EXCLUDED.plan_code,
        status = 'trialing',
        trial_started_at = EXCLUDED.trial_started_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        updated_at = now()
    WHERE public.company_subscriptions.trial_started_at IS NULL
      AND public.company_subscriptions.status <> 'complimentary';
  RETURN _ends;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.platform_price_action(_action text, _payload jsonb, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE previous public.plan_versions%rowtype; target public.plan_versions%rowtype; vid uuid; staff_role text; amount integer; floor integer; cur text; cadence text; code text; result_status text;
BEGIN
 staff_role:=public.platform_role();
 IF staff_role IS NULL OR staff_role NOT IN ('platform_owner','platform_finance') THEN RAISE EXCEPTION 'Billing staff and an active MFA session are required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Record a reason'; END IF;
 PERFORM private.platform_rate_limit();
 PERFORM pg_advisory_xact_lock(47329212);
 IF _action='draft' THEN
 code:=_payload->>'planCode';cur:=_payload->>'currency';cadence:=_payload->>'interval';amount:=(_payload->>'amountMinor')::integer;
 IF cur NOT IN ('USD','GBP','AUD','NZD','INR') OR cadence NOT IN ('month','year') OR code NOT IN ('starter','growth','pro','practice') OR amount IS NULL THEN RAISE EXCEPTION 'Choose a supported plan, currency and interval'; END IF;
 floor:=CASE cur WHEN 'USD' THEN 500 WHEN 'GBP' THEN 400 WHEN 'AUD' THEN 800 WHEN 'NZD' THEN 800 WHEN 'INR' THEN 9900 END * CASE cadence WHEN 'year' THEN 8 ELSE 1 END;
 IF amount<floor THEN RAISE EXCEPTION 'Price is below the configured floor'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code ORDER BY version_no DESC LIMIT 1;
 result_status:=CASE WHEN staff_role='platform_finance' AND coalesce((SELECT require_owner_approval FROM public.billing_settings WHERE id),true) THEN 'review' ELSE 'draft' END;
 INSERT INTO public.plan_versions(plan_code,version_no,status,name,audience,summary,visibility,created_by,reason) VALUES(code,coalesce(previous.version_no,0)+1,result_status,coalesce(previous.name,code),coalesce(previous.audience,''),coalesce(previous.summary,''),'draft',auth.uid(),_reason) RETURNING id INTO vid;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=code AND status='published' ORDER BY version_no DESC LIMIT 1;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) SELECT vid,currency,billing_interval,amount_minor,needs_review FROM public.plan_prices WHERE version_id=previous.id;
 INSERT INTO public.plan_prices(version_id,currency,billing_interval,amount_minor,needs_review) VALUES(vid,cur,cadence,amount,cur<>'USD') ON CONFLICT(version_id,currency,billing_interval) DO UPDATE SET amount_minor=excluded.amount_minor,needs_review=excluded.needs_review;
 INSERT INTO public.plan_version_limits(version_id,feature_key,enabled,limit_value) SELECT vid,feature_key,enabled,limit_value FROM public.plan_version_limits WHERE version_id=previous.id;
 ELSE
 IF staff_role<>'platform_owner' THEN RAISE EXCEPTION 'Only Superadmin may publish or roll back prices' USING ERRCODE='42501'; END IF;
 IF _action='publish' THEN SELECT * INTO target FROM public.plan_versions WHERE id=(_payload->>'versionId')::uuid AND status IN ('draft','review');
 ELSIF _action='rollback' THEN SELECT * INTO target FROM public.plan_versions WHERE plan_code=_payload->>'planCode' AND status='archived' ORDER BY version_no DESC LIMIT 1;
 ELSE RAISE EXCEPTION 'Unknown price action'; END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'No eligible price version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plan_prices WHERE version_id=target.id) THEN RAISE EXCEPTION 'A price version must contain prices'; END IF;
 SELECT * INTO previous FROM public.plan_versions WHERE plan_code=target.plan_code AND status='published' LIMIT 1;
 UPDATE public.plan_versions SET status='archived',visibility='hidden' WHERE plan_code=target.plan_code AND status='published';
 UPDATE public.plan_versions SET status='published',visibility='live',published_at=now(),effective_from=now(),reason=_reason WHERE id=target.id;
 vid:=target.id;result_status:='published';
 END IF;
 PERFORM private.platform_log('price.'||_action,'plan_version',vid::text,CASE WHEN previous.id IS NULL THEN NULL ELSE jsonb_build_object('id',previous.id,'status',previous.status) END,jsonb_build_object('id',vid,'status',result_status),_reason);
 RETURN jsonb_build_object('versionId',vid,'status',result_status,'marginWarning',null,'grandfathered',true,'ok',true);
END $function$
;

CREATE OR REPLACE FUNCTION private.require_platform(_permission text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.platform_can(_permission) THEN RAISE EXCEPTION 'Platform permission % and an active MFA session are required',_permission USING ERRCODE='42501'; END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.platform_log(_action text, _type text, _id text, _before jsonb, _after jsonb, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Record a reason (at least 3 characters)'; END IF;
 INSERT INTO public.platform_audit(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason,session_id,request_ip)
 VALUES(auth.uid(),_action,_type,_id,_before,_after,_reason,nullif(auth.jwt()->>'session_id','')::uuid,
 left(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-forwarded-for','unknown'),200));
END;
$function$
;

CREATE OR REPLACE FUNCTION private.platform_rate_limit()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE n integer; BEGIN
 INSERT INTO private.platform_request_buckets(user_id,minute,requests) VALUES(auth.uid(),date_trunc('minute',now()),1)
 ON CONFLICT(user_id,minute) DO UPDATE SET requests=platform_request_buckets.requests+1 RETURNING requests INTO n;
 IF n>300 THEN RAISE EXCEPTION 'Too many platform requests. Retry next minute' USING ERRCODE='54000'; END IF;
 -- A small bounded cleanup avoids storing session activity indefinitely.
 DELETE FROM private.platform_request_buckets WHERE minute < now()-interval '1 day';
END $function$
;

CREATE OR REPLACE FUNCTION private.platform_worker_tick() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.platform_jobs; schedule record; count_jobs integer:=0; run_id bigint; output jsonb; code text;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Scheduled worker requires system execution' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(483925016) THEN RETURN jsonb_build_object('skipped','Worker already running'); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.platform_worker_state WHERE singleton AND enabled) THEN RETURN jsonb_build_object('skipped','Worker disabled'); END IF;
 UPDATE private.platform_worker_state SET started_at=clock_timestamp(),error_code=NULL WHERE singleton;
 FOR schedule IN SELECT * FROM private.platform_job_schedules WHERE next_run_at<=now() ORDER BY kind FOR UPDATE LOOP
  IF NOT EXISTS(SELECT 1 FROM public.platform_jobs WHERE kind=schedule.kind AND origin='schedule' AND status='failed') THEN
  INSERT INTO public.platform_jobs(name,kind,status,created_by,origin) VALUES(schedule.kind,schedule.kind,'queued',NULL,'schedule') ON CONFLICT(name) WHERE status='queued' DO NOTHING;
  END IF;
  UPDATE private.platform_job_schedules SET next_run_at=date_trunc('minute',now())+make_interval(secs=>schedule.interval_seconds) WHERE kind=schedule.kind;
 END LOOP;
 FOR j IN SELECT * FROM public.platform_jobs WHERE status='queued' AND kind IS NOT NULL AND next_run_at<=now() AND attempts<max_attempts ORDER BY next_run_at,created_at,id LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.platform_jobs SET status='running',attempts=attempts+1,started_at=clock_timestamp(),finished_at=NULL,last_error=NULL,row_version=row_version+1 WHERE id=j.id RETURNING * INTO j;
  INSERT INTO public.platform_job_runs(job_id,attempt,status) VALUES(j.id,j.attempts,'running') RETURNING id INTO run_id;
  BEGIN
   CASE j.kind WHEN 'expire_support' THEN output:=private.platform_expire_support_jobs(); WHEN 'check_operations' THEN output:=private.platform_check_operations(); ELSE RAISE EXCEPTION 'Unsupported job handler'; END CASE;
   UPDATE public.platform_jobs SET status='succeeded',finished_at=clock_timestamp(),result=output,row_version=row_version+1 WHERE id=j.id;
   UPDATE public.platform_job_runs SET status='succeeded',finished_at=clock_timestamp(),result=output WHERE id=run_id;
   PERFORM private.platform_log('job.succeed','platform_job',j.id::text,NULL,output,'Bounded operational handler completed');
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
   UPDATE public.platform_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,next_run_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts-1,6))::integer)),finished_at=clock_timestamp(),last_error='Handler failed ('||code||')',row_version=row_version+1 WHERE id=j.id;
   UPDATE public.platform_job_runs SET status='failed',finished_at=clock_timestamp(),error_code=code WHERE id=run_id;
   PERFORM private.platform_log('job.fail','platform_job',j.id::text,NULL,jsonb_build_object('code',code,'attempt',j.attempts,'retrying',j.attempts<j.max_attempts),'Operational handler failed; details remain redacted');
  END;
  count_jobs:=count_jobs+1;
 END LOOP;
 UPDATE private.platform_worker_state SET finished_at=clock_timestamp(),last_jobs=count_jobs WHERE singleton;
 RETURN jsonb_build_object('processed',count_jobs);
END $$;

CREATE TRIGGER companies_attach_subscription AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION attach_company_subscription();
CREATE TRIGGER companies_plan_allowance BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION enforce_company_allowance();
CREATE TRIGGER company_members_subscription_seats BEFORE INSERT OR UPDATE ON public.company_members FOR EACH ROW EXECUTE FUNCTION enforce_subscription_seats();

INSERT INTO public.billing_features (key, label, description, category, module, metering, cost_tag, catalogue_status, default_enabled, version_no) VALUES
	('companies', 'Companies', 'Organisations included on the plan.', 'limit', 'accounting', 'count', NULL, 'live', true, 1),
	('users', 'Users', 'Active member seats, excluding accountant seats.', 'limit', 'accounting', 'count', NULL, 'live', true, 1),
	('accountant_seats', 'Accountant seats', 'External accountant seats.', 'limit', 'accounting', 'count', NULL, 'live', true, 1),
	('invoices', 'Invoices per month', 'Sales invoices created in the current month.', 'limit', 'sales', 'count', NULL, 'live', true, 1),
	('bills', 'Bills per month', 'Purchase bills created in the current month.', 'limit', 'purchases', 'count', NULL, 'live', true, 1),
	('storage_bytes', 'File storage', 'Stored attachment bytes.', 'limit', 'documents', 'bytes', 'storage_gb', 'live', true, 1),
	('ai_queries', 'AI questions per month', 'Metered AI questions.', 'add_on', 'accounting', 'count', 'ai_query', 'live', true, 1),
	('voice_minutes', 'Voice minutes per month', 'Metered voice assistant minutes.', 'add_on', 'accounting', 'minutes', NULL, 'live', true, 1),
	('bank_import', 'CSV and OFX bank import', 'File-based bank import.', 'module', 'banking', 'none', NULL, 'live', true, 1),
	('bank_feeds', 'Live bank feeds', 'Provider bank connections.', 'add_on', 'banking', 'count', 'bank_feed', 'live', false, 1),
	('multi_currency', 'Multi-currency', 'Documents in a currency other than the organisation base currency.', 'module', 'accounting', 'none', NULL, 'live', false, 1),
	('approvals', 'Approvals', 'Expense and document approval workflow.', 'module', 'purchases', 'none', NULL, 'live', false, 1),
	('client_portal', 'Client portal', 'Customer and supplier portal access.', 'add_on', 'sales', 'none', NULL, 'live', false, 1),
	('expense_claims', 'Expense claims', 'Employee expense claims.', 'module', 'purchases', 'none', NULL, 'live', false, 1),
	('inventory', 'Inventory', 'Inventory quantities on documents.', 'module', 'purchases', 'none', NULL, 'live', false, 1),
	('projects', 'Projects', 'Project tracking on transactions.', 'module', 'projects', 'none', NULL, 'live', false, 1),
	('budgeting', 'Budgeting', 'Budgets and budget reports.', 'module', 'budgets', 'none', NULL, 'live', false, 1),
	('custom_fields', 'Custom fields', 'Extra fields on records.', 'module', 'accounting', 'none', NULL, 'live', false, 1),
	('api', 'API access', 'Organisation API credentials.', 'add_on', 'accounting', 'count', NULL, 'live', false, 1),
	('audit_centre', 'Advanced audit centre', 'Extended audit views.', 'add_on', 'accounting', 'none', NULL, 'live', false, 1),
	('white_label', 'White-label portal', 'Branded portal for a firm.', 'add_on', 'accounting', 'none', NULL, 'live', false, 1),
	('accounting', 'Accounting module', 'Ledger writes guarded as the accounting module.', 'module', 'accounting', 'none', NULL, 'live', true, 1),
	('sales', 'Sales module', 'Sales document writes.', 'module', 'sales', 'none', NULL, 'live', true, 1),
	('purchases', 'Purchases module', 'Purchase document writes.', 'module', 'purchases', 'none', NULL, 'live', true, 1),
	('banking', 'Banking module', 'Banking writes.', 'module', 'banking', 'none', NULL, 'live', true, 1),
	('budgets', 'Budgets module', 'Budget writes.', 'module', 'budgets', 'none', NULL, 'live', true, 1),
	('fixed_assets', 'Fixed assets module', 'Fixed asset writes.', 'module', 'fixed_assets', 'none', NULL, 'live', true, 1),
	('documents', 'Documents module', 'Document writes.', 'module', 'documents', 'none', NULL, 'live', true, 1),
	('reporting', 'Reporting ecosystem', 'Custom financial reports, management analysis, review packs and scheduled reporting.', 'module', 'reporting', 'none', NULL, 'live', true, 1);
INSERT INTO public.billing_plans (code, name, audience, summary, monthly_gbp, monthly_usd, monthly_inr, users_included, invoices_per_month, bills_per_month, multi_currency, highlights, sort_order, is_public, is_active, updated_at) VALUES
	('growth', 'Growth', 'Growing businesses', 'The plan most businesses start on after the trial.', 2400, 3000, 249900, 5, NULL, NULL, true, '["Most popular", "5 users and 2 accountant seats", "3 companies", "Unlimited invoices and bills"]', 2, true, true, '2026-10-30 09:06:04.595888+00'),
	('pro', 'Pro', 'Established businesses', 'Inventory, projects, budgeting and API access.', 4700, 6000, 499900, 15, NULL, NULL, true, '["15 users and 3 accountant seats", "10 companies", "Inventory, projects and budgeting", "API access"]', 3, true, true, '2026-10-30 09:06:04.595888+00'),
	('starter', 'Starter', 'Sole traders', 'Full double-entry books for a one-person business.', 900, 1200, 99900, 1, 150, 50, false, '["1 user and 1 accountant seat", "1 company", "150 invoices and 50 bills a month", "CSV and OFX bank import"]', 1, true, true, '2026-10-30 09:05:44.040316+00'),
	('practice', 'Practice', 'Accountants', 'For accountants and CPA firms.', 7800, 9900, 829900, 1000, NULL, NULL, true, '["15 client companies included", "Extra client company is an add-on", "Firm workspace"]', 4, true, true, '2026-10-30 09:05:44.040316+00'),
	('standard', 'Standard', 'Growing businesses', 'Unlimited documents, multi-currency and projects.', 2900, 3500, 149900, 5, NULL, NULL, true, '["Everything in Starter", "Unlimited invoices and bills", "5 users", "Multi-currency and projects", "Bank rules"]', 2, false, true, '2026-10-30 09:05:44.040316+00'),
	('premium', 'Premium', 'Established businesses', 'More seats, fixed assets, budgets and expense approvals.', 4900, 5900, 299900, 10, NULL, NULL, true, '["Everything in Standard", "10 users", "Fixed assets and budgets", "Expense approvals"]', 3, false, true, '2026-10-30 09:05:44.040316+00');
INSERT INTO public.billing_settings (id, trial_days, trial_plan_code, annual_free_months, past_due_grace_days, updated_at, card_required, require_owner_approval) VALUES
	(true, 14, 'growth', 2, 7, '2026-10-30 09:05:44.040316+00', false, true);
INSERT INTO public.plan_versions (id, plan_code, version_no, status, name, audience, summary, badge, sort_order, visibility, effective_from, published_at, created_by, reason, created_at) VALUES
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'starter', 1, 'published', 'Starter', 'Sole traders', 'Full double-entry for one company.', NULL, 1, 'live', '2026-10-30 09:06:04.595888+00', '2026-10-30 09:06:04.595888+00', NULL, 'Initial published version', '2026-10-30 09:06:04.595888+00'),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'growth', 1, 'published', 'Growth', 'Growing businesses', 'Most businesses start here.', 'Most popular', 2, 'live', '2026-10-30 09:06:04.595888+00', '2026-10-30 09:06:04.595888+00', NULL, 'Initial published version', '2026-10-30 09:06:04.595888+00'),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'pro', 1, 'published', 'Pro', 'Established businesses', 'Inventory, projects, budgeting and API.', NULL, 3, 'live', '2026-10-30 09:06:04.595888+00', '2026-10-30 09:06:04.595888+00', NULL, 'Initial published version', '2026-10-30 09:06:04.595888+00'),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'practice', 1, 'published', 'Practice', 'Accountants', 'Fifteen client companies and a firm workspace.', NULL, 4, 'live', '2026-10-30 09:06:04.595888+00', '2026-10-30 09:06:04.595888+00', NULL, 'Initial published version', '2026-10-30 09:06:04.595888+00');
INSERT INTO public.plan_prices (id, version_id, currency, billing_interval, amount_minor, needs_review, stripe_price_id, archived_at) VALUES
	('4575bbd2-870b-4257-8727-ee26af5139a7', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'USD', 'month', 1200, false, NULL, NULL),
	('00447bf6-cb96-47e9-ba64-6356b89ce66e', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'USD', 'year', 12000, false, NULL, NULL),
	('bcdf4135-e2eb-4e05-b18c-85b4ce5df2fb', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'GBP', 'month', 900, true, NULL, NULL),
	('c1fa30d4-1dda-40fe-bdb7-a2f1625772de', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'GBP', 'year', 9000, true, NULL, NULL),
	('ff5c0d29-f50b-49c8-a90f-37e03eb4d534', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'INR', 'month', 99900, true, NULL, NULL),
	('7ce5ee5a-b43c-489e-bad8-e0256cab1179', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'INR', 'year', 999000, true, NULL, NULL),
	('24be1bc3-81dc-4946-be7e-9a2e58450514', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'AUD', 'month', 1800, true, NULL, NULL),
	('79988f6b-2e4b-48a7-9099-d3c6c28cf485', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'AUD', 'year', 18000, true, NULL, NULL),
	('a47d026a-241e-4dbe-bea4-d87e5d56d646', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'NZD', 'month', 2000, true, NULL, NULL),
	('02387e08-69cf-43da-b308-d42edf408c13', '1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'NZD', 'year', 20000, true, NULL, NULL),
	('b0a999b7-c7f2-4f39-8f82-ef6fd709a917', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'USD', 'month', 3000, false, NULL, NULL),
	('edecf06c-b1f8-420c-936a-a440ad788f05', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'USD', 'year', 30000, false, NULL, NULL),
	('814abf5f-b8f8-48de-9611-0cba5ebc928e', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'GBP', 'month', 2400, true, NULL, NULL),
	('93afc27a-1c47-4c30-b3f2-05333439047f', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'GBP', 'year', 24000, true, NULL, NULL),
	('48451e63-5d09-438b-87a4-4f7fa87d0405', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'INR', 'month', 249900, true, NULL, NULL),
	('630aa2d7-34da-4326-a1c1-6c17eea97001', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'INR', 'year', 2499000, true, NULL, NULL),
	('364c69f7-d9cf-4cc3-981a-dc5b742769fe', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'AUD', 'month', 4600, true, NULL, NULL),
	('7c83a34f-030e-483a-9fb3-b176539b1d17', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'AUD', 'year', 46000, true, NULL, NULL),
	('191e7110-8561-4a36-a13b-d9f041b723a0', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'NZD', 'month', 5000, true, NULL, NULL),
	('be738208-6b43-4d35-8896-030567c222d2', '2675a683-7959-4f6e-afe2-55b0eae5ab96', 'NZD', 'year', 50000, true, NULL, NULL),
	('b585f65c-a558-461f-baa3-94bd2c3f2e8e', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'USD', 'month', 6000, false, NULL, NULL),
	('234a41e2-9d04-41c0-8ad5-c1201597145f', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'USD', 'year', 60000, false, NULL, NULL),
	('6713b341-e9dd-4f0b-aaf1-1997fc73bd05', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'GBP', 'month', 4700, true, NULL, NULL),
	('043f6797-38ae-4b82-82a2-b6cd4a1276ef', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'GBP', 'year', 47000, true, NULL, NULL),
	('249f6a3a-437a-4942-a81a-4ef0769e8ca0', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'INR', 'month', 499900, true, NULL, NULL),
	('25fc44af-b28d-4231-8659-111d2e1c00d5', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'INR', 'year', 4999000, true, NULL, NULL),
	('ddfd3506-11d4-4321-aabb-15f700260523', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'AUD', 'month', 9100, true, NULL, NULL),
	('e1336870-d1fc-4a1c-a430-cddc0e08345b', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'AUD', 'year', 91000, true, NULL, NULL),
	('cdc22526-c7e1-4824-8979-c2c3b3e61883', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'NZD', 'month', 10000, true, NULL, NULL),
	('99239cff-a1b5-43ec-8b08-371184f64668', 'd8522af4-a02d-4e85-9b29-8676b7368184', 'NZD', 'year', 100000, true, NULL, NULL),
	('3f492bdc-820b-4340-a689-aa7796b5226e', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'USD', 'month', 9900, false, NULL, NULL),
	('e77c8413-45b0-4de1-ad5d-14312f0381b6', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'USD', 'year', 99000, false, NULL, NULL),
	('42c88ecc-071d-41a6-82d2-96b258828c74', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'GBP', 'month', 7800, true, NULL, NULL),
	('e8b8ef0a-8a21-4773-8775-e094e03f0746', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'GBP', 'year', 78000, true, NULL, NULL),
	('668edb63-a78f-4ba0-8a0f-cf12d8fab1b2', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'INR', 'month', 829900, true, NULL, NULL),
	('6bea7618-bb6b-4c9d-8893-4a16e6288059', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'INR', 'year', 8299000, true, NULL, NULL),
	('d5691511-de39-439e-80c6-20e1348dd3f5', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'AUD', 'month', 15000, true, NULL, NULL),
	('d6df3238-252f-4a79-85fa-35438d953da4', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'AUD', 'year', 150000, true, NULL, NULL),
	('42461f5b-2b67-4b1b-b51e-fd855bbde6f9', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'NZD', 'month', 16400, true, NULL, NULL),
	('84be2839-1813-4bed-8931-740d0df7b5dd', '7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'NZD', 'year', 164000, true, NULL, NULL);
INSERT INTO public.plan_version_limits (version_id, feature_key, enabled, limit_value) VALUES
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'companies', true, 1),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'users', true, 1),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'accountant_seats', true, 1),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'invoices', true, 150),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'bills', true, 50),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'storage_bytes', true, 1073741824),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'ai_queries', true, 50),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'voice_minutes', false, 0),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'bank_import', true, NULL),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'bank_feeds', false, 0),
	('1ae2bd3d-5382-4ff4-b90b-352d2b64b507', 'multi_currency', false, 0),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'companies', true, 3),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'users', true, 5),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'accountant_seats', true, 2),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'invoices', true, NULL),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'bills', true, NULL),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'storage_bytes', true, 10737418240),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'ai_queries', true, 500),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'voice_minutes', true, 60),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'bank_feeds', true, NULL),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'multi_currency', true, NULL),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'approvals', true, NULL),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'client_portal', true, NULL),
	('2675a683-7959-4f6e-afe2-55b0eae5ab96', 'expense_claims', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'companies', true, 10),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'users', true, 15),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'accountant_seats', true, 3),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'invoices', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'bills', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'storage_bytes', true, 53687091200),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'ai_queries', true, 2000),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'voice_minutes', true, 300),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'inventory', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'projects', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'budgeting', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'custom_fields', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'api', true, NULL),
	('d8522af4-a02d-4e85-9b29-8676b7368184', 'audit_centre', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'companies', true, 15),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'users', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'accountant_seats', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'invoices', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'bills', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'storage_bytes', true, 107374182400),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'ai_queries', true, 5000),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'voice_minutes', true, 600),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'white_label', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'api', true, NULL),
	('7f4488f5-41d8-4b56-9e08-30451b3ba5f8', 'audit_centre', true, NULL);

INSERT INTO private.platform_worker_state (singleton) VALUES (true);
INSERT INTO private.platform_job_schedules (kind, interval_seconds) VALUES ('expire_support', 60), ('check_operations', 60);

-- Subscriptions present before the billing platform series (exercises the catalogue data migration).
INSERT INTO public.company_subscriptions (company_id, plan_code, status, provider, currency, trial_started_at, trial_ends_at)
VALUES ('10000000-0000-0000-0000-00000000000a', 'growth', 'trialing', 'none', 'GBP', now() - interval '5 days', now() + interval '9 days');
INSERT INTO public.company_subscriptions (company_id, plan_code, status, provider, currency, unit_amount_minor, current_period_end)
VALUES ('10000000-0000-0000-0000-00000000000b', 'starter', 'active', 'razorpay', 'INR', 99900, now() + interval '20 days');
