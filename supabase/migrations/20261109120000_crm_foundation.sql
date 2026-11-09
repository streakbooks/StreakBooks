-- CRM-02 foundation: settings, sources, pipelines, leads, opportunities, activities.
-- Additive and idempotent. Does not post journals or duplicate contacts.
-- Clients SELECT under RLS; mutations use SECURITY DEFINER RPCs with permission checks.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'crm.view'),
  ('admin', 'crm.view'),
  ('accountant', 'crm.view'),
  ('bookkeeper', 'crm.view'),
  ('staff', 'crm.view'),
  ('read_only', 'crm.view'),

  ('owner', 'crm.leads.manage'),
  ('admin', 'crm.leads.manage'),
  ('accountant', 'crm.leads.manage'),
  ('staff', 'crm.leads.manage'),

  ('owner', 'crm.opportunities.manage'),
  ('admin', 'crm.opportunities.manage'),
  ('accountant', 'crm.opportunities.manage'),
  ('staff', 'crm.opportunities.manage'),

  ('owner', 'crm.activities.manage'),
  ('admin', 'crm.activities.manage'),
  ('accountant', 'crm.activities.manage'),
  ('staff', 'crm.activities.manage'),

  ('owner', 'crm.campaigns.manage'),
  ('admin', 'crm.campaigns.manage'),

  ('owner', 'crm.automation.manage'),
  ('admin', 'crm.automation.manage'),

  ('owner', 'crm.reports.view'),
  ('admin', 'crm.reports.view'),
  ('accountant', 'crm.reports.view'),
  ('read_only', 'crm.reports.view'),

  ('owner', 'crm.export'),
  ('admin', 'crm.export'),
  ('accountant', 'crm.export'),

  ('owner', 'crm.import'),
  ('admin', 'crm.import'),

  ('owner', 'crm.admin'),
  ('admin', 'crm.admin')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  lead_number_prefix TEXT NOT NULL DEFAULT 'LEAD-'
    CHECK (char_length(trim(lead_number_prefix)) BETWEEN 1 AND 12),
  opportunity_number_prefix TEXT NOT NULL DEFAULT 'OPP-'
    CHECK (char_length(trim(opportunity_number_prefix)) BETWEEN 1 AND 12),
  stale_deal_days INTEGER NOT NULL DEFAULT 30
    CHECK (stale_deal_days BETWEEN 1 AND 3650),
  default_pipeline_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Lead sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_lead_sources_code_len CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  CONSTRAINT crm_lead_sources_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_sources_company_code_uidx
  ON public.crm_lead_sources (company_id, lower(code));
CREATE INDEX IF NOT EXISTS crm_lead_sources_company_active_idx
  ON public.crm_lead_sources (company_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Pipelines & stages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_pipelines_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS crm_pipelines_company_active_idx
  ON public.crm_pipelines (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  probability_pct INTEGER NOT NULL DEFAULT 0 CHECK (probability_pct BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_pipeline_stages_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT crm_pipeline_stages_won_lost CHECK (NOT (is_won AND is_lost))
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_pipeline_stages_pipeline_name_uidx
  ON public.crm_pipeline_stages (pipeline_id, lower(name));
CREATE INDEX IF NOT EXISTS crm_pipeline_stages_pipeline_sort_idx
  ON public.crm_pipeline_stages (pipeline_id, sort_order);

ALTER TABLE public.crm_settings
  DROP CONSTRAINT IF EXISTS crm_settings_default_pipeline_fkey;
ALTER TABLE public.crm_settings
  ADD CONSTRAINT crm_settings_default_pipeline_fkey
  FOREIGN KEY (default_pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new', 'contacted', 'qualified', 'nurturing', 'converted', 'disqualified'
    )),
  person_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (person_type IN ('individual', 'business')),
  first_name TEXT,
  last_name TEXT,
  organization_name TEXT,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  industry TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  source_id UUID REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estimated_value_minor BIGINT NOT NULL DEFAULT 0 CHECK (estimated_value_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  next_follow_up_at TIMESTAMPTZ,
  disqualified_reason TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  converted_opportunity_id UUID,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_leads_identity CHECK (
    char_length(trim(coalesce(first_name, '') || coalesce(last_name, '') || coalesce(organization_name, '') || coalesce(email, ''))) > 0
  ),
  CONSTRAINT crm_leads_converted_contact CHECK (
    status <> 'converted' OR contact_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_company_number_uidx
  ON public.crm_leads (company_id, lower(lead_number));
CREATE INDEX IF NOT EXISTS crm_leads_company_status_idx
  ON public.crm_leads (company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_company_owner_idx
  ON public.crm_leads (company_id, owner_user_id, status);
CREATE INDEX IF NOT EXISTS crm_leads_company_followup_idx
  ON public.crm_leads (company_id, next_follow_up_at)
  WHERE archived_at IS NULL AND status NOT IN ('converted', 'disqualified');
CREATE INDEX IF NOT EXISTS crm_leads_company_email_idx
  ON public.crm_leads (company_id, lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status_after TEXT,
  note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  acted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT crm_lead_events_type_len CHECK (char_length(trim(event_type)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS crm_lead_events_timeline_idx
  ON public.crm_lead_events (lead_id, acted_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_number TEXT NOT NULL,
  name TEXT NOT NULL,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'won', 'lost', 'archived')),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  primary_contact_person_id UUID REFERENCES public.contact_people(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  probability_pct INTEGER NOT NULL DEFAULT 0 CHECK (probability_pct BETWEEN 0 AND 100),
  expected_close_date DATE,
  actual_close_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  source_id UUID REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  win_reason TEXT,
  loss_reason TEXT,
  notes TEXT,
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quote_id UUID,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_opportunities_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_company_number_uidx
  ON public.crm_opportunities (company_id, lower(opportunity_number));
CREATE INDEX IF NOT EXISTS crm_opportunities_company_status_idx
  ON public.crm_opportunities (company_id, status, expected_close_date);
CREATE INDEX IF NOT EXISTS crm_opportunities_pipeline_stage_idx
  ON public.crm_opportunities (pipeline_id, stage_id, status);
CREATE INDEX IF NOT EXISTS crm_opportunities_company_owner_idx
  ON public.crm_opportunities (company_id, owner_user_id, status);
CREATE INDEX IF NOT EXISTS crm_opportunities_contact_idx
  ON public.crm_opportunities (company_id, contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_converted_opportunity_fkey;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_converted_opportunity_fkey
  FOREIGN KEY (converted_opportunity_id) REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.crm_opportunity_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  status_after TEXT,
  note TEXT,
  acted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS crm_opportunity_stage_history_opp_idx
  ON public.crm_opportunity_stage_history (opportunity_id, acted_at DESC);

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN (
      'call', 'email', 'meeting', 'demo', 'site_visit', 'message',
      'task', 'note', 'other'
    )),
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timezone TEXT,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_activities_subject_len CHECK (char_length(trim(subject)) BETWEEN 1 AND 200),
  CONSTRAINT crm_activities_link CHECK (
    lead_id IS NOT NULL OR opportunity_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS crm_activities_company_due_idx
  ON public.crm_activities (company_id, status, due_at);
CREATE INDEX IF NOT EXISTS crm_activities_owner_idx
  ON public.crm_activities (company_id, owner_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS crm_activities_lead_idx
  ON public.crm_activities (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_activities_opportunity_idx
  ON public.crm_activities (opportunity_id, created_at DESC)
  WHERE opportunity_id IS NOT NULL;

-- Document sequences
INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'crm_lead', 'LEAD-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
SELECT c.id, 'crm_opportunity', 'OPP-', 1, 4
FROM public.companies c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM settings select" ON public.crm_settings;
CREATE POLICY "CRM settings select"
  ON public.crm_settings FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'crm.view')
      OR public.has_company_permission(company_id, 'crm.admin')
    )
  );

DROP POLICY IF EXISTS "CRM lead sources select" ON public.crm_lead_sources;
CREATE POLICY "CRM lead sources select"
  ON public.crm_lead_sources FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM pipelines select" ON public.crm_pipelines;
CREATE POLICY "CRM pipelines select"
  ON public.crm_pipelines FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM pipeline stages select" ON public.crm_pipeline_stages;
CREATE POLICY "CRM pipeline stages select"
  ON public.crm_pipeline_stages FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM leads select" ON public.crm_leads;
CREATE POLICY "CRM leads select"
  ON public.crm_leads FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM lead events select" ON public.crm_lead_events;
CREATE POLICY "CRM lead events select"
  ON public.crm_lead_events FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM opportunities select" ON public.crm_opportunities;
CREATE POLICY "CRM opportunities select"
  ON public.crm_opportunities FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM opportunity history select" ON public.crm_opportunity_stage_history;
CREATE POLICY "CRM opportunity history select"
  ON public.crm_opportunity_stage_history FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

DROP POLICY IF EXISTS "CRM activities select" ON public.crm_activities;
CREATE POLICY "CRM activities select"
  ON public.crm_activities FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'crm.view')
  );

REVOKE ALL ON TABLE public.crm_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_lead_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_pipelines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_pipeline_stages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_leads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_lead_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_opportunities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_opportunity_stage_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_activities FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.crm_settings TO authenticated;
GRANT SELECT ON TABLE public.crm_lead_sources TO authenticated;
GRANT SELECT ON TABLE public.crm_pipelines TO authenticated;
GRANT SELECT ON TABLE public.crm_pipeline_stages TO authenticated;
GRANT SELECT ON TABLE public.crm_leads TO authenticated;
GRANT SELECT ON TABLE public.crm_lead_events TO authenticated;
GRANT SELECT ON TABLE public.crm_opportunities TO authenticated;
GRANT SELECT ON TABLE public.crm_opportunity_stage_history TO authenticated;
GRANT SELECT ON TABLE public.crm_activities TO authenticated;

GRANT ALL ON TABLE public.crm_settings TO service_role;
GRANT ALL ON TABLE public.crm_lead_sources TO service_role;
GRANT ALL ON TABLE public.crm_pipelines TO service_role;
GRANT ALL ON TABLE public.crm_pipeline_stages TO service_role;
GRANT ALL ON TABLE public.crm_leads TO service_role;
GRANT ALL ON TABLE public.crm_lead_events TO service_role;
GRANT ALL ON TABLE public.crm_opportunities TO service_role;
GRANT ALL ON TABLE public.crm_opportunity_stage_history TO service_role;
GRANT ALL ON TABLE public.crm_activities TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.crm_require_permission(_company_id UUID, _permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, _permission) THEN
    RAISE EXCEPTION 'Missing permission %', _permission USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.crm_allocate_number(
  _company_id UUID,
  _document_type TEXT,
  _fallback_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _prefix TEXT;
  _next BIGINT;
  _padding INT;
BEGIN
  INSERT INTO public.document_sequences (company_id, document_type, prefix, next_number, padding)
  VALUES (_company_id, _document_type, _fallback_prefix, 1, 4)
  ON CONFLICT (company_id, document_type) DO NOTHING;

  UPDATE public.document_sequences
  SET next_number = next_number + 1
  WHERE company_id = _company_id AND document_type = _document_type
  RETURNING prefix, next_number - 1, padding INTO _prefix, _next, _padding;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Could not allocate % number', _document_type;
  END IF;
  RETURN _prefix || lpad(_next::text, GREATEST(_padding, 1), '0');
END;
$$;

CREATE OR REPLACE FUNCTION private.crm_seed_defaults(_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _pipeline_id UUID;
  _stage_id UUID;
BEGIN
  INSERT INTO public.crm_lead_sources (company_id, code, name, sort_order)
  VALUES
    (_company_id, 'website', 'Website', 10),
    (_company_id, 'referral', 'Referral', 20),
    (_company_id, 'cold_call', 'Cold call', 30),
    (_company_id, 'partner', 'Partner', 40),
    (_company_id, 'import', 'Import', 50),
    (_company_id, 'other', 'Other', 90)
  ON CONFLICT (company_id, lower(code)) DO NOTHING;

  SELECT id INTO _pipeline_id
  FROM public.crm_pipelines
  WHERE company_id = _company_id AND is_default = true
  LIMIT 1;

  IF _pipeline_id IS NULL THEN
    INSERT INTO public.crm_pipelines (company_id, name, description, is_default, sort_order)
    VALUES (_company_id, 'Sales', 'Default sales pipeline', true, 10)
    RETURNING id INTO _pipeline_id;

    INSERT INTO public.crm_pipeline_stages (
      company_id, pipeline_id, name, probability_pct, sort_order, is_won, is_lost
    ) VALUES
      (_company_id, _pipeline_id, 'Qualification', 10, 10, false, false),
      (_company_id, _pipeline_id, 'Needs analysis', 25, 20, false, false),
      (_company_id, _pipeline_id, 'Proposal', 50, 30, false, false),
      (_company_id, _pipeline_id, 'Negotiation', 75, 40, false, false),
      (_company_id, _pipeline_id, 'Won', 100, 50, true, false),
      (_company_id, _pipeline_id, 'Lost', 0, 60, false, true);
  END IF;

  INSERT INTO public.crm_settings (company_id, enabled, default_pipeline_id)
  VALUES (_company_id, false, _pipeline_id)
  ON CONFLICT (company_id) DO UPDATE
    SET default_pipeline_id = COALESCE(public.crm_settings.default_pipeline_id, EXCLUDED.default_pipeline_id),
        updated_at = now();

  RETURN _pipeline_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Settings RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_crm_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_settings%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.view');
  PERFORM private.crm_seed_defaults(_company_id);
  SELECT * INTO _row FROM public.crm_settings WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'companyId', _row.company_id,
    'enabled', _row.enabled,
    'leadNumberPrefix', _row.lead_number_prefix,
    'opportunityNumberPrefix', _row.opportunity_number_prefix,
    'staleDealDays', _row.stale_deal_days,
    'defaultPipelineId', _row.default_pipeline_id,
    'version', _row.version,
    'updatedAt', _row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_crm_settings(
  _company_id UUID,
  _enabled BOOLEAN,
  _lead_number_prefix TEXT DEFAULT NULL,
  _opportunity_number_prefix TEXT DEFAULT NULL,
  _stale_deal_days INTEGER DEFAULT NULL,
  _expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_settings%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.admin');
  PERFORM private.crm_seed_defaults(_company_id);

  UPDATE public.crm_settings
  SET
    enabled = COALESCE(_enabled, enabled),
    lead_number_prefix = COALESCE(NULLIF(trim(_lead_number_prefix), ''), lead_number_prefix),
    opportunity_number_prefix = COALESCE(NULLIF(trim(_opportunity_number_prefix), ''), opportunity_number_prefix),
    stale_deal_days = COALESCE(_stale_deal_days, stale_deal_days),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE company_id = _company_id
    AND (_expected_version IS NULL OR version = _expected_version)
  RETURNING * INTO _row;

  IF _row.company_id IS NULL THEN
    RAISE EXCEPTION 'CRM settings were updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;

  RETURN public.get_crm_settings(_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_crm_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_crm_settings(UUID, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_crm_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_crm_settings(UUID, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lead RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_crm_lead(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _settings public.crm_settings%ROWTYPE;
  _number TEXT;
  _row public.crm_leads%ROWTYPE;
  _status TEXT;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.leads.manage');
  PERFORM private.crm_seed_defaults(_company_id);
  SELECT * INTO _settings FROM public.crm_settings WHERE company_id = _company_id;
  IF NOT _settings.enabled THEN
    RAISE EXCEPTION 'CRM is disabled for this organisation. Enable it in CRM Settings.';
  END IF;

  _status := COALESCE(NULLIF(_payload->>'status', ''), 'new');
  IF _status NOT IN ('new', 'contacted', 'qualified', 'nurturing', 'disqualified') THEN
    RAISE EXCEPTION 'Invalid lead status for create/update';
  END IF;

  IF _id IS NULL THEN
    _number := private.crm_allocate_number(_company_id, 'crm_lead', _settings.lead_number_prefix);
    INSERT INTO public.crm_leads (
      company_id, lead_number, status, person_type, first_name, last_name, organization_name,
      job_title, email, phone, website, industry, address_line1, address_line2, city, region,
      postal_code, country, source_id, owner_user_id, estimated_value_minor, currency_code,
      score, tags, notes, next_follow_up_at, disqualified_reason, created_by, updated_by
    ) VALUES (
      _company_id,
      _number,
      _status,
      COALESCE(NULLIF(_payload->>'personType', ''), 'individual'),
      NULLIF(trim(_payload->>'firstName'), ''),
      NULLIF(trim(_payload->>'lastName'), ''),
      NULLIF(trim(_payload->>'organizationName'), ''),
      NULLIF(trim(_payload->>'jobTitle'), ''),
      NULLIF(lower(trim(_payload->>'email')), ''),
      NULLIF(trim(_payload->>'phone'), ''),
      NULLIF(trim(_payload->>'website'), ''),
      NULLIF(trim(_payload->>'industry'), ''),
      NULLIF(trim(_payload->>'addressLine1'), ''),
      NULLIF(trim(_payload->>'addressLine2'), ''),
      NULLIF(trim(_payload->>'city'), ''),
      NULLIF(trim(_payload->>'region'), ''),
      NULLIF(trim(_payload->>'postalCode'), ''),
      NULLIF(trim(_payload->>'country'), ''),
      NULLIF(_payload->>'sourceId', '')::UUID,
      COALESCE(NULLIF(_payload->>'ownerUserId', '')::UUID, auth.uid()),
      COALESCE((_payload->>'estimatedValueMinor')::BIGINT, 0),
      COALESCE(NULLIF(_payload->>'currencyCode', ''), 'USD'),
      COALESCE((_payload->>'score')::INT, 0),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'tags', '[]'::jsonb))),
        '{}'::text[]
      ),
      NULLIF(trim(_payload->>'notes'), ''),
      NULLIF(_payload->>'nextFollowUpAt', '')::TIMESTAMPTZ,
      NULLIF(trim(_payload->>'disqualifiedReason'), ''),
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO _row;

    INSERT INTO public.crm_lead_events (company_id, lead_id, event_type, status_after, note, acted_by)
    VALUES (_company_id, _row.id, 'created', _row.status, 'Lead created', auth.uid());
  ELSE
    UPDATE public.crm_leads SET
      person_type = COALESCE(NULLIF(_payload->>'personType', ''), person_type),
      first_name = COALESCE(NULLIF(trim(_payload->>'firstName'), ''), first_name),
      last_name = CASE WHEN _payload ? 'lastName' THEN NULLIF(trim(_payload->>'lastName'), '') ELSE last_name END,
      organization_name = CASE WHEN _payload ? 'organizationName' THEN NULLIF(trim(_payload->>'organizationName'), '') ELSE organization_name END,
      job_title = CASE WHEN _payload ? 'jobTitle' THEN NULLIF(trim(_payload->>'jobTitle'), '') ELSE job_title END,
      email = CASE WHEN _payload ? 'email' THEN NULLIF(lower(trim(_payload->>'email')), '') ELSE email END,
      phone = CASE WHEN _payload ? 'phone' THEN NULLIF(trim(_payload->>'phone'), '') ELSE phone END,
      website = CASE WHEN _payload ? 'website' THEN NULLIF(trim(_payload->>'website'), '') ELSE website END,
      industry = CASE WHEN _payload ? 'industry' THEN NULLIF(trim(_payload->>'industry'), '') ELSE industry END,
      address_line1 = CASE WHEN _payload ? 'addressLine1' THEN NULLIF(trim(_payload->>'addressLine1'), '') ELSE address_line1 END,
      address_line2 = CASE WHEN _payload ? 'addressLine2' THEN NULLIF(trim(_payload->>'addressLine2'), '') ELSE address_line2 END,
      city = CASE WHEN _payload ? 'city' THEN NULLIF(trim(_payload->>'city'), '') ELSE city END,
      region = CASE WHEN _payload ? 'region' THEN NULLIF(trim(_payload->>'region'), '') ELSE region END,
      postal_code = CASE WHEN _payload ? 'postalCode' THEN NULLIF(trim(_payload->>'postalCode'), '') ELSE postal_code END,
      country = CASE WHEN _payload ? 'country' THEN NULLIF(trim(_payload->>'country'), '') ELSE country END,
      source_id = CASE WHEN _payload ? 'sourceId' THEN NULLIF(_payload->>'sourceId', '')::UUID ELSE source_id END,
      estimated_value_minor = COALESCE((_payload->>'estimatedValueMinor')::BIGINT, estimated_value_minor),
      currency_code = COALESCE(NULLIF(_payload->>'currencyCode', ''), currency_code),
      score = COALESCE((_payload->>'score')::INT, score),
      tags = CASE WHEN _payload ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'tags', '[]'::jsonb))) ELSE tags END,
      notes = CASE WHEN _payload ? 'notes' THEN NULLIF(trim(_payload->>'notes'), '') ELSE notes END,
      next_follow_up_at = CASE WHEN _payload ? 'nextFollowUpAt' THEN NULLIF(_payload->>'nextFollowUpAt', '')::TIMESTAMPTZ ELSE next_follow_up_at END,
      disqualified_reason = CASE WHEN _payload ? 'disqualifiedReason' THEN NULLIF(trim(_payload->>'disqualifiedReason'), '') ELSE disqualified_reason END,
      status = CASE
        WHEN status IN ('converted') THEN status
        WHEN _status IN ('new', 'contacted', 'qualified', 'nurturing', 'disqualified') THEN _status
        ELSE status
      END,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id AND archived_at IS NULL
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Lead not found or archived';
    END IF;

    INSERT INTO public.crm_lead_events (company_id, lead_id, event_type, status_after, note, acted_by)
    VALUES (_company_id, _row.id, 'updated', _row.status, 'Lead updated', auth.uid());
  END IF;

  RETURN jsonb_build_object('id', _row.id, 'leadNumber', _row.lead_number, 'status', _row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_crm_lead(
  _company_id UUID,
  _lead_id UUID,
  _owner_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_leads%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.leads.manage');

  IF _owner_user_id IS NOT NULL AND NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Assignee must be an organisation member' USING ERRCODE = '42501';
  END IF;

  IF _owner_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _owner_user_id
  ) THEN
    RAISE EXCEPTION 'Assignee must be an organisation member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.crm_leads
  SET owner_user_id = _owner_user_id,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = _lead_id AND company_id = _company_id AND archived_at IS NULL
    AND status NOT IN ('converted')
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or cannot be assigned';
  END IF;

  INSERT INTO public.crm_lead_events (
    company_id, lead_id, event_type, status_after, note, payload, acted_by
  ) VALUES (
    _company_id, _row.id, 'assigned', _row.status, 'Lead assigned',
    jsonb_build_object('ownerUserId', _owner_user_id), auth.uid()
  );

  RETURN jsonb_build_object('id', _row.id, 'ownerUserId', _row.owner_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_crm_lead(
  _company_id UUID,
  _lead_id UUID,
  _create_opportunity BOOLEAN DEFAULT true,
  _existing_contact_id UUID DEFAULT NULL
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
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.leads.manage');
  SELECT * INTO _lead FROM public.crm_leads WHERE id = _lead_id AND company_id = _company_id FOR UPDATE;
  IF _lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF _lead.status = 'converted' THEN
    RAISE EXCEPTION 'Lead is already converted';
  END IF;
  IF _lead.status = 'disqualified' THEN
    RAISE EXCEPTION 'Disqualified leads cannot be converted';
  END IF;
  IF _lead.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived leads cannot be converted';
  END IF;

  SELECT * INTO _settings FROM public.crm_settings WHERE company_id = _company_id;
  IF NOT _settings.enabled THEN
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
      _company_id,
      trim(_contact_name),
      'customer',
      _lead.email,
      _lead.phone,
      _lead.website,
      COALESCE(_lead.notes, 'Converted from CRM lead ' || _lead.lead_number),
      true,
      _lead.address_line1,
      _lead.address_line2,
      _lead.city,
      _lead.region,
      _lead.postal_code,
      _lead.country,
      _lead.currency_code
    )
    RETURNING id INTO _contact_id;
  END IF;

  IF _create_opportunity THEN
    _pipeline_id := _settings.default_pipeline_id;
    SELECT s.id INTO _stage_id
    FROM public.crm_pipeline_stages s
    WHERE s.pipeline_id = _pipeline_id AND s.company_id = _company_id
      AND s.is_active AND NOT s.is_won AND NOT s.is_lost
    ORDER BY s.sort_order
    LIMIT 1;

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
      _company_id,
      _opp_number,
      COALESCE(NULLIF(trim(_lead.organization_name), ''), trim(COALESCE(_lead.first_name, '') || ' ' || COALESCE(_lead.last_name, '')), _lead.lead_number),
      _pipeline_id,
      _stage_id,
      'open',
      _contact_id,
      _lead.id,
      COALESCE(_lead.owner_user_id, auth.uid()),
      _lead.estimated_value_minor,
      _lead.currency_code,
      s.probability_pct,
      _lead.source_id,
      'Created from lead ' || _lead.lead_number,
      auth.uid(),
      auth.uid()
    FROM public.crm_pipeline_stages s
    WHERE s.id = _stage_id
    RETURNING id INTO _opp_id;

    INSERT INTO public.crm_opportunity_stage_history (
      company_id, opportunity_id, from_stage_id, to_stage_id, status_after, note, acted_by
    ) VALUES (
      _company_id, _opp_id, NULL, _stage_id, 'open', 'Opportunity created from lead', auth.uid()
    );
  END IF;

  UPDATE public.crm_leads SET
    status = 'converted',
    contact_id = _contact_id,
    converted_opportunity_id = _opp_id,
    converted_at = now(),
    converted_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = _lead.id;

  INSERT INTO public.crm_lead_events (
    company_id, lead_id, event_type, status_after, note, payload, acted_by
  ) VALUES (
    _company_id, _lead.id, 'converted', 'converted', 'Lead converted',
    jsonb_build_object(
      'contactId', _contact_id,
      'opportunityId', _opp_id
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'leadId', _lead.id,
    'contactId', _contact_id,
    'opportunityId', _opp_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_lead(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_crm_lead(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_crm_lead(UUID, UUID, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_lead(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_crm_lead(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_crm_lead(UUID, UUID, BOOLEAN, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Opportunity RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_crm_opportunity(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _settings public.crm_settings%ROWTYPE;
  _pipeline_id UUID;
  _stage_id UUID;
  _stage public.crm_pipeline_stages%ROWTYPE;
  _number TEXT;
  _row public.crm_opportunities%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.opportunities.manage');
  PERFORM private.crm_seed_defaults(_company_id);
  SELECT * INTO _settings FROM public.crm_settings WHERE company_id = _company_id;
  IF NOT _settings.enabled THEN
    RAISE EXCEPTION 'CRM is disabled for this organisation. Enable it in CRM Settings.';
  END IF;

  _pipeline_id := COALESCE(
    NULLIF(_payload->>'pipelineId', '')::UUID,
    _settings.default_pipeline_id
  );
  _stage_id := NULLIF(_payload->>'stageId', '')::UUID;
  IF _stage_id IS NULL THEN
    SELECT id INTO _stage_id
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = _pipeline_id AND company_id = _company_id
      AND is_active AND NOT is_won AND NOT is_lost
    ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT * INTO _stage
  FROM public.crm_pipeline_stages
  WHERE id = _stage_id AND company_id = _company_id AND pipeline_id = _pipeline_id;
  IF _stage.id IS NULL THEN
    RAISE EXCEPTION 'Pipeline stage not found';
  END IF;

  IF NULLIF(_payload->>'contactId', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = (_payload->>'contactId')::UUID AND c.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Contact not found in this organisation';
  END IF;

  IF _id IS NULL THEN
    _number := private.crm_allocate_number(
      _company_id, 'crm_opportunity', _settings.opportunity_number_prefix
    );
    INSERT INTO public.crm_opportunities (
      company_id, opportunity_number, name, pipeline_id, stage_id, status,
      contact_id, lead_id, owner_user_id, amount_minor, currency_code, probability_pct,
      expected_close_date, priority, source_id, notes, created_by, updated_by
    ) VALUES (
      _company_id,
      _number,
      trim(_payload->>'name'),
      _pipeline_id,
      _stage_id,
      CASE WHEN _stage.is_won THEN 'won' WHEN _stage.is_lost THEN 'lost' ELSE 'open' END,
      NULLIF(_payload->>'contactId', '')::UUID,
      NULLIF(_payload->>'leadId', '')::UUID,
      COALESCE(NULLIF(_payload->>'ownerUserId', '')::UUID, auth.uid()),
      COALESCE((_payload->>'amountMinor')::BIGINT, 0),
      COALESCE(NULLIF(_payload->>'currencyCode', ''), 'USD'),
      COALESCE((_payload->>'probabilityPct')::INT, _stage.probability_pct),
      NULLIF(_payload->>'expectedCloseDate', '')::DATE,
      COALESCE(NULLIF(_payload->>'priority', ''), 'normal'),
      NULLIF(_payload->>'sourceId', '')::UUID,
      NULLIF(trim(_payload->>'notes'), ''),
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO _row;

    INSERT INTO public.crm_opportunity_stage_history (
      company_id, opportunity_id, from_stage_id, to_stage_id, status_after, note, acted_by
    ) VALUES (
      _company_id, _row.id, NULL, _stage_id, _row.status, 'Opportunity created', auth.uid()
    );
  ELSE
    UPDATE public.crm_opportunities SET
      name = COALESCE(NULLIF(trim(_payload->>'name'), ''), name),
      contact_id = CASE WHEN _payload ? 'contactId' THEN NULLIF(_payload->>'contactId', '')::UUID ELSE contact_id END,
      amount_minor = COALESCE((_payload->>'amountMinor')::BIGINT, amount_minor),
      currency_code = COALESCE(NULLIF(_payload->>'currencyCode', ''), currency_code),
      probability_pct = COALESCE((_payload->>'probabilityPct')::INT, probability_pct),
      expected_close_date = CASE WHEN _payload ? 'expectedCloseDate' THEN NULLIF(_payload->>'expectedCloseDate', '')::DATE ELSE expected_close_date END,
      priority = COALESCE(NULLIF(_payload->>'priority', ''), priority),
      source_id = CASE WHEN _payload ? 'sourceId' THEN NULLIF(_payload->>'sourceId', '')::UUID ELSE source_id END,
      notes = CASE WHEN _payload ? 'notes' THEN NULLIF(trim(_payload->>'notes'), '') ELSE notes END,
      owner_user_id = CASE WHEN _payload ? 'ownerUserId' THEN NULLIF(_payload->>'ownerUserId', '')::UUID ELSE owner_user_id END,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = _id AND company_id = _company_id AND archived_at IS NULL
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Opportunity not found or archived';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'opportunityNumber', _row.opportunity_number,
    'status', _row.status,
    'stageId', _row.stage_id
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

  SELECT * INTO _row
  FROM public.crm_opportunities
  WHERE id = _opportunity_id AND company_id = _company_id
  FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Opportunity not found';
  END IF;

  SELECT * INTO _stage
  FROM public.crm_pipeline_stages
  WHERE id = _stage_id AND company_id = _company_id AND pipeline_id = _row.pipeline_id;
  IF _stage.id IS NULL THEN
    RAISE EXCEPTION 'Stage not in this pipeline';
  END IF;

  _from := _row.stage_id;
  _status := CASE WHEN _stage.is_won THEN 'won' WHEN _stage.is_lost THEN 'lost' ELSE 'open' END;

  UPDATE public.crm_opportunities SET
    stage_id = _stage_id,
    status = _status,
    probability_pct = _stage.probability_pct,
    stage_entered_at = now(),
    actual_close_date = CASE
      WHEN _status IN ('won', 'lost') THEN COALESCE(actual_close_date, CURRENT_DATE)
      ELSE NULL
    END,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  INSERT INTO public.crm_opportunity_stage_history (
    company_id, opportunity_id, from_stage_id, to_stage_id, status_after, note, acted_by
  ) VALUES (
    _company_id, _row.id, _from, _stage_id, _status, NULLIF(trim(_note), ''), auth.uid()
  );

  RETURN jsonb_build_object(
    'id', _row.id,
    'stageId', _row.stage_id,
    'status', _row.status,
    'probabilityPct', _row.probability_pct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_opportunity(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_crm_opportunity_stage(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_opportunity(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_crm_opportunity_stage(UUID, UUID, UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Activity RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_crm_activity(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _row public.crm_activities%ROWTYPE;
  _settings public.crm_settings%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.activities.manage');
  SELECT * INTO _settings FROM public.crm_settings WHERE company_id = _company_id;
  IF NOT COALESCE(_settings.enabled, false) THEN
    RAISE EXCEPTION 'CRM is disabled for this organisation';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.crm_activities (
      company_id, kind, subject, body, status, priority, owner_user_id,
      due_at, remind_at, timezone, lead_id, opportunity_id, contact_id, created_by
    ) VALUES (
      _company_id,
      COALESCE(NULLIF(_payload->>'kind', ''), 'task'),
      trim(_payload->>'subject'),
      NULLIF(trim(_payload->>'body'), ''),
      COALESCE(NULLIF(_payload->>'status', ''), 'open'),
      COALESCE(NULLIF(_payload->>'priority', ''), 'normal'),
      COALESCE(NULLIF(_payload->>'ownerUserId', '')::UUID, auth.uid()),
      NULLIF(_payload->>'dueAt', '')::TIMESTAMPTZ,
      NULLIF(_payload->>'remindAt', '')::TIMESTAMPTZ,
      NULLIF(_payload->>'timezone', ''),
      NULLIF(_payload->>'leadId', '')::UUID,
      NULLIF(_payload->>'opportunityId', '')::UUID,
      NULLIF(_payload->>'contactId', '')::UUID,
      auth.uid()
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.crm_activities SET
      subject = COALESCE(NULLIF(trim(_payload->>'subject'), ''), subject),
      body = CASE WHEN _payload ? 'body' THEN NULLIF(trim(_payload->>'body'), '') ELSE body END,
      priority = COALESCE(NULLIF(_payload->>'priority', ''), priority),
      owner_user_id = CASE WHEN _payload ? 'ownerUserId' THEN NULLIF(_payload->>'ownerUserId', '')::UUID ELSE owner_user_id END,
      due_at = CASE WHEN _payload ? 'dueAt' THEN NULLIF(_payload->>'dueAt', '')::TIMESTAMPTZ ELSE due_at END,
      remind_at = CASE WHEN _payload ? 'remindAt' THEN NULLIF(_payload->>'remindAt', '')::TIMESTAMPTZ ELSE remind_at END,
      updated_at = now()
    WHERE id = _id AND company_id = _company_id
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Activity not found';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_crm_activity(
  _company_id UUID,
  _activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_activities%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.activities.manage');
  UPDATE public.crm_activities
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = _activity_id AND company_id = _company_id AND status = 'open'
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Open activity not found';
  END IF;
  RETURN jsonb_build_object('id', _row.id, 'status', _row.status, 'completedAt', _row.completed_at);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_activity(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_crm_activity(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_activity(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_crm_activity(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard KPIs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_crm_dashboard_kpis(
  _company_id UUID,
  _from TIMESTAMPTZ DEFAULT NULL,
  _to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _from_ts TIMESTAMPTZ := COALESCE(_from, date_trunc('month', now()));
  _to_ts TIMESTAMPTZ := COALESCE(_to, now());
  _stale_days INT := 30;
  _result JSONB;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.view');
  SELECT COALESCE(stale_deal_days, 30) INTO _stale_days
  FROM public.crm_settings WHERE company_id = _company_id;

  SELECT jsonb_build_object(
    'totalLeads', (
      SELECT count(*) FROM public.crm_leads l
      WHERE l.company_id = _company_id AND l.archived_at IS NULL
        AND l.status NOT IN ('converted', 'disqualified')
    ),
    'newLeads', (
      SELECT count(*) FROM public.crm_leads l
      WHERE l.company_id = _company_id AND l.created_at >= _from_ts AND l.created_at <= _to_ts
    ),
    'qualifiedLeads', (
      SELECT count(*) FROM public.crm_leads l
      WHERE l.company_id = _company_id AND l.status = 'qualified' AND l.archived_at IS NULL
    ),
    'unassignedLeads', (
      SELECT count(*) FROM public.crm_leads l
      WHERE l.company_id = _company_id AND l.owner_user_id IS NULL
        AND l.archived_at IS NULL AND l.status NOT IN ('converted', 'disqualified')
    ),
    'activeOpportunities', (
      SELECT count(*) FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'open' AND o.archived_at IS NULL
    ),
    'pipelineValueMinor', (
      SELECT COALESCE(sum(o.amount_minor), 0) FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'open' AND o.archived_at IS NULL
    ),
    'weightedPipelineValueMinor', (
      SELECT COALESCE(sum((o.amount_minor * o.probability_pct) / 100), 0)
      FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'open' AND o.archived_at IS NULL
    ),
    'dealsWon', (
      SELECT count(*) FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'won'
        AND COALESCE(o.actual_close_date, o.updated_at::date) BETWEEN _from_ts::date AND _to_ts::date
    ),
    'dealsLost', (
      SELECT count(*) FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'lost'
        AND COALESCE(o.actual_close_date, o.updated_at::date) BETWEEN _from_ts::date AND _to_ts::date
    ),
    'winRatePct', (
      SELECT CASE
        WHEN count(*) FILTER (WHERE o.status IN ('won', 'lost')) = 0 THEN NULL
        ELSE round(
          100.0 * count(*) FILTER (WHERE o.status = 'won')
          / NULLIF(count(*) FILTER (WHERE o.status IN ('won', 'lost')), 0),
          1
        )
      END
      FROM public.crm_opportunities o
      WHERE o.company_id = _company_id
        AND COALESCE(o.actual_close_date, o.updated_at::date) BETWEEN _from_ts::date AND _to_ts::date
    ),
    'overdueFollowUps', (
      SELECT count(*) FROM public.crm_activities a
      WHERE a.company_id = _company_id AND a.status = 'open'
        AND a.due_at IS NOT NULL AND a.due_at < now()
    ),
    'upcomingMeetings', (
      SELECT count(*) FROM public.crm_activities a
      WHERE a.company_id = _company_id AND a.status = 'open' AND a.kind = 'meeting'
        AND a.due_at BETWEEN now() AND now() + interval '7 days'
    ),
    'forecastRevenueMinor', (
      SELECT COALESCE(sum((o.amount_minor * o.probability_pct) / 100), 0)
      FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'open' AND o.archived_at IS NULL
        AND o.expected_close_date BETWEEN _from_ts::date AND _to_ts::date
    ),
    'stagnantDeals', (
      SELECT count(*) FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'open' AND o.archived_at IS NULL
        AND o.stage_entered_at < now() - make_interval(days => COALESCE(_stale_days, 30))
    ),
    'expectedDealValueMinor', (
      SELECT COALESCE(sum((o.amount_minor * o.probability_pct) / 100), 0)
      FROM public.crm_opportunities o
      WHERE o.company_id = _company_id AND o.status = 'open' AND o.archived_at IS NULL
    ),
    'rangeFrom', _from_ts,
    'rangeTo', _to_ts,
    'note', 'Pipeline and forecast figures are CRM expectations, not posted accounting revenue.'
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_crm_dashboard_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_crm_dashboard_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
