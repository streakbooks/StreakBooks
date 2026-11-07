-- AS-03 foundation: durable sync jobs, webhooks, external record links, idempotency.
-- Additive. No provider is marked connected by this migration.
-- Accounting posting remains in existing LinkBooks services.

CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
  trigger text NOT NULL CHECK (
    trigger IN ('manual', 'scheduled', 'webhook', 'install', 'retry')
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'succeeded', 'partial', 'failed', 'cancelled', 'dead_letter')
  ),
  cursor_checkpoint text,
  correlation_id text NOT NULL,
  discovered integer NOT NULL DEFAULT 0 CHECK (discovered >= 0),
  imported integer NOT NULL DEFAULT 0 CHECK (imported >= 0),
  skipped integer NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_sync_jobs_company_status_idx
  ON public.integration_sync_jobs (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_sync_jobs_correlation_idx
  ON public.integration_sync_jobs (correlation_id);

CREATE TABLE IF NOT EXISTS public.integration_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.integration_sync_jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  external_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('discovered', 'imported', 'skipped', 'failed')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS integration_sync_events_job_idx
  ON public.integration_sync_events (job_id, created_at);

CREATE TABLE IF NOT EXISTS public.external_record_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN (
    'account', 'customer', 'supplier', 'product', 'tax_rate', 'currency',
    'invoice', 'bill', 'journal', 'payment', 'inventory'
  )),
  external_id text NOT NULL,
  internal_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, connection_id, domain, external_id),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.integration_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  target_url text NOT NULL,
  event_types text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.integration_webhook_subscriptions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  app_code text NOT NULL,
  provider_event_id text NOT NULL,
  payload_hash text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'verified', 'processed', 'rejected', 'retry')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (app_code, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.integration_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN (
    'account', 'customer', 'supplier', 'product', 'tax_rate', 'currency',
    'invoice', 'bill', 'journal', 'payment', 'inventory'
  )),
  external_key text NOT NULL,
  internal_ref text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, connection_id, domain, external_key)
);

ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_sync_jobs_member_read ON public.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_member_read
  ON public.integration_sync_jobs FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.view_sync')
      OR public.has_company_permission(company_id, 'appstore.view')
    )
  );

DROP POLICY IF EXISTS integration_sync_events_member_read ON public.integration_sync_events;
CREATE POLICY integration_sync_events_member_read
  ON public.integration_sync_events FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.view_sync')
      OR public.has_company_permission(company_id, 'appstore.view')
    )
  );

DROP POLICY IF EXISTS external_record_links_member_read ON public.external_record_links;
CREATE POLICY external_record_links_member_read
  ON public.external_record_links FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.manage_mappings')
      OR public.has_company_permission(company_id, 'appstore.view')
    )
  );

DROP POLICY IF EXISTS integration_mappings_member_read ON public.integration_mappings;
CREATE POLICY integration_mappings_member_read
  ON public.integration_mappings FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      public.has_company_permission(company_id, 'appstore.manage_mappings')
      OR public.has_company_permission(company_id, 'appstore.view')
    )
  );

DROP POLICY IF EXISTS integration_webhook_subscriptions_member_read
  ON public.integration_webhook_subscriptions;
CREATE POLICY integration_webhook_subscriptions_member_read
  ON public.integration_webhook_subscriptions FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'appstore.manage_connections')
  );

REVOKE INSERT, UPDATE, DELETE ON public.integration_sync_jobs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_sync_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.external_record_links FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_webhook_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_webhook_deliveries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_mappings FROM anon, authenticated;

GRANT SELECT ON public.integration_sync_jobs TO authenticated;
GRANT SELECT ON public.integration_sync_events TO authenticated;
GRANT SELECT ON public.external_record_links TO authenticated;
GRANT SELECT ON public.integration_mappings TO authenticated;
GRANT SELECT ON public.integration_webhook_subscriptions TO authenticated;

CREATE OR REPLACE FUNCTION public.list_company_sync_jobs(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'appstore.view_sync')
    OR public.has_company_permission(_company_id, 'appstore.view')
  ) THEN
    RAISE EXCEPTION 'missing sync view permission' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(j)::jsonb ORDER BY j."createdAt" DESC)
    FROM (
      SELECT
        id,
        company_id AS "companyId",
        connection_id AS "connectionId",
        app_code AS "appCode",
        direction,
        trigger,
        status,
        cursor_checkpoint AS "cursorCheckpoint",
        correlation_id AS "correlationId",
        discovered,
        imported,
        skipped,
        failed,
        retry_count AS "retryCount",
        last_error AS "lastError",
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        created_at AS "createdAt"
      FROM public.integration_sync_jobs
      WHERE company_id = _company_id
      LIMIT 200
    ) j
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_sync_jobs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_sync_jobs(uuid) TO authenticated;
