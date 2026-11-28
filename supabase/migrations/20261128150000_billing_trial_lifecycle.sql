-- Configurable trial policy, durable reminder jobs, and extension history.
-- Reuses billing_plans.trial_*, trial_eligibility_rules, email_outbox, action_notifications,
-- billing.subscription_access_grants, and billing.run_lifecycle_sweep.

CREATE TABLE IF NOT EXISTS billing.trial_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  default_days integer NOT NULL DEFAULT 30 CHECK (default_days BETWEEN 1 AND 365),
  require_payment_method boolean NOT NULL DEFAULT false,
  first_time_only boolean NOT NULL DEFAULT true,
  allow_reuse boolean NOT NULL DEFAULT false,
  allow_manual_grant boolean NOT NULL DEFAULT true,
  read_only_after_expiry boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO billing.trial_policy (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing.trial_policy_versions (
  version integer PRIMARY KEY,
  snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.trial_country_rules (
  country_code char(2) PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$'),
  enabled boolean,
  trial_days integer CHECK (trial_days IS NULL OR trial_days BETWEEN 1 AND 365),
  require_payment_method boolean,
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS billing.trial_reminder_config (
  kind text PRIMARY KEY
    CHECK (kind IN ('welcome', 'd7', 'd3', 'd1', 'expired')),
  enabled boolean NOT NULL DEFAULT true,
  days_before_expiry integer
    CHECK (days_before_expiry IS NULL OR days_before_expiry BETWEEN 0 AND 90),
  email_enabled boolean NOT NULL DEFAULT true,
  inapp_enabled boolean NOT NULL DEFAULT true
);

INSERT INTO billing.trial_reminder_config (kind, enabled, days_before_expiry) VALUES
  ('welcome', true, NULL),
  ('d7', true, 7),
  ('d3', true, 3),
  ('d1', true, 1),
  ('expired', true, 0)
ON CONFLICT (kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing.trial_reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL REFERENCES billing.trial_reminder_config(kind),
  trial_ends_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS trial_reminder_jobs_due_idx
  ON billing.trial_reminder_jobs (due_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS trial_reminder_jobs_company_idx
  ON billing.trial_reminder_jobs (company_id, status);

CREATE TABLE IF NOT EXISTS billing.trial_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  previous_ends_at timestamptz,
  new_ends_at timestamptz NOT NULL,
  days_added integer,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'policy', 'system')),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_extensions_company_idx
  ON billing.trial_extensions (company_id, created_at DESC);

ALTER TABLE billing.trial_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_country_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_reminder_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_reminder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.trial_policy, billing.trial_policy_versions, billing.trial_country_rules,
  billing.trial_reminder_config, billing.trial_reminder_jobs, billing.trial_extensions
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policy resolution (plan → country → global)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.resolve_trial_policy(
  _company_id uuid,
  _plan_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  policy billing.trial_policy%ROWTYPE;
  plan public.billing_plans%ROWTYPE;
  company public.companies%ROWTYPE;
  country billing.trial_country_rules%ROWTYPE;
  days integer;
  enabled boolean;
  require_pm boolean;
BEGIN
  SELECT * INTO policy FROM billing.trial_policy WHERE id = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('enabled', false, 'days', 30, 'requirePaymentMethod', false, 'source', 'missing');
  END IF;
  enabled := policy.enabled;
  days := policy.default_days;
  require_pm := policy.require_payment_method;

  SELECT * INTO company FROM public.companies WHERE id = _company_id;
  IF FOUND AND company.country_code IS NOT NULL THEN
    SELECT * INTO country FROM billing.trial_country_rules
     WHERE country_code = upper(company.country_code);
    IF FOUND THEN
      IF country.enabled IS NOT NULL THEN enabled := country.enabled; END IF;
      IF country.trial_days IS NOT NULL THEN days := country.trial_days; END IF;
      IF country.require_payment_method IS NOT NULL THEN require_pm := country.require_payment_method; END IF;
    END IF;
  END IF;

  IF _plan_code IS NOT NULL THEN
    SELECT * INTO plan FROM public.billing_plans WHERE code = _plan_code;
    IF FOUND THEN
      enabled := enabled AND plan.trial_enabled AND plan.is_active;
      IF plan.trial_enabled THEN days := plan.trial_days; END IF;
    ELSE
      enabled := false;
    END IF;
  END IF;

  IF NOT policy.enabled THEN enabled := false; END IF;

  RETURN jsonb_build_object(
    'enabled', enabled,
    'days', days,
    'requirePaymentMethod', require_pm,
    'firstTimeOnly', policy.first_time_only,
    'allowReuse', policy.allow_reuse,
    'allowManualGrant', policy.allow_manual_grant,
    'readOnlyAfterExpiry', policy.read_only_after_expiry,
    'policyVersion', policy.version,
    'source', 'resolved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION billing.cancel_trial_reminders(_company_id uuid, _reason text DEFAULT 'cancelled')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  UPDATE billing.trial_reminder_jobs
     SET status = 'cancelled',
         updated_at = now(),
         last_error = left(coalesce(_reason, 'cancelled'), 200)
   WHERE company_id = _company_id
     AND status IN ('pending', 'failed', 'processing');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION billing.schedule_trial_reminders(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  cfg record;
  due timestamptz;
  key text;
  n integer := 0;
  ends_key text;
BEGIN
  SELECT * INTO sub FROM public.company_subscriptions WHERE company_id = _company_id;
  IF NOT FOUND OR sub.status <> 'trialing' OR sub.provider <> 'none' OR sub.trial_ends_at IS NULL THEN
    PERFORM billing.cancel_trial_reminders(_company_id, 'not_on_no_card_trial');
    RETURN 0;
  END IF;

  PERFORM billing.cancel_trial_reminders(_company_id, 'reschedule');
  ends_key := to_char(sub.trial_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  FOR cfg IN SELECT * FROM billing.trial_reminder_config WHERE enabled LOOP
    IF cfg.kind = 'welcome' THEN
      due := coalesce(sub.trial_started_at, now());
    ELSIF cfg.kind = 'expired' THEN
      due := sub.trial_ends_at;
    ELSE
      due := sub.trial_ends_at - make_interval(days => coalesce(cfg.days_before_expiry, 0));
    END IF;
    -- Skip past due reminders except welcome (send ASAP) and already-passed mid-window.
    IF cfg.kind <> 'welcome' AND due < now() - interval '1 hour' AND cfg.kind <> 'expired' THEN
      CONTINUE;
    END IF;
    IF cfg.kind = 'expired' AND due < now() - interval '7 days' THEN
      CONTINUE;
    END IF;
    key := _company_id::text || ':' || cfg.kind || ':' || ends_key;
    INSERT INTO billing.trial_reminder_jobs (
      company_id, kind, trial_ends_at, due_at, status, idempotency_key
    ) VALUES (
      _company_id, cfg.kind, sub.trial_ends_at, greatest(due, now()), 'pending', key
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = CASE
            WHEN billing.trial_reminder_jobs.status = 'sent' THEN 'sent'
            ELSE 'pending'
          END,
          due_at = EXCLUDED.due_at,
          trial_ends_at = EXCLUDED.trial_ends_at,
          updated_at = now(),
          last_error = NULL
      WHERE billing.trial_reminder_jobs.status <> 'sent';
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION billing.claim_due_trial_reminders(_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rows jsonb;
BEGIN
  WITH due AS (
    SELECT id
      FROM billing.trial_reminder_jobs
     WHERE status IN ('pending', 'failed')
       AND due_at <= now()
       AND attempts < 8
     ORDER BY due_at
     LIMIT greatest(1, least(coalesce(_limit, 20), 100))
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE billing.trial_reminder_jobs j
       SET status = 'processing',
           attempts = j.attempts + 1,
           updated_at = now()
      FROM due
     WHERE j.id = due.id
     RETURNING j.id, j.company_id, j.kind, j.trial_ends_at, j.due_at, j.idempotency_key, j.attempts
  )
  SELECT coalesce(jsonb_agg(
    to_jsonb(upd) || jsonb_build_object(
      'email_enabled', coalesce(c.email_enabled, true),
      'inapp_enabled', coalesce(c.inapp_enabled, true)
    )
  ), '[]'::jsonb) INTO rows
  FROM upd
  LEFT JOIN billing.trial_reminder_config c ON c.kind = upd.kind;
  RETURN rows;
END;
$$;

CREATE OR REPLACE FUNCTION billing.finish_trial_reminder(
  _id uuid,
  _ok boolean,
  _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE billing.trial_reminder_jobs SET
    status = CASE WHEN _ok THEN 'sent' ELSE 'failed' END,
    sent_at = CASE WHEN _ok THEN now() ELSE sent_at END,
    last_error = CASE WHEN _ok THEN NULL ELSE left(coalesce(_error, 'failed'), 500) END,
    due_at = CASE
      WHEN _ok THEN due_at
      ELSE now() + make_interval(secs => least(3600, 30 * power(2, least(attempts, 6))))
    END,
    updated_at = now()
  WHERE id = _id AND status = 'processing';
END;
$$;

-- ---------------------------------------------------------------------------
-- Platform policy admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_get_trial_lifecycle()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy billing.trial_policy%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO policy FROM billing.trial_policy WHERE id = true;
  RETURN jsonb_build_object(
    'policy', jsonb_build_object(
      'enabled', policy.enabled,
      'defaultDays', policy.default_days,
      'requirePaymentMethod', policy.require_payment_method,
      'firstTimeOnly', policy.first_time_only,
      'allowReuse', policy.allow_reuse,
      'allowManualGrant', policy.allow_manual_grant,
      'readOnlyAfterExpiry', policy.read_only_after_expiry,
      'version', policy.version,
      'updatedAt', policy.updated_at
    ),
    'reminders', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', r.kind,
        'enabled', r.enabled,
        'daysBeforeExpiry', r.days_before_expiry,
        'emailEnabled', r.email_enabled,
        'inappEnabled', r.inapp_enabled
      ) ORDER BY r.kind)
      FROM billing.trial_reminder_config r
    ), '[]'::jsonb),
    'countryRules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'countryCode', c.country_code,
        'enabled', c.enabled,
        'trialDays', c.trial_days,
        'requirePaymentMethod', c.require_payment_method,
        'reason', c.reason
      ) ORDER BY c.country_code)
      FROM billing.trial_country_rules c
    ), '[]'::jsonb),
    'plans', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'code', p.code,
        'name', p.name,
        'active', p.is_active,
        'trialEnabled', p.trial_enabled,
        'trialDays', p.trial_days
      ) ORDER BY p.plan_rank, p.code)
      FROM public.billing_plans p
      WHERE p.pricing_source = 'price_book' OR p.code IN ('standard', 'pro', 'business', 'practice')
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_trial_lifecycle_policy(
  _enabled boolean,
  _default_days integer,
  _require_payment_method boolean,
  _first_time_only boolean,
  _allow_reuse boolean,
  _allow_manual_grant boolean,
  _read_only_after_expiry boolean,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before billing.trial_policy%ROWTYPE;
  after_row billing.trial_policy%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF _default_days IS NULL OR _default_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'Default trial days must be between 1 and 365';
  END IF;
  SELECT * INTO before FROM billing.trial_policy WHERE id = true FOR UPDATE;
  UPDATE billing.trial_policy SET
    enabled = coalesce(_enabled, enabled),
    default_days = _default_days,
    require_payment_method = coalesce(_require_payment_method, require_payment_method),
    first_time_only = coalesce(_first_time_only, first_time_only),
    allow_reuse = coalesce(_allow_reuse, allow_reuse),
    allow_manual_grant = coalesce(_allow_manual_grant, allow_manual_grant),
    read_only_after_expiry = coalesce(_read_only_after_expiry, read_only_after_expiry),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = true
  RETURNING * INTO after_row;

  INSERT INTO billing.trial_policy_versions (version, snapshot, reason, created_by)
  VALUES (
    after_row.version,
    jsonb_build_object(
      'enabled', after_row.enabled,
      'defaultDays', after_row.default_days,
      'requirePaymentMethod', after_row.require_payment_method,
      'firstTimeOnly', after_row.first_time_only,
      'allowReuse', after_row.allow_reuse,
      'allowManualGrant', after_row.allow_manual_grant,
      'readOnlyAfterExpiry', after_row.read_only_after_expiry
    ),
    trim(_reason),
    auth.uid()
  );

  -- Keep legacy billing_settings + signup trial plan in step when enabled.
  UPDATE public.billing_settings SET
    trial_days = after_row.default_days,
    updated_at = now()
  WHERE id = true;

  PERFORM private.platform_log(
    'trial_policy.updated',
    'trial_policy',
    after_row.version::text,
    jsonb_build_object('enabled', before.enabled, 'defaultDays', before.default_days, 'version', before.version),
    jsonb_build_object('enabled', after_row.enabled, 'defaultDays', after_row.default_days, 'version', after_row.version),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'version', after_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_trial_reminder_config(
  _kind text,
  _enabled boolean,
  _email_enabled boolean,
  _inapp_enabled boolean,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  UPDATE billing.trial_reminder_config SET
    enabled = coalesce(_enabled, enabled),
    email_enabled = coalesce(_email_enabled, email_enabled),
    inapp_enabled = coalesce(_inapp_enabled, inapp_enabled)
  WHERE kind = _kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reminder kind'; END IF;
  PERFORM private.platform_log(
    'trial_reminder_config.updated',
    'trial_reminder',
    _kind,
    NULL,
    jsonb_build_object('enabled', _enabled, 'email', _email_enabled, 'inapp', _inapp_enabled),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'kind', _kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_trial_country_rule(
  _country_code text,
  _enabled boolean,
  _trial_days integer,
  _require_payment_method boolean,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text := upper(trim(_country_code));
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF code !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Country code must be ISO-2'; END IF;
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF _trial_days IS NOT NULL AND _trial_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'Trial days must be between 1 and 365';
  END IF;
  INSERT INTO billing.trial_country_rules (
    country_code, enabled, trial_days, require_payment_method, reason, updated_by
  ) VALUES (
    code, _enabled, _trial_days, _require_payment_method, trim(_reason), auth.uid()
  )
  ON CONFLICT (country_code) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    trial_days = EXCLUDED.trial_days,
    require_payment_method = EXCLUDED.require_payment_method,
    reason = EXCLUDED.reason,
    updated_at = now(),
    updated_by = auth.uid();
  PERFORM private.platform_log(
    'trial_country_rule.upserted',
    'trial_country',
    code,
    NULL,
    jsonb_build_object('enabled', _enabled, 'trialDays', _trial_days),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'countryCode', code);
END;
$$;

-- Enhanced extend: days OR absolute end; can revive expired no-card trials.
-- Drop the 3-arg overload from 20261128140000 so callers use one signature.
DROP FUNCTION IF EXISTS public.platform_extend_company_trial(uuid, integer, text);
CREATE OR REPLACE FUNCTION public.platform_extend_company_trial(
  _company_id uuid,
  _extra_days integer,
  _reason text,
  _notes text DEFAULT '',
  _new_ends_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _prev timestamptz;
  _ends timestamptz;
  _policy jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF char_length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company has no subscription row'; END IF;
  IF _sub.provider IN ('stripe', 'razorpay') THEN
    RAISE EXCEPTION
      'This company has a provider subscription. Extending a no-card trial does not change Stripe/Razorpay renewal dates — grant a complimentary month instead.';
  END IF;
  _policy := billing.resolve_trial_policy(_company_id, _sub.plan_code);
  IF (_policy ->> 'allowManualGrant')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Manual trial grants are disabled by trial policy';
  END IF;

  _prev := _sub.trial_ends_at;
  IF _new_ends_at IS NOT NULL THEN
    IF _new_ends_at <= now() THEN
      RAISE EXCEPTION 'New trial end must be in the future';
    END IF;
    _ends := _new_ends_at;
  ELSE
    IF coalesce(_extra_days, 0) < 1 OR _extra_days > 366 THEN
      RAISE EXCEPTION 'Extra days must be between 1 and 366';
    END IF;
    _ends := coalesce(GREATEST(_sub.trial_ends_at, now()), now())
             + make_interval(days => _extra_days);
  END IF;

  UPDATE public.company_subscriptions SET
    status = 'trialing',
    provider = 'none',
    trial_started_at = coalesce(trial_started_at, now()),
    trial_ends_at = _ends,
    updated_at = now()
  WHERE company_id = _company_id;

  INSERT INTO billing.trial_extensions (
    company_id, previous_ends_at, new_ends_at, days_added, source, reason, notes, created_by
  ) VALUES (
    _company_id, _prev, _ends,
    CASE WHEN _prev IS NULL THEN NULL
         ELSE greatest(0, ceil(extract(epoch FROM (_ends - coalesce(GREATEST(_prev, now()), now()))) / 86400.0)::int)
    END,
    'manual', trim(_reason), coalesce(_notes, ''), auth.uid()
  );

  INSERT INTO billing.trial_grants (company_id, user_id, plan_code, started_at, ends_at, source)
  VALUES (_company_id, auth.uid(), _sub.plan_code, coalesce(_sub.trial_started_at, now()), _ends, 'manual')
  ON CONFLICT (company_id) DO UPDATE
    SET ends_at = EXCLUDED.ends_at,
        source = 'manual',
        started_at = LEAST(billing.trial_grants.started_at, EXCLUDED.started_at);

  PERFORM billing.schedule_trial_reminders(_company_id);

  PERFORM private.platform_log(
    'subscription.extend_trial',
    'company',
    _company_id::text,
    jsonb_build_object('previousEndsAt', _prev),
    jsonb_build_object('companyId', _company_id, 'trialEndsAt', _ends),
    trim(_reason)
  );
  RETURN jsonb_build_object('ok', true, 'trialEndsAt', _ends, 'previousEndsAt', _prev);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_company_trial_detail(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.company_subscriptions%ROWTYPE;
  _company public.companies%ROWTYPE;
BEGIN
  PERFORM private.require_platform('subscriptions.view');
  SELECT * INTO _company FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown company'; END IF;
  SELECT * INTO _sub FROM public.company_subscriptions WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'company', jsonb_build_object(
      'id', _company.id,
      'name', _company.name,
      'countryCode', _company.country_code,
      'timezone', coalesce(_company.timezone, 'UTC')
    ),
    'subscription', CASE WHEN _sub.company_id IS NULL THEN NULL ELSE jsonb_build_object(
      'planCode', _sub.plan_code,
      'status', _sub.status,
      'provider', _sub.provider,
      'trialStartedAt', _sub.trial_started_at,
      'trialEndsAt', _sub.trial_ends_at,
      'remainingDays', CASE
        WHEN _sub.trial_ends_at IS NULL THEN NULL
        ELSE greatest(0, ceil(extract(epoch FROM (_sub.trial_ends_at - now())) / 86400.0)::int)
      END
    ) END,
    'resolvedPolicy', billing.resolve_trial_policy(_company_id, _sub.plan_code),
    'extensions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'previousEndsAt', e.previous_ends_at,
        'newEndsAt', e.new_ends_at,
        'daysAdded', e.days_added,
        'reason', e.reason,
        'notes', e.notes,
        'createdAt', e.created_at,
        'createdBy', e.created_by
      ) ORDER BY e.created_at DESC)
      FROM (
        SELECT * FROM billing.trial_extensions
         WHERE company_id = _company_id
         ORDER BY created_at DESC LIMIT 50
      ) e
    ), '[]'::jsonb),
    'reminders', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', j.id,
        'kind', j.kind,
        'dueAt', j.due_at,
        'status', j.status,
        'attempts', j.attempts,
        'sentAt', j.sent_at,
        'lastError', j.last_error,
        'trialEndsAt', j.trial_ends_at
      ) ORDER BY j.due_at)
      FROM billing.trial_reminder_jobs j
      WHERE j.company_id = _company_id
    ), '[]'::jsonb)
  );
END;
$$;

-- Cancel reminders when leaving no-card trial (paid convert / expire / complimentary).
CREATE OR REPLACE FUNCTION billing.company_subscription_trial_reminder_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.provider IN ('stripe', 'razorpay')
       OR NEW.status IN ('active', 'complimentary', 'expired', 'cancelled') THEN
      IF OLD.status = 'trialing' AND OLD.provider = 'none' THEN
        PERFORM billing.cancel_trial_reminders(NEW.company_id, 'subscription_left_trial');
      END IF;
    END IF;
    IF NEW.status = 'trialing' AND NEW.provider = 'none'
       AND NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
      PERFORM billing.schedule_trial_reminders(NEW.company_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_subscriptions_trial_reminders ON public.company_subscriptions;
CREATE TRIGGER company_subscriptions_trial_reminders
  AFTER UPDATE OF status, provider, trial_ends_at ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION billing.company_subscription_trial_reminder_trigger();

-- Extend lifecycle sweep: schedule reminders for live trials missing jobs; expire grants already handled.
CREATE OR REPLACE FUNCTION billing.ensure_trial_reminders(_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec record;
  n integer := 0;
BEGIN
  FOR rec IN
    SELECT s.company_id
      FROM public.company_subscriptions s
     WHERE s.status = 'trialing'
       AND s.provider = 'none'
       AND s.trial_ends_at > now()
       AND NOT EXISTS (
         SELECT 1 FROM billing.trial_reminder_jobs j
          WHERE j.company_id = s.company_id
            AND j.status IN ('pending', 'processing', 'sent')
            AND j.trial_ends_at = s.trial_ends_at
       )
     ORDER BY s.trial_ends_at
     LIMIT greatest(1, least(coalesce(_limit, 50), 200))
  LOOP
    PERFORM billing.schedule_trial_reminders(rec.company_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Public service-role wrappers so supabaseAdmin.rpc can invoke billing.* workers.
CREATE OR REPLACE FUNCTION public.billing_claim_due_trial_reminders(_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT billing.claim_due_trial_reminders(_limit);
$$;
CREATE OR REPLACE FUNCTION public.billing_finish_trial_reminder(_id uuid, _ok boolean, _error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT billing.finish_trial_reminder(_id, _ok, _error);
$$;
CREATE OR REPLACE FUNCTION public.billing_ensure_trial_reminders(_limit integer DEFAULT 50)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT billing.ensure_trial_reminders(_limit);
$$;
CREATE OR REPLACE FUNCTION public.billing_schedule_trial_reminders(_company_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT billing.schedule_trial_reminders(_company_id);
$$;

REVOKE ALL ON FUNCTION billing.resolve_trial_policy(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION billing.cancel_trial_reminders(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION billing.schedule_trial_reminders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION billing.claim_due_trial_reminders(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION billing.finish_trial_reminder(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION billing.ensure_trial_reminders(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_claim_due_trial_reminders(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_finish_trial_reminder(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_ensure_trial_reminders(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_schedule_trial_reminders(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_due_trial_reminders(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_finish_trial_reminder(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_ensure_trial_reminders(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_schedule_trial_reminders(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_get_trial_lifecycle() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_trial_lifecycle_policy(boolean, integer, boolean, boolean, boolean, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_trial_reminder_config(text, boolean, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_trial_country_rule(text, boolean, integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_company_trial_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_trial_lifecycle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_trial_lifecycle_policy(boolean, integer, boolean, boolean, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_trial_reminder_config(text, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_trial_country_rule(text, boolean, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_company_trial_detail(uuid) TO authenticated;
-- platform_extend_company_trial already granted in prior migration; re-grant after replace.
GRANT EXECUTE ON FUNCTION public.platform_extend_company_trial(uuid, integer, text, text, timestamptz) TO authenticated;
