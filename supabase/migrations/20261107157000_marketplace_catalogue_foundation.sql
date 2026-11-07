-- AS-01: LinkBooks App Store catalogue, installations, and developer platform foundation.
-- Additive. Open integration platform: published catalogue + org install ledger +
-- publisher/OAuth client registry for the public API. No fake E2E sync.
-- Native connectors (Shopify, Amazon, Stripe) are seeded as not e2e_verified.
-- Partner listings (Hubdoc, Link My Books) require API cooperation and approvals.
-- Marketplace billing stays separate from LinkBooks SaaS billing.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner', 'appstore.view'),
  ('admin', 'appstore.view'),
  ('accountant', 'appstore.view'),
  ('bookkeeper', 'appstore.view'),
  ('staff', 'appstore.view'),
  ('read_only', 'appstore.view'),
  ('owner', 'appstore.request_install'),
  ('admin', 'appstore.request_install'),
  ('accountant', 'appstore.request_install'),
  ('bookkeeper', 'appstore.request_install'),
  ('staff', 'appstore.request_install'),
  ('owner', 'appstore.install'),
  ('admin', 'appstore.install'),
  ('owner', 'appstore.manage_connections'),
  ('admin', 'appstore.manage_connections'),
  ('accountant', 'appstore.manage_connections'),
  ('owner', 'appstore.manage_mappings'),
  ('admin', 'appstore.manage_mappings'),
  ('accountant', 'appstore.manage_mappings'),
  ('owner', 'appstore.view_sync'),
  ('admin', 'appstore.view_sync'),
  ('accountant', 'appstore.view_sync'),
  ('bookkeeper', 'appstore.view_sync'),
  ('owner', 'appstore.resolve_exceptions'),
  ('admin', 'appstore.resolve_exceptions'),
  ('accountant', 'appstore.resolve_exceptions'),
  ('owner', 'developer.manage_apps'),
  ('admin', 'developer.manage_apps'),
  ('owner', 'developer.submit_apps'),
  ('admin', 'developer.submit_apps')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_categories (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_categories_published_sort_idx
  ON public.app_categories (is_published, sort_order);

-- ---------------------------------------------------------------------------
-- Marketplace apps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_apps (
  code text PRIMARY KEY,
  name text NOT NULL,
  headline text NOT NULL,
  description text NOT NULL,
  publisher_name text NOT NULL,
  publisher_website text,
  kind text NOT NULL CHECK (kind IN ('native', 'partner_api', 'hybrid')),
  native_priority integer,
  implementation_status text NOT NULL CHECK (
    implementation_status IN (
      'catalogue_only',
      'adapter_scaffolded',
      'credentials_blocked',
      'sandbox_partial',
      'e2e_verified'
    )
  ),
  blocker_notes text,
  pricing_model text NOT NULL CHECK (
    pricing_model IN ('free', 'freemium', 'subscription', 'usage', 'external_billed')
  ),
  countries text[] NOT NULL DEFAULT '{}',
  modules text[] NOT NULL DEFAULT '{}',
  sync_capabilities text[] NOT NULL DEFAULT '{}',
  auth_methods text[] NOT NULL DEFAULT '{}',
  requested_api_scopes text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  recommended boolean NOT NULL DEFAULT false,
  recently_added boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  documentation_url text,
  privacy_policy_url text,
  support_url text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_apps_e2e_requires_notes CHECK (
    implementation_status <> 'e2e_verified' OR blocker_notes IS NULL
  )
);

CREATE INDEX IF NOT EXISTS marketplace_apps_published_sort_idx
  ON public.marketplace_apps (is_published, sort_order);
CREATE INDEX IF NOT EXISTS marketplace_apps_kind_status_idx
  ON public.marketplace_apps (kind, implementation_status);

CREATE TABLE IF NOT EXISTS public.marketplace_app_categories (
  app_code text NOT NULL REFERENCES public.marketplace_apps(code) ON DELETE CASCADE,
  category_code text NOT NULL REFERENCES public.app_categories(code) ON DELETE CASCADE,
  PRIMARY KEY (app_code, category_code)
);

-- ---------------------------------------------------------------------------
-- Org installations (non-secret config only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  app_code text NOT NULL REFERENCES public.marketplace_apps(code),
  status text NOT NULL CHECK (
    status IN ('requested', 'installing', 'installed', 'disabled', 'error')
  ),
  installed_by uuid REFERENCES auth.users(id),
  installed_at timestamptz,
  disabled_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, app_code)
);

CREATE INDEX IF NOT EXISTS app_installations_company_status_idx
  ON public.app_installations (company_id, status);
CREATE INDEX IF NOT EXISTS app_installations_app_code_idx
  ON public.app_installations (app_code);

-- ---------------------------------------------------------------------------
-- Developer platform foundation (public API publishers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  country char(2),
  support_email text,
  website text,
  verification_status text NOT NULL DEFAULT 'draft' CHECK (
    verification_status IN ('draft', 'submitted', 'verified', 'rejected', 'suspended')
  ),
  owner_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.developer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.developer_publishers(id) ON DELETE CASCADE,
  app_slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  listing_app_code text REFERENCES public.marketplace_apps(code),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'submitted',
      'under_review',
      'changes_requested',
      'approved',
      'published',
      'suspended',
      'delisted'
    )
  ),
  redirect_uris text[] NOT NULL DEFAULT '{}',
  requested_scopes text[] NOT NULL DEFAULT '{}',
  privacy_policy_url text,
  terms_url text,
  support_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publisher_id, app_slug)
);

CREATE TABLE IF NOT EXISTS public.developer_oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.developer_applications(id) ON DELETE CASCADE,
  client_id text NOT NULL UNIQUE,
  -- Hash only; never store recoverable secrets in this table.
  client_secret_hash text NOT NULL,
  client_secret_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (application_id)
);

CREATE TABLE IF NOT EXISTS public.public_api_scopes (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  module text NOT NULL,
  access text NOT NULL CHECK (access IN ('read', 'write')),
  is_published boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.app_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_app_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_categories_public_read ON public.app_categories;
CREATE POLICY app_categories_public_read
  ON public.app_categories FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS marketplace_apps_public_read ON public.marketplace_apps;
CREATE POLICY marketplace_apps_public_read
  ON public.marketplace_apps FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS marketplace_app_categories_public_read ON public.marketplace_app_categories;
CREATE POLICY marketplace_app_categories_public_read
  ON public.marketplace_app_categories FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_apps a
      WHERE a.code = app_code AND a.is_published = true
    )
  );

DROP POLICY IF EXISTS app_installations_member_read ON public.app_installations;
CREATE POLICY app_installations_member_read
  ON public.app_installations FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'appstore.view')
  );

DROP POLICY IF EXISTS public_api_scopes_public_read ON public.public_api_scopes;
CREATE POLICY public_api_scopes_public_read
  ON public.public_api_scopes FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Developer tables: no direct client writes; reads for owners later via RPC.
REVOKE ALL ON public.developer_publishers FROM anon, authenticated;
REVOKE ALL ON public.developer_applications FROM anon, authenticated;
REVOKE ALL ON public.developer_oauth_clients FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.app_categories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_apps FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_app_categories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.app_installations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.public_api_scopes FROM anon, authenticated;

GRANT SELECT ON public.app_categories TO anon, authenticated;
GRANT SELECT ON public.marketplace_apps TO anon, authenticated;
GRANT SELECT ON public.marketplace_app_categories TO anon, authenticated;
GRANT SELECT ON public.app_installations TO authenticated;
GRANT SELECT ON public.public_api_scopes TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed categories
-- ---------------------------------------------------------------------------
INSERT INTO public.app_categories (code, name, description, sort_order, is_published) VALUES
  ('ecommerce', 'E-commerce', 'Online stores, marketplaces and order sync.', 10, true),
  ('payment_gateways', 'Payment Gateways', 'Card processors, wallets and payout reconciliation.', 20, true),
  ('point_of_sale', 'Point of Sale', 'In-store sales and register settlement.', 30, true),
  ('banking_financial', 'Banking & Financial Data', 'Bank feeds, open banking and financial data.', 40, true),
  ('inventory_warehousing', 'Inventory & Warehousing', 'Stock levels, fulfilment and COGS.', 50, true),
  ('payroll_hr', 'Payroll & HR', 'Pay runs, employees and workforce costs.', 60, true),
  ('expense_management', 'Expense Management', 'Employee spend, cards and reimbursements.', 70, true),
  ('document_capture', 'Document Capture & OCR', 'Receipt and bill capture into purchases.', 80, true),
  ('crm', 'CRM & Customer Management', 'Contacts, pipelines and customer data.', 90, true),
  ('project_management', 'Project Management', 'Projects, jobs and billable work.', 100, true),
  ('time_tracking', 'Time Tracking', 'Timesheets and labour costing.', 110, true),
  ('tax_compliance', 'Tax & Compliance', 'Tax filing, reporting and statutory packs.', 120, true),
  ('reporting_analytics', 'Reporting & Analytics', 'BI, dashboards and data export.', 130, true),
  ('automation_workflows', 'Automation & Workflows', 'Triggers, rules and orchestration.', 140, true),
  ('property_management', 'Property Management', 'Rentals, trusts and property accounting.', 150, true),
  ('hospitality', 'Hospitality & Restaurants', 'Hotels, short-lets and food service.', 160, true),
  ('shipping_logistics', 'Shipping & Logistics', 'Carriers, fulfilment and freight costs.', 170, true),
  ('subscriptions_billing', 'Subscriptions & Recurring Billing', 'Recurring revenue and subscription ops.', 180, true),
  ('ap_automation', 'Accounts Payable Automation', 'Bill capture, approval and payment runs.', 190, true),
  ('ar_collections', 'Accounts Receivable & Collections', 'Invoicing reminders and collections.', 200, true),
  ('budgeting_forecasting', 'Budgeting & Forecasting', 'Plans, forecasts and variance analysis.', 210, true),
  ('professional_services', 'Professional Services', 'Firms, retainers and client work.', 220, true),
  ('manufacturing', 'Manufacturing', 'BOM, WIP and manufacturing costs.', 230, true),
  ('other', 'Other Business Applications', 'Integrations that do not fit another category.', 999, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_published = EXCLUDED.is_published,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Seed apps (none e2e_verified)
-- ---------------------------------------------------------------------------
INSERT INTO public.marketplace_apps (
  code, name, headline, description, publisher_name, publisher_website, kind,
  native_priority, implementation_status, blocker_notes, pricing_model,
  countries, modules, sync_capabilities, auth_methods, requested_api_scopes,
  featured, recommended, recently_added, sort_order, is_published
) VALUES
(
  'shopify', 'Shopify',
  'Sync Shopify orders, refunds and payouts into LinkBooks.',
  'Native e-commerce connector for Shopify stores. Not complete until E2E synchronization is verified.',
  'LinkBooks', 'https://linkbooks.app', 'native', 1, 'adapter_scaffolded',
  'Native adapter scaffolded. Shopify Admin API OAuth credentials and E2E sync verification required.',
  'free',
  ARRAY['US','UK','AU','NZ','CA','IN'],
  ARRAY['sales','products','contacts','banking','accounting','tax'],
  ARRAY['one_way_import','webhook','scheduled','historical_import','incremental'],
  ARRAY['oauth2'], ARRAY[]::text[],
  true, true, true, 10, true
),
(
  'amazon_seller', 'Amazon Seller Central',
  'Import Amazon marketplace sales and settlements.',
  'Native Amazon Selling Partner API connector. Not complete until E2E synchronization is verified.',
  'LinkBooks', 'https://linkbooks.app', 'native', 2, 'credentials_blocked',
  'Requires Amazon SP-API developer registration, app approval and regional credentials. No E2E sync verified.',
  'free',
  ARRAY['US','UK','AU','CA','IN'],
  ARRAY['sales','products','banking','accounting','tax','inventory'],
  ARRAY['one_way_import','scheduled','historical_import','incremental'],
  ARRAY['oauth2'], ARRAY[]::text[],
  true, true, true, 20, true
),
(
  'stripe_payments', 'Stripe',
  'Reconcile Stripe charges, fees, refunds and payouts.',
  'Native merchant Stripe connector, separate from LinkBooks SaaS billing. Not E2E verified.',
  'LinkBooks', 'https://linkbooks.app', 'native', 3, 'adapter_scaffolded',
  'Merchant Stripe Connect OAuth and settlement posting must pass E2E verification. Do not reuse platform billing keys.',
  'free',
  ARRAY['US','UK','AU','NZ','CA','IN'],
  ARRAY['sales','banking','accounting','contacts'],
  ARRAY['one_way_import','webhook','scheduled','incremental'],
  ARRAY['oauth2'], ARRAY[]::text[],
  true, true, true, 30, true
),
(
  'woocommerce', 'WooCommerce',
  'Connect WooCommerce stores to LinkBooks sales and inventory.',
  'Native WooCommerce REST connector. Catalogue entry; E2E sync not verified.',
  'LinkBooks', 'https://linkbooks.app', 'native', 4, 'catalogue_only',
  'Catalogue entry only. Adapter and E2E sync are not implemented.',
  'free',
  ARRAY['US','UK','AU','NZ','CA','IN'],
  ARRAY['sales','products','contacts','accounting','tax'],
  ARRAY['one_way_import','webhook','scheduled'],
  ARRAY['api_key'], ARRAY[]::text[],
  false, true, false, 40, true
),
(
  'paypal', 'PayPal',
  'Import PayPal transactions and payouts.',
  'Native PayPal connector. Catalogue entry; E2E sync not verified.',
  'LinkBooks', 'https://linkbooks.app', 'native', 5, 'catalogue_only',
  'Catalogue entry only. No live PayPal sync verified.',
  'free',
  ARRAY['US','UK','AU','NZ','CA','IN'],
  ARRAY['sales','banking','accounting'],
  ARRAY['one_way_import','webhook','scheduled'],
  ARRAY['oauth2'], ARRAY[]::text[],
  false, false, false, 50, true
),
(
  'square', 'Square',
  'Sync Square POS and online payments.',
  'Native Square connector. Catalogue entry; E2E sync not verified.',
  'LinkBooks', 'https://linkbooks.app', 'native', 6, 'catalogue_only',
  'Catalogue entry only. No Square E2E sync verified.',
  'free',
  ARRAY['US','UK','AU','CA'],
  ARRAY['sales','products','banking','accounting'],
  ARRAY['one_way_import','webhook','scheduled'],
  ARRAY['oauth2'], ARRAY[]::text[],
  false, false, false, 60, true
),
(
  'hubdoc', 'Hubdoc',
  'Partner document capture into LinkBooks purchases and files.',
  'Third-party document capture. Subject to Hubdoc API availability, cooperation and technical approvals.',
  'Hubdoc (third party)', NULL, 'partner_api', NULL, 'credentials_blocked',
  'Requires Hubdoc partnership and a published partner application. E2E sync not verified.',
  'external_billed',
  ARRAY['US','UK','AU','NZ','CA'],
  ARRAY['purchases','expenses','files','accounting'],
  ARRAY['one_way_import','webhook'],
  ARRAY['partner_oauth'],
  ARRAY['purchases.read','purchases.write','files.write','contacts.read'],
  true, true, true, 70, true
),
(
  'link_my_books', 'Link My Books',
  'Partner e-commerce bookkeeping automation via the LinkBooks API.',
  'Third-party specialist. Subject to API availability, cooperation and technical approvals.',
  'Link My Books (third party)', NULL, 'partner_api', NULL, 'credentials_blocked',
  'Subject to Link My Books cooperation and approvals. No E2E synchronization verified.',
  'external_billed',
  ARRAY['US','UK','AU','NZ','CA'],
  ARRAY['sales','banking','accounting','products','tax'],
  ARRAY['bidirectional','webhook','scheduled'],
  ARRAY['partner_oauth'],
  ARRAY['sales.read','sales.write','banking.read','accounting.read','products.read','products.write'],
  true, true, true, 80, true
),
(
  'dext', 'Dext',
  'Partner receipt and bill capture (API cooperation required).',
  'Document capture partner listing. Integration requires Dext API access and approvals.',
  'Dext (third party)', NULL, 'partner_api', NULL, 'catalogue_only',
  'Partner listing only. No Dext connector or E2E sync verified.',
  'external_billed',
  ARRAY['US','UK','AU','NZ','CA'],
  ARRAY['purchases','expenses','files'],
  ARRAY['one_way_import','webhook'],
  ARRAY['partner_oauth'],
  ARRAY['purchases.write','files.write'],
  false, false, false, 90, true
),
(
  'hubspot', 'HubSpot',
  'CRM contacts and deals — partner or native adapter roadmap.',
  'CRM integration target. Not E2E verified.',
  'LinkBooks', 'https://linkbooks.app', 'hybrid', 20, 'catalogue_only',
  'Catalogue entry only. No HubSpot E2E sync verified.',
  'free',
  ARRAY['US','UK','AU','NZ','CA','IN'],
  ARRAY['contacts','sales'],
  ARRAY['bidirectional','webhook','scheduled'],
  ARRAY['oauth2'], ARRAY[]::text[],
  false, false, false, 100, true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  headline = EXCLUDED.headline,
  description = EXCLUDED.description,
  publisher_name = EXCLUDED.publisher_name,
  publisher_website = EXCLUDED.publisher_website,
  kind = EXCLUDED.kind,
  native_priority = EXCLUDED.native_priority,
  implementation_status = EXCLUDED.implementation_status,
  blocker_notes = EXCLUDED.blocker_notes,
  pricing_model = EXCLUDED.pricing_model,
  countries = EXCLUDED.countries,
  modules = EXCLUDED.modules,
  sync_capabilities = EXCLUDED.sync_capabilities,
  auth_methods = EXCLUDED.auth_methods,
  requested_api_scopes = EXCLUDED.requested_api_scopes,
  featured = EXCLUDED.featured,
  recommended = EXCLUDED.recommended,
  recently_added = EXCLUDED.recently_added,
  sort_order = EXCLUDED.sort_order,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO public.marketplace_app_categories (app_code, category_code) VALUES
  ('shopify', 'ecommerce'),
  ('shopify', 'payment_gateways'),
  ('shopify', 'inventory_warehousing'),
  ('amazon_seller', 'ecommerce'),
  ('amazon_seller', 'shipping_logistics'),
  ('stripe_payments', 'payment_gateways'),
  ('stripe_payments', 'subscriptions_billing'),
  ('woocommerce', 'ecommerce'),
  ('paypal', 'payment_gateways'),
  ('square', 'point_of_sale'),
  ('square', 'payment_gateways'),
  ('hubdoc', 'document_capture'),
  ('hubdoc', 'ap_automation'),
  ('hubdoc', 'expense_management'),
  ('link_my_books', 'ecommerce'),
  ('link_my_books', 'automation_workflows'),
  ('link_my_books', 'reporting_analytics'),
  ('dext', 'document_capture'),
  ('dext', 'expense_management'),
  ('dext', 'ap_automation'),
  ('hubspot', 'crm')
ON CONFLICT DO NOTHING;

INSERT INTO public.public_api_scopes (key, label, description, module, access, is_published) VALUES
  ('organisation.read', 'Read organisation profile', 'Read basic organisation identity and locale settings.', 'settings', 'read', true),
  ('contacts.read', 'Read contacts', 'List and fetch customers and suppliers.', 'contacts', 'read', true),
  ('contacts.write', 'Write contacts', 'Create or update contacts with organisation authorization.', 'contacts', 'write', true),
  ('products.read', 'Read products', 'List products and services.', 'products', 'read', true),
  ('products.write', 'Write products', 'Create or update products and services.', 'products', 'write', true),
  ('sales.read', 'Read sales', 'Read invoices, credit notes and sales documents.', 'sales', 'read', true),
  ('sales.write', 'Write sales', 'Create draft sales documents through approved posting paths.', 'sales', 'write', true),
  ('purchases.read', 'Read purchases', 'Read bills and purchase documents.', 'purchases', 'read', true),
  ('purchases.write', 'Write purchases', 'Create draft purchase documents through approved paths.', 'purchases', 'write', true),
  ('banking.read', 'Read banking', 'Read bank accounts and transaction summaries.', 'banking', 'read', true),
  ('accounting.read', 'Read accounting', 'Read chart of accounts and posted journal summaries.', 'accounting', 'read', true),
  ('files.write', 'Upload files', 'Attach documents to authorised records.', 'files', 'write', true),
  ('webhooks.manage', 'Manage webhooks', 'Register and rotate webhook endpoints for the application.', 'platform', 'write', true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  access = EXCLUDED.access,
  is_published = EXCLUDED.is_published;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_marketplace_catalogue()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a."sortOrder"), '[]'::jsonb)
  FROM (
    SELECT
      app.code,
      app.name,
      app.headline,
      app.description,
      app.publisher_name AS "publisherName",
      app.publisher_website AS "publisherWebsite",
      app.kind,
      app.native_priority AS "nativePriority",
      app.implementation_status AS "implementationStatus",
      app.blocker_notes AS "blockerNotes",
      app.pricing_model AS "pricingModel",
      app.countries,
      app.modules,
      app.sync_capabilities AS "syncCapabilities",
      app.auth_methods AS "authMethods",
      app.requested_api_scopes AS "requestedApiScopes",
      app.featured,
      app.recommended,
      app.recently_added AS "recentlyAdded",
      app.sort_order AS "sortOrder",
      app.documentation_url AS "documentationUrl",
      app.privacy_policy_url AS "privacyPolicyUrl",
      app.support_url AS "supportUrl",
      COALESCE((
        SELECT array_agg(mac.category_code ORDER BY mac.category_code)
        FROM public.marketplace_app_categories mac
        WHERE mac.app_code = app.code
      ), ARRAY[]::text[]) AS "categoryCodes"
    FROM public.marketplace_apps app
    WHERE app.is_published = true
  ) a;
$$;

REVOKE ALL ON FUNCTION public.list_public_marketplace_catalogue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_marketplace_catalogue() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_company_marketplace_apps(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'appstore.view') THEN
    RAISE EXCEPTION 'missing appstore.view' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a."sortOrder"), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      app.code,
      app.name,
      app.headline,
      app.description,
      app.publisher_name AS "publisherName",
      app.publisher_website AS "publisherWebsite",
      app.kind,
      app.native_priority AS "nativePriority",
      app.implementation_status AS "implementationStatus",
      app.blocker_notes AS "blockerNotes",
      app.pricing_model AS "pricingModel",
      app.countries,
      app.modules,
      app.sync_capabilities AS "syncCapabilities",
      app.auth_methods AS "authMethods",
      app.requested_api_scopes AS "requestedApiScopes",
      app.featured,
      app.recommended,
      app.recently_added AS "recentlyAdded",
      app.sort_order AS "sortOrder",
      app.documentation_url AS "documentationUrl",
      app.privacy_policy_url AS "privacyPolicyUrl",
      app.support_url AS "supportUrl",
      COALESCE((
        SELECT array_agg(mac.category_code ORDER BY mac.category_code)
        FROM public.marketplace_app_categories mac
        WHERE mac.app_code = app.code
      ), ARRAY[]::text[]) AS "categoryCodes",
      CASE
        WHEN inst.id IS NULL THEN 'not_installed'
        WHEN inst.status = 'disabled' THEN 'disabled'
        WHEN inst.status = 'error' THEN 'error'
        WHEN inst.status IN ('installed', 'installing', 'requested') THEN 'installed'
        ELSE 'not_installed'
      END AS "installStatus",
      inst.id AS "installId"
    FROM public.marketplace_apps app
    LEFT JOIN public.app_installations inst
      ON inst.app_code = app.code AND inst.company_id = _company_id
    WHERE app.is_published = true
  ) a;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_marketplace_apps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_company_marketplace_apps(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_marketplace_app_install(
  _company_id uuid,
  _app_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_row public.marketplace_apps%ROWTYPE;
  inst public.app_installations%ROWTYPE;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'not a company member' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'appstore.request_install')
    OR public.has_company_permission(_company_id, 'appstore.install')
  ) THEN
    RAISE EXCEPTION 'missing install permission' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO app_row FROM public.marketplace_apps WHERE code = _app_code AND is_published = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app not found' USING ERRCODE = 'P0002';
  END IF;

  -- Never mark install complete for unverified connectors.
  IF app_row.implementation_status = 'e2e_verified'
     AND public.has_company_permission(_company_id, 'appstore.install') THEN
    INSERT INTO public.app_installations (company_id, app_code, status, installed_by, installed_at)
    VALUES (_company_id, _app_code, 'installed', auth.uid(), now())
    ON CONFLICT (company_id, app_code) DO UPDATE SET
      status = 'installed',
      installed_by = auth.uid(),
      installed_at = COALESCE(public.app_installations.installed_at, now()),
      disabled_at = NULL,
      last_error = NULL,
      updated_at = now()
    RETURNING * INTO inst;
  ELSE
    INSERT INTO public.app_installations (company_id, app_code, status, installed_by)
    VALUES (_company_id, _app_code, 'requested', auth.uid())
    ON CONFLICT (company_id, app_code) DO UPDATE SET
      status = CASE
        WHEN public.app_installations.status = 'installed' THEN public.app_installations.status
        ELSE 'requested'
      END,
      updated_at = now()
    RETURNING * INTO inst;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    CASE WHEN inst.status = 'installed' THEN 'marketplace.installed' ELSE 'marketplace.install_requested' END,
    'marketplace_app',
    inst.id,
    jsonb_build_object(
      'app_code', _app_code,
      'implementation_status', app_row.implementation_status,
      'status', inst.status
    )
  );

  RETURN jsonb_build_object(
    'id', inst.id,
    'appCode', inst.app_code,
    'status', inst.status,
    'implementationStatus', app_row.implementation_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_marketplace_app_install(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_marketplace_app_install(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_public_api_scopes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.key), '[]'::jsonb)
  FROM (
    SELECT key, label, description, module, access
    FROM public.public_api_scopes
    WHERE is_published = true
  ) s;
$$;

REVOKE ALL ON FUNCTION public.list_public_api_scopes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_api_scopes() TO anon, authenticated;
