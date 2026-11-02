-- Entitlement overrides, feature price book and approvals.
-- Additive. Does not drop ledger tables or existing plan versions.
-- Reverse: reapply public.get_entitlements from 20261030140000_billing_platform.sql,
-- private.platform_overview, private.platform_context and private.platform_can from
-- 20261030144257_superadmin_control_plane.sql, drop the hash trigger, and leave the
-- new tables in place. Do not delete audit rows or customer accounting data.
-- source rank: kill_switch suspension revoke grant addon trial plan default
-- scope rank: user business firm plan global

ALTER TABLE public.billing_features
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'module',
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'accounting',
  ADD COLUMN IF NOT EXISTS metering text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cost_tag text,
  ADD COLUMN IF NOT EXISTS catalogue_status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS default_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1;

INSERT INTO public.billing_features (key, label, description, category, module, metering, cost_tag, catalogue_status, default_enabled)
VALUES
  ('companies', 'Companies', 'Organisations included on the plan.', 'limit', 'accounting', 'count', NULL, 'live', true),
  ('users', 'Users', 'Active member seats, excluding accountant seats.', 'limit', 'accounting', 'count', NULL, 'live', true),
  ('accountant_seats', 'Accountant seats', 'External accountant seats.', 'limit', 'accounting', 'count', NULL, 'live', true),
  ('invoices', 'Invoices per month', 'Sales invoices created in the current month.', 'limit', 'sales', 'count', NULL, 'live', true),
  ('bills', 'Bills per month', 'Purchase bills created in the current month.', 'limit', 'purchases', 'count', NULL, 'live', true),
  ('storage_bytes', 'File storage', 'Stored attachment bytes.', 'limit', 'documents', 'bytes', 'storage_gb', 'live', true),
  ('ai_queries', 'AI questions per month', 'Metered AI questions.', 'add_on', 'accounting', 'count', 'ai_query', 'live', true),
  ('voice_minutes', 'Voice minutes per month', 'Metered voice assistant minutes.', 'add_on', 'accounting', 'minutes', NULL, 'live', true),
  ('bank_import', 'CSV and OFX bank import', 'File-based bank import.', 'module', 'banking', 'none', NULL, 'live', true),
  ('bank_feeds', 'Live bank feeds', 'Provider bank connections.', 'add_on', 'banking', 'count', 'bank_feed', 'live', false),
  ('multi_currency', 'Multi-currency', 'Documents in a currency other than the organisation base currency.', 'module', 'accounting', 'none', NULL, 'live', false),
  ('approvals', 'Approvals', 'Expense and document approval workflow.', 'module', 'purchases', 'none', NULL, 'live', false),
  ('client_portal', 'Client portal', 'Customer and supplier portal access.', 'add_on', 'sales', 'none', NULL, 'live', false),
  ('expense_claims', 'Expense claims', 'Employee expense claims.', 'module', 'purchases', 'none', NULL, 'live', false),
  ('inventory', 'Inventory', 'Inventory quantities on documents.', 'module', 'purchases', 'none', NULL, 'live', false),
  ('projects', 'Projects', 'Project tracking on transactions.', 'module', 'projects', 'none', NULL, 'live', false),
  ('budgeting', 'Budgeting', 'Budgets and budget reports.', 'module', 'budgets', 'none', NULL, 'live', false),
  ('custom_fields', 'Custom fields', 'Extra fields on records.', 'module', 'accounting', 'none', NULL, 'live', false),
  ('api', 'API access', 'Organisation API credentials.', 'add_on', 'accounting', 'count', NULL, 'live', false),
  ('audit_centre', 'Advanced audit centre', 'Extended audit views.', 'add_on', 'accounting', 'none', NULL, 'live', false),
  ('white_label', 'White-label portal', 'Branded portal for a firm.', 'add_on', 'accounting', 'none', NULL, 'live', false),
  ('accounting', 'Accounting module', 'Ledger writes guarded as the accounting module.', 'module', 'accounting', 'none', NULL, 'live', true),
  ('sales', 'Sales module', 'Sales document writes.', 'module', 'sales', 'none', NULL, 'live', true),
  ('purchases', 'Purchases module', 'Purchase document writes.', 'module', 'purchases', 'none', NULL, 'live', true),
  ('banking', 'Banking module', 'Banking writes.', 'module', 'banking', 'none', NULL, 'live', true),
  ('budgets', 'Budgets module', 'Budget writes.', 'module', 'budgets', 'none', NULL, 'live', true),
  ('fixed_assets', 'Fixed assets module', 'Fixed asset writes.', 'module', 'fixed_assets', 'none', NULL, 'live', true),
  ('documents', 'Documents module', 'Document writes.', 'module', 'documents', 'none', NULL, 'live', true)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  metering = EXCLUDED.metering,
  cost_tag = EXCLUDED.cost_tag,
  catalogue_status = EXCLUDED.catalogue_status,
  default_enabled = EXCLUDED.default_enabled;

CREATE TABLE IF NOT EXISTS public.entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES public.billing_features(key),
  scope text NOT NULL CHECK (scope IN ('user', 'business', 'firm', 'plan', 'global')),
  scope_id uuid,
  plan_code text,
  source text NOT NULL CHECK (source IN ('kill_switch', 'suspension', 'revoke', 'grant', 'addon', 'trial', 'plan', 'default')),
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  limit_value bigint,
  starts_at timestamptz,
  expires_at timestamptz,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  notes text NOT NULL DEFAULT '',
  approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  CHECK (
    (scope IN ('user', 'business', 'firm') AND scope_id IS NOT NULL)
    OR (scope = 'plan' AND plan_code IS NOT NULL)
    OR scope = 'global'
  )
);

CREATE INDEX IF NOT EXISTS entitlement_overrides_lookup
  ON public.entitlement_overrides (feature_key, scope, scope_id)
  WHERE approval_status = 'approved';

CREATE TABLE IF NOT EXISTS public.feature_dependencies (
  feature_key text NOT NULL REFERENCES public.billing_features(key),
  other_key text NOT NULL REFERENCES public.billing_features(key),
  kind text NOT NULL CHECK (kind IN ('requires', 'conflicts', 'optional')),
  PRIMARY KEY (feature_key, other_key, kind)
);

INSERT INTO public.feature_dependencies (feature_key, other_key, kind) VALUES
  ('bank_feeds', 'bank_import', 'requires'),
  ('white_label', 'client_portal', 'requires'),
  ('inventory', 'purchases', 'requires'),
  ('inventory', 'projects', 'optional')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.feature_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES public.billing_features(key),
  model text NOT NULL CHECK (model IN ('included', 'flat', 'per_user', 'per_unit', 'tiered', 'volume', 'usage')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency IN ('USD', 'GBP', 'AUD', 'NZD', 'INR')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  min_qty integer NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  max_qty integer,
  included_qty integer NOT NULL DEFAULT 0 CHECK (included_qty >= 0),
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax_treatment text NOT NULL DEFAULT 'unspecified' CHECK (tax_treatment IN ('exclusive', 'inclusive', 'exempt', 'unspecified')),
  tax_bps integer NOT NULL DEFAULT 0 CHECK (tax_bps BETWEEN 0 AND 10000),
  effective_from timestamptz,
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  version_no integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.feature_prices(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_qty IS NULL OR max_qty >= min_qty),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS feature_prices_live
  ON public.feature_prices (feature_key, currency, billing_interval)
  WHERE status = 'live';

CREATE TABLE IF NOT EXISTS public.feature_rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL REFERENCES public.billing_features(key),
  mode text NOT NULL CHECK (mode IN ('immediate', 'scheduled', 'percentage', 'allowlist', 'internal', 'trial', 'region', 'killed')),
  percent integer NOT NULL DEFAULT 100 CHECK (percent BETWEEN 0 AND 100),
  allowlist uuid[] NOT NULL DEFAULT '{}',
  target_region text,
  starts_at timestamptz,
  ends_at timestamptz,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('entitlement', 'price', 'refund', 'role', 'break_glass')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requester_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  decided_by uuid,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_requests_pending
  ON public.approval_requests (status, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.entitlement_overrides, public.feature_dependencies, public.feature_prices,
  public.feature_rollouts, public.approval_requests FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.feature_dependencies, public.billing_features TO authenticated;

CREATE OR REPLACE FUNCTION public.winning_entitlements(_company_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan text;
  _version uuid;
  _result jsonb;
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
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.winning_entitlements(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_entitlements(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.platform_set_entitlement(
  _feature text,
  _scope text,
  _scope_id uuid,
  _plan_code text,
  _source text,
  _effect text,
  _starts timestamptz,
  _expires timestamptz,
  _reason text,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _company uuid;
BEGIN
  PERFORM private.require_platform('features.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_features WHERE key = _feature) THEN
    RAISE EXCEPTION 'Unknown feature';
  END IF;
  IF _source NOT IN ('kill_switch', 'suspension', 'revoke', 'grant', 'addon', 'trial')
     OR _effect NOT IN ('allow', 'deny')
     OR _scope NOT IN ('user', 'business', 'firm', 'plan', 'global') THEN
    RAISE EXCEPTION 'Invalid entitlement change';
  END IF;
  IF _scope IN ('user', 'business', 'firm') AND _scope_id IS NULL THEN
    RAISE EXCEPTION 'This scope needs an id';
  END IF;
  IF _scope = 'plan' AND nullif(trim(coalesce(_plan_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A plan scope needs a plan code';
  END IF;
  IF _source IN ('kill_switch') OR _scope = 'global' THEN
    INSERT INTO public.approval_requests (kind, requester_id, reason, impact, payload, expires_at)
    VALUES (
      'entitlement', auth.uid(), trim(_reason),
      jsonb_build_object('feature', _feature, 'scope', _scope, 'effect', _effect),
      jsonb_build_object(
        'feature', _feature, 'scope', _scope, 'scopeId', _scope_id, 'planCode', _plan_code,
        'source', _source, 'effect', _effect, 'startsAt', _starts, 'expiresAt', _expires, 'notes', coalesce(_notes, '')
      ),
      now() + interval '7 days'
    )
    RETURNING id INTO _id;
    PERFORM private.platform_log('approval.request', 'approval', _id::text, NULL,
      jsonb_build_object('feature', _feature, 'scope', _scope), trim(_reason));
    RETURN jsonb_build_object('ok', true, 'pending', true, 'id', _id);
  END IF;
  _company := CASE WHEN _scope = 'business' THEN _scope_id ELSE NULL END;
  IF _effect = 'allow' AND _company IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.feature_dependencies d
    WHERE d.feature_key = _feature AND d.kind = 'requires'
      AND COALESCE((public.winning_entitlements(_company, NULL) -> d.other_key ->> 'allowed')::boolean, false) IS FALSE
  ) THEN
    RAISE EXCEPTION 'A required feature is not entitled for this business';
  END IF;
  INSERT INTO public.entitlement_overrides (
    feature_key, scope, scope_id, plan_code, source, effect, starts_at, expires_at, reason, notes, approval_status, created_by
  ) VALUES (
    _feature, _scope, _scope_id, _plan_code, _source, _effect, _starts, _expires, trim(_reason), coalesce(_notes, ''), 'approved', auth.uid()
  ) RETURNING id INTO _id;
  PERFORM private.platform_log('entitlement.set', 'entitlement', _id::text, NULL,
    jsonb_build_object('feature', _feature, 'scope', _scope, 'effect', _effect, 'source', _source), trim(_reason));
  RETURN jsonb_build_object('ok', true, 'pending', false, 'id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_approvals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('approvals.view');
  RETURN jsonb_build_object('rows', COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
    FROM (
      SELECT id, kind, status, requester_id, reason, impact, expires_at, created_at
      FROM public.approval_requests
      WHERE status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 100
    ) r
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_decide_approval(_id uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.approval_requests%ROWTYPE;
  _override uuid;
BEGIN
  PERFORM private.require_platform('approvals.manage');
  IF _decision NOT IN ('approved', 'rejected') OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record an approve or reject decision and a reason';
  END IF;
  SELECT * INTO _row FROM public.approval_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'pending' OR _row.expires_at <= now() THEN
    RAISE EXCEPTION 'That approval is no longer pending';
  END IF;
  IF _row.requester_id = auth.uid() THEN
    RAISE EXCEPTION 'A second person must decide this request';
  END IF;
  IF _decision = 'approved' AND _row.kind = 'entitlement' THEN
    INSERT INTO public.entitlement_overrides (
      feature_key, scope, scope_id, plan_code, source, effect, starts_at, expires_at, reason, notes, approval_status, created_by
    ) VALUES (
      _row.payload ->> 'feature',
      _row.payload ->> 'scope',
      NULLIF(_row.payload ->> 'scopeId', '')::uuid,
      NULLIF(_row.payload ->> 'planCode', ''),
      _row.payload ->> 'source',
      _row.payload ->> 'effect',
      NULLIF(_row.payload ->> 'startsAt', '')::timestamptz,
      NULLIF(_row.payload ->> 'expiresAt', '')::timestamptz,
      _row.reason,
      coalesce(_row.payload ->> 'notes', ''),
      'approved',
      _row.requester_id
    ) RETURNING id INTO _override;
  END IF;
  UPDATE public.approval_requests
  SET status = _decision, decided_by = auth.uid(), decision_reason = trim(_reason), decided_at = now()
  WHERE id = _id;
  PERFORM private.platform_log('approval.decide', 'approval', _id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', _decision, 'override', _override),
    trim(_reason));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_entitlement(text, text, uuid, text, text, text, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_list_approvals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_entitlement(text, text, uuid, text, text, text, timestamptz, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_approvals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_decide_approval(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_can(_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(auth.jwt()->>'aal' = 'aal2' AND private.platform_session_ok() AND (
 public.platform_role() = 'platform_owner'
 OR (public.platform_role() = 'platform_finance' AND _permission IN ('overview.view', 'subscriptions.view', 'billing.view', 'billing.manage', 'approvals.view'))
 OR (public.platform_role() = 'platform_support' AND _permission IN ('overview.view', 'businesses.view', 'users.view', 'firms.view', 'support.view', 'support.manage', 'notifications.view'))
 OR EXISTS(SELECT 1 FROM public.platform_role_assignments a JOIN public.platform_custom_roles r ON r.id = a.role_id
 WHERE a.user_id = auth.uid() AND r.scope = 'platform' AND a.scope_id IS NULL AND _permission = ANY(r.permissions))
 ), false);
$$;

CREATE OR REPLACE FUNCTION private.platform_context() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE perms text[]; BEGIN
 IF NOT private.platform_session_ok() OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN
   RAISE EXCEPTION 'Enroll and complete MFA in Profile → Security before opening the control centre' USING ERRCODE = '42501';
 END IF;
 SELECT array_agg(p) INTO perms FROM unnest(ARRAY[
   'overview.view','businesses.view','businesses.manage','firms.view','firms.manage','users.view','users.manage',
   'roles.view','roles.manage','subscriptions.view','billing.view','billing.manage','accounting.view','accounting.manage',
   'features.view','features.manage','integrations.view','integrations.manage','api.view','api.manage','monitoring.view',
   'audit.view','support.view','support.manage','notifications.view','notifications.manage','settings.view','settings.manage',
   'approvals.view','approvals.manage'
 ]) p WHERE private.platform_can(p);
 IF perms IS NULL THEN RAISE EXCEPTION 'This console is limited to authorized platform staff' USING ERRCODE = '42501'; END IF;
 RETURN jsonb_build_object('role', coalesce(public.platform_role(), 'custom'), 'permissions', perms, 'userId', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION private.platform_overview(_from date, _to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; BEGIN
 PERFORM private.require_platform('overview.view');
 IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 730 THEN
   RAISE EXCEPTION 'Select a date range of up to 730 days';
 END IF;
 SELECT jsonb_build_object(
 'businesses', (SELECT count(*) FROM public.companies WHERE NOT is_demo),
 'activeBusinesses', (SELECT count(*) FROM public.companies c LEFT JOIN public.platform_tenant_controls x ON x.company_id = c.id WHERE NOT c.is_demo AND c.archived_at IS NULL AND coalesce(x.status, 'active') = 'active'),
 'inactiveBusinesses', (SELECT count(*) FROM public.platform_tenant_controls x JOIN public.companies c ON c.id = x.company_id WHERE NOT c.is_demo AND x.status = 'inactive'),
 'suspendedBusinesses', (SELECT count(*) FROM public.platform_tenant_controls x JOIN public.companies c ON c.id = x.company_id WHERE NOT c.is_demo AND x.status = 'suspended'),
 'trialAccounts', (SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id WHERE NOT c.is_demo AND s.status = 'trialing' AND s.trial_ends_at > now()),
 'users', (SELECT count(*) FROM auth.users),
 'activeUsers', (SELECT count(*) FROM auth.users u WHERE u.last_sign_in_at >= now() - interval '30 days' AND (u.banned_until IS NULL OR u.banned_until <= now()) AND NOT EXISTS (SELECT 1 FROM public.platform_user_controls x WHERE x.user_id = u.id AND x.status <> 'active')),
 'firms', (SELECT count(*) FROM public.firms),
 'subscriptions', (SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id WHERE NOT c.is_demo),
 'cancellations', (SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id WHERE NOT c.is_demo AND (s.cancel_at_period_end OR s.status = 'cancelled')),
 'pastDue', (SELECT count(*) FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id WHERE NOT c.is_demo AND s.status = 'past_due'),
 'revenueState', CASE
   WHEN NOT private.platform_can('billing.view') THEN 'forbidden'
   WHEN NOT EXISTS (
     SELECT 1 FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id
     WHERE NOT c.is_demo AND s.status = 'active' AND s.unit_amount_minor IS NOT NULL
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
   ) THEN 'empty'
   ELSE 'ok' END,
 'revenue', CASE WHEN private.platform_can('billing.view') THEN (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]') FROM (
   SELECT s.currency,
     sum(s.unit_amount_minor / CASE WHEN s.billing_interval = 'year' THEN 12 ELSE 1 END)::bigint AS mrr_minor,
     (sum(s.unit_amount_minor / CASE WHEN s.billing_interval = 'year' THEN 12 ELSE 1 END) * 12)::bigint AS arr_minor
   FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id
   WHERE NOT c.is_demo AND s.status = 'active' AND s.unit_amount_minor IS NOT NULL
     AND (s.current_period_end IS NULL OR s.current_period_end > now())
   GROUP BY s.currency) r) ELSE '[]'::jsonb END,
 'registrations', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]') FROM (
   SELECT d::date AS day, count(c.id) AS businesses FROM generate_series(_from::timestamp, _to::timestamp, interval '1 day') d
   LEFT JOIN public.companies c ON c.created_at >= d AND c.created_at < d + interval '1 day' AND NOT c.is_demo GROUP BY d ORDER BY d) r),
 'plans', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]') FROM (
   SELECT s.plan_code, count(*) AS subscriptions FROM public.company_subscriptions s
   JOIN public.companies c ON c.id = s.company_id WHERE NOT c.is_demo GROUP BY s.plan_code ORDER BY s.plan_code) r),
 'measuredAt', now()) INTO result;
 RETURN result;
END $$;

ALTER TABLE public.platform_audit
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash text;

CREATE OR REPLACE FUNCTION private.platform_audit_hash() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE payload text;
BEGIN
  PERFORM pg_advisory_xact_lock(814201);
  NEW.prev_hash := (SELECT a.row_hash FROM public.platform_audit a ORDER BY a.id DESC LIMIT 1);
  payload := concat_ws('|', coalesce(NEW.prev_hash, ''), coalesce(NEW.actor_user_id::text, ''), NEW.action,
    NEW.entity_type, NEW.entity_id, coalesce(NEW.reason, ''), coalesce(NEW.before_state::text, ''), coalesce(NEW.after_state::text, ''));
  NEW.row_hash := md5(payload);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS platform_audit_hash ON public.platform_audit;
CREATE TRIGGER platform_audit_hash BEFORE INSERT ON public.platform_audit
  FOR EACH ROW EXECUTE FUNCTION private.platform_audit_hash();

CREATE OR REPLACE FUNCTION public.list_live_feature_prices()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'featureKey', feature_key,
    'model', model,
    'amountMinor', amount_minor,
    'currency', currency,
    'interval', billing_interval,
    'minQty', min_qty,
    'maxQty', max_qty,
    'includedQty', included_qty,
    'tiers', tiers,
    'taxTreatment', tax_treatment,
    'taxBps', tax_bps
  )), '[]'::jsonb)
  FROM public.feature_prices
  WHERE status = 'live'
    AND (effective_from IS NULL OR effective_from <= now())
    AND (effective_to IS NULL OR effective_to > now());
$$;

REVOKE ALL ON FUNCTION public.list_live_feature_prices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_live_feature_prices() TO anon, authenticated;
