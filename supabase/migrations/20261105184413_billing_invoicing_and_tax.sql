-- Billing platform, phase 6: seller entities, gapless invoice and credit-note numbering, approved
-- tax rules, the payment ledger, immutable invoices and credit notes, and two-person refunds.
-- No tax rate, seller or registration is seeded: they are entered by platform staff and a tax rule
-- applies only after a second platform owner approves it. Tax labels are configuration, not a
-- legal determination. A country cannot open for paid checkout until it has an approved rule and
-- an active seller with numbering. Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Customer tax identifier (B2B when present)
-- ---------------------------------------------------------------------------
ALTER TABLE billing.billing_accounts
  ADD COLUMN IF NOT EXISTS tax_id_scheme text,
  ADD COLUMN IF NOT EXISTS tax_id text;
DO $$ BEGIN
  ALTER TABLE billing.billing_accounts ADD CONSTRAINT billing_accounts_tax_id_shape CHECK (
    (tax_id IS NULL AND tax_id_scheme IS NULL)
    OR (tax_id_scheme IN ('GSTIN', 'VAT', 'GST', 'ABN', 'NZBN', 'EIN', 'OTHER')
        AND tax_id ~ '^[A-Za-z0-9 ./-]{3,40}$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.billing_set_tax_id(_account_id uuid, _scheme text, _tax_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  before_row billing.billing_accounts%ROWTYPE;
  clean text := nullif(upper(btrim(coalesce(_tax_id, ''))), '');
BEGIN
  IF NOT billing.can_access_account(_account_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage this billing account' USING ERRCODE = '42501';
  END IF;
  IF clean IS NOT NULL AND _scheme = 'GSTIN' AND clean !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Enter a 15-character GSTIN' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO before_row FROM billing.billing_accounts WHERE id = _account_id FOR UPDATE;
  UPDATE billing.billing_accounts
     SET tax_id_scheme = CASE WHEN clean IS NULL THEN NULL ELSE _scheme END, tax_id = clean, updated_at = now()
   WHERE id = _account_id;
  PERFORM billing.write_audit('billing_account.tax_id_updated', 'billing_account', _account_id::text, _account_id,
    jsonb_build_object('scheme', before_row.tax_id_scheme, 'set', before_row.tax_id IS NOT NULL),
    jsonb_build_object('scheme', CASE WHEN clean IS NULL THEN NULL ELSE _scheme END, 'set', clean IS NOT NULL),
    'Customer tax identifier');
  RETURN jsonb_build_object('scheme', CASE WHEN clean IS NULL THEN NULL ELSE _scheme END, 'taxId', clean);
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Choose a tax scheme and enter 3-40 letters, digits, spaces, dots, slashes or dashes' USING ERRCODE = '22023';
END $$;

-- The account view includes the tax identifier.
CREATE OR REPLACE FUNCTION billing.account_json(_account_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'accountType', a.account_type,
    'displayName', a.display_name,
    'status', a.status,
    'billingEmail', a.billing_email,
    'legalName', a.legal_name,
    'address', jsonb_build_object(
      'line1', a.address_line1, 'line2', a.address_line2, 'city', a.city,
      'region', a.region, 'postalCode', a.postal_code),
    'billingCountry', a.billing_country,
    'countrySource', a.country_source,
    'taxIdScheme', a.tax_id_scheme,
    'taxId', a.tax_id,
    'userLimit', a.user_limit,
    'companyLimit', a.company_limit,
    'isOwner', a.owner_user_id = auth.uid(),
    'updatedAt', a.updated_at,
    'companies', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
        FROM billing.billing_account_companies l
        JOIN public.companies c ON c.id = l.company_id
       WHERE l.billing_account_id = a.id), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'view', billing.can_access_account(a.id, 'billing.view'),
      'manage', billing.can_access_account(a.id, 'billing.manage'),
      'paymentMethods', billing.can_access_account(a.id, 'billing.payment_methods'))
  )
  FROM billing.billing_accounts a
  WHERE a.id = _account_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Sellers and numbering
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.seller_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 200),
  trading_name text CHECK (trading_name IS NULL OR char_length(trading_name) <= 200),
  country_code char(2) NOT NULL REFERENCES billing.countries(code),
  address_line1 text NOT NULL CHECK (char_length(btrim(address_line1)) BETWEEN 2 AND 200),
  address_line2 text CHECK (address_line2 IS NULL OR char_length(address_line2) <= 200),
  city text NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 120),
  region text CHECK (region IS NULL OR char_length(region) <= 120),
  postal_code text CHECK (postal_code IS NULL OR char_length(postal_code) <= 20),
  tax_registrations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tax_registrations) = 'array'),
  support_email text CHECK (support_email IS NULL OR support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  serves_countries char(2)[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  created_by uuid,
  activated_by uuid,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seller_entities_one_default
  ON billing.seller_entities (is_default) WHERE is_default AND status = 'active';

CREATE TABLE IF NOT EXISTS billing.invoice_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_entity_id uuid NOT NULL REFERENCES billing.seller_entities(id),
  document_type text NOT NULL CHECK (document_type IN ('invoice', 'credit_note')),
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z0-9/-]{1,10}$'),
  padding integer NOT NULL DEFAULT 6 CHECK (padding BETWEEN 3 AND 10),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_entity_id, document_type, prefix),
  -- Indian GST invoices allow at most 16 characters; the limit is applied everywhere.
  CONSTRAINT invoice_series_number_length CHECK (char_length(prefix) + padding <= 16)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_series_one_active
  ON billing.invoice_series (seller_entity_id, document_type) WHERE is_active;

CREATE OR REPLACE FUNCTION billing.guard_invoice_series() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Numbering series are kept for the record' USING ERRCODE = '55000';
  END IF;
  IF (NEW.seller_entity_id, NEW.document_type, NEW.prefix, NEW.padding)
     IS DISTINCT FROM (OLD.seller_entity_id, OLD.document_type, OLD.prefix, OLD.padding)
     OR NEW.next_number < OLD.next_number THEN
    RAISE EXCEPTION 'A numbering series cannot be changed or rewound; create a new series' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_series_guard ON billing.invoice_series;
CREATE TRIGGER invoice_series_guard BEFORE UPDATE OR DELETE ON billing.invoice_series
  FOR EACH ROW EXECUTE FUNCTION billing.guard_invoice_series();

-- Gapless: the counter row is locked and advanced in the issuing transaction; a rollback returns
-- the number.
CREATE OR REPLACE FUNCTION billing.allocate_document_number(_series_id uuid) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  series billing.invoice_series%ROWTYPE;
BEGIN
  UPDATE billing.invoice_series SET next_number = next_number + 1
   WHERE id = _series_id AND is_active
  RETURNING * INTO series;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active numbering series' USING ERRCODE = 'P0001';
  END IF;
  RETURN series.prefix || lpad((series.next_number - 1)::text, series.padding, '0');
END $$;

CREATE OR REPLACE FUNCTION billing.seller_for_country(_country text) RETURNS billing.seller_entities
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT s.* FROM billing.seller_entities s
   WHERE s.status = 'active' AND (_country = ANY (s.serves_countries) OR s.is_default)
   ORDER BY (_country = ANY (s.serves_countries)) DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION billing.active_series(_seller uuid, _type text) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT id FROM billing.invoice_series WHERE seller_entity_id = _seller AND document_type = _type AND is_active;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tax rules (approved by a second platform owner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL REFERENCES billing.countries(code),
  region_code text CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9-]{1,10}$'),
  customer_type text NOT NULL CHECK (customer_type IN ('B2B', 'B2C', 'ANY')),
  tax_label text NOT NULL CHECK (char_length(btrim(tax_label)) BETWEEN 1 AND 40),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  price_mode text NOT NULL CHECK (price_mode IN ('inclusive', 'exclusive')),
  treatment text NOT NULL DEFAULT 'standard'
    CHECK (treatment IN ('standard', 'zero_rated', 'exempt', 'reverse_charge', 'not_collected')),
  invoice_note text CHECK (invoice_note IS NULL OR char_length(invoice_note) <= 500),
  basis text NOT NULL CHECK (char_length(btrim(basis)) BETWEEN 3 AND 1000),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (treatment = 'standard' OR rate_bps = 0),
  CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM created_by)
);

CREATE OR REPLACE FUNCTION billing.guard_tax_rule() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Approved tax rules are kept; retire them instead' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (NEW.country_code, NEW.region_code, NEW.customer_type, NEW.tax_label, NEW.rate_bps,
       NEW.price_mode, NEW.treatment, NEW.invoice_note, NEW.basis, NEW.effective_from, NEW.effective_to)
     IS DISTINCT FROM (OLD.country_code, OLD.region_code, OLD.customer_type, OLD.tax_label, OLD.rate_bps,
       OLD.price_mode, OLD.treatment, OLD.invoice_note, OLD.basis, OLD.effective_from, OLD.effective_to) THEN
    RAISE EXCEPTION 'An approved tax rule cannot change; draft a new rule' USING ERRCODE = '55000';
  END IF;
  IF NOT (OLD.status = NEW.status OR (OLD.status = 'draft' AND NEW.status IN ('approved', 'retired'))
          OR (OLD.status = 'approved' AND NEW.status = 'retired')) THEN
    RAISE EXCEPTION 'Invalid tax rule status change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tax_rules_guard ON billing.tax_rules;
CREATE TRIGGER tax_rules_guard BEFORE UPDATE OR DELETE ON billing.tax_rules
  FOR EACH ROW EXECUTE FUNCTION billing.guard_tax_rule();

-- Most specific approved rule in force on the date: region before country, exact customer type
-- before ANY.
CREATE OR REPLACE FUNCTION billing.resolve_tax_rule(_country text, _region text, _b2b boolean, _on date)
RETURNS billing.tax_rules
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.* FROM billing.tax_rules r
   WHERE r.status = 'approved' AND r.country_code = _country
     AND (r.region_code IS NULL OR r.region_code = upper(_region))
     AND r.customer_type IN (CASE WHEN _b2b THEN 'B2B' ELSE 'B2C' END, 'ANY')
     AND r.effective_from <= _on AND (r.effective_to IS NULL OR r.effective_to > _on)
   ORDER BY (r.region_code IS NOT NULL) DESC, (r.customer_type <> 'ANY') DESC
   LIMIT 1;
$$;

-- Tax inside a tax-inclusive gross amount (rounded once, half up).
CREATE OR REPLACE FUNCTION billing.inclusive_tax(_gross bigint, _rate_bps integer) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _gross - billing.round_ratio(_gross::numeric * 10000, (10000 + _rate_bps)::numeric, 'HALF_UP');
$$;

-- Tax added to a tax-exclusive net amount (rounded once, half up).
CREATE OR REPLACE FUNCTION billing.exclusive_tax(_net bigint, _rate_bps integer) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT billing.round_ratio(_net::numeric * _rate_bps, 10000, 'HALF_UP');
$$;

CREATE TABLE IF NOT EXISTS billing.provider_tax_rate_mappings (
  tax_rule_id uuid NOT NULL REFERENCES billing.tax_rules(id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  provider_tax_rate_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tax_rule_id, provider, mode)
);

-- ---------------------------------------------------------------------------
-- 4. Payments, invoices, credit notes, refunds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  billing_account_id uuid,
  provider text NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  provider_payment_id text NOT NULL,
  provider_invoice_id text,
  provider_subscription_id text,
  currency char(3) NOT NULL REFERENCES billing.currencies(code),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  provider_tax_minor bigint CHECK (provider_tax_minor IS NULL OR provider_tax_minor >= 0),
  refunded_minor bigint NOT NULL DEFAULT 0,
  method text,
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'partially_refunded', 'refunded')),
  period_start timestamptz,
  period_end timestamptz,
  plan_code text,
  plan_price_id uuid,
  invoice_issue_error text,
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, mode, provider_payment_id),
  CHECK (refunded_minor BETWEEN 0 AND amount_minor)
);
CREATE INDEX IF NOT EXISTS payments_company_idx ON billing.payments (company_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS billing.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  series_id uuid NOT NULL REFERENCES billing.invoice_series(id),
  seller_entity_id uuid NOT NULL REFERENCES billing.seller_entities(id),
  seller jsonb NOT NULL,
  company_id uuid NOT NULL,
  billing_account_id uuid,
  customer jsonb NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('B2B', 'B2C')),
  currency char(3) NOT NULL,
  subtotal_minor bigint NOT NULL,
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  credited_minor bigint NOT NULL DEFAULT 0,
  tax_rule_id uuid REFERENCES billing.tax_rules(id),
  tax jsonb NOT NULL,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'partially_credited', 'credited')),
  payment_id uuid NOT NULL UNIQUE REFERENCES billing.payments(id),
  plan_code text,
  plan_price_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text,
  pdf_sha256 text,
  CHECK (subtotal_minor + tax_minor = total_minor),
  CHECK (credited_minor BETWEEN 0 AND total_minor)
);
CREATE INDEX IF NOT EXISTS invoices_company_idx ON billing.invoices (company_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS billing.invoice_lines (
  invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
  line_no integer NOT NULL CHECK (line_no >= 1),
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  net_minor bigint NOT NULL,
  tax_minor bigint NOT NULL,
  total_minor bigint NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  PRIMARY KEY (invoice_id, line_no),
  CHECK (net_minor + tax_minor = total_minor)
);

CREATE TABLE IF NOT EXISTS billing.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES billing.payments(id),
  invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'submitted', 'succeeded', 'failed')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  provider_refund_id text,
  submitted_at timestamptz,
  completed_at timestamptz,
  failure text,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by IS DISTINCT FROM requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS refunds_provider_key ON billing.refunds (provider_refund_id) WHERE provider_refund_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL UNIQUE,
  series_id uuid NOT NULL REFERENCES billing.invoice_series(id),
  invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
  refund_id uuid UNIQUE REFERENCES billing.refunds(id),
  company_id uuid NOT NULL,
  seller jsonb NOT NULL,
  customer jsonb NOT NULL,
  currency char(3) NOT NULL,
  subtotal_minor bigint NOT NULL,
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  reason text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text,
  pdf_sha256 text,
  CHECK (subtotal_minor + tax_minor = total_minor)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing.seller_entities', 'billing.invoice_series', 'billing.tax_rules',
    'billing.provider_tax_rate_mappings', 'billing.payments', 'billing.invoices', 'billing.invoice_lines',
    'billing.refunds', 'billing.credit_notes'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    BEGIN
      EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', t);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

-- Issued documents are immutable; only credit totals, status and the stored PDF reference move.
CREATE OR REPLACE FUNCTION billing.guard_issued_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  old_core jsonb;
  new_core jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued billing documents cannot be deleted' USING ERRCODE = '55000';
  END IF;
  old_core := to_jsonb(OLD) - ARRAY['credited_minor', 'status', 'pdf_path', 'pdf_sha256'];
  new_core := to_jsonb(NEW) - ARRAY['credited_minor', 'status', 'pdf_path', 'pdf_sha256'];
  IF old_core IS DISTINCT FROM new_core THEN
    RAISE EXCEPTION 'Issued billing documents cannot change; issue a credit note' USING ERRCODE = '55000';
  END IF;
  IF OLD.pdf_path IS NOT NULL AND (NEW.pdf_path, NEW.pdf_sha256) IS DISTINCT FROM (OLD.pdf_path, OLD.pdf_sha256) THEN
    RAISE EXCEPTION 'The stored PDF cannot be replaced' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoices_immutable ON billing.invoices;
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON billing.invoices
  FOR EACH ROW EXECUTE FUNCTION billing.guard_issued_document();
DROP TRIGGER IF EXISTS credit_notes_immutable ON billing.credit_notes;
CREATE TRIGGER credit_notes_immutable BEFORE UPDATE OR DELETE ON billing.credit_notes
  FOR EACH ROW EXECUTE FUNCTION billing.guard_issued_document();

CREATE OR REPLACE FUNCTION billing.immutable_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS invoice_lines_immutable ON billing.invoice_lines;
CREATE TRIGGER invoice_lines_immutable BEFORE UPDATE OR DELETE ON billing.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION billing.immutable_row();

CREATE OR REPLACE FUNCTION billing.guard_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments are kept for the record' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['refunded_minor', 'status', 'invoice_issue_error'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['refunded_minor', 'status', 'invoice_issue_error'])
     OR NEW.refunded_minor < OLD.refunded_minor THEN
    RAISE EXCEPTION 'A recorded payment cannot change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payments_guard ON billing.payments;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON billing.payments
  FOR EACH ROW EXECUTE FUNCTION billing.guard_payment();

CREATE OR REPLACE FUNCTION billing.guard_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Refunds are kept for the record' USING ERRCODE = '55000';
  END IF;
  IF (NEW.payment_id, NEW.invoice_id, NEW.amount_minor, NEW.currency, NEW.reason, NEW.requested_by, NEW.idempotency_key)
     IS DISTINCT FROM (OLD.payment_id, OLD.invoice_id, OLD.amount_minor, OLD.currency, OLD.reason, OLD.requested_by, OLD.idempotency_key) THEN
    RAISE EXCEPTION 'A refund request cannot be edited' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
       (OLD.status = 'requested' AND NEW.status IN ('approved', 'rejected'))
    OR (OLD.status = 'approved' AND NEW.status IN ('submitted', 'succeeded', 'failed'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('succeeded', 'failed'))) THEN
    RAISE EXCEPTION 'Invalid refund status change % -> %', OLD.status, NEW.status USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS refunds_guard ON billing.refunds;
CREATE TRIGGER refunds_guard BEFORE UPDATE OR DELETE ON billing.refunds
  FOR EACH ROW EXECUTE FUNCTION billing.guard_refund();

-- Private storage for generated PDFs (served through short-lived signed URLs after a permission check).
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('billing-documents', 'billing-documents', false, 5242880, ARRAY['application/pdf'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Snapshots and invoice issue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.customer_snapshot(_company_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'name', coalesce(a.legal_name, a.display_name, c.name),
    'email', a.billing_email,
    'line1', a.address_line1, 'line2', a.address_line2, 'city', a.city, 'region', a.region,
    'postalCode', a.postal_code,
    'country', coalesce(a.billing_country, upper(c.country_code)),
    'taxIdScheme', a.tax_id_scheme, 'taxId', a.tax_id,
    'billingAccountId', a.id)
  FROM public.companies c
  LEFT JOIN billing.billing_account_companies l ON l.company_id = c.id
  LEFT JOIN billing.billing_accounts a ON a.id = l.billing_account_id
  WHERE c.id = _company_id;
$$;

CREATE OR REPLACE FUNCTION billing.seller_snapshot(_seller billing.seller_entities) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', _seller.id, 'legalName', _seller.legal_name, 'tradingName', _seller.trading_name,
    'line1', _seller.address_line1, 'line2', _seller.address_line2, 'city', _seller.city, 'region', _seller.region,
    'postalCode', _seller.postal_code, 'country', _seller.country_code, 'registrations', _seller.tax_registrations,
    'supportEmail', _seller.support_email);
$$;

-- Issues the invoice for a recorded payment. Missing configuration leaves the payment recorded with
-- the reason, for platform staff to resolve and issue later; nothing is guessed.
CREATE OR REPLACE FUNCTION billing.issue_invoice(_payment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pay billing.payments%ROWTYPE;
  cust jsonb;
  cust_country text;
  is_b2b boolean;
  seller billing.seller_entities%ROWTYPE;
  series_id uuid;
  rule billing.tax_rules%ROWTYPE;
  tax_amount bigint;
  doc_number text;
  invoice_id uuid;
  problem text;
  plan_name text;
BEGIN
  SELECT * INTO pay FROM billing.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown payment' USING ERRCODE = '22023';
  END IF;
  SELECT i.id INTO invoice_id FROM billing.invoices i WHERE i.payment_id = pay.id;
  IF invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'exists', 'invoiceId', invoice_id);
  END IF;
  cust := billing.customer_snapshot(pay.company_id);
  cust_country := cust ->> 'country';
  is_b2b := cust ->> 'taxId' IS NOT NULL;
  seller := billing.seller_for_country(cust_country);
  IF seller.id IS NULL THEN
    problem := format('No active seller entity for %s', cust_country);
  ELSE
    series_id := billing.active_series(seller.id, 'invoice');
    IF series_id IS NULL THEN
      problem := 'The seller has no active invoice numbering series';
    END IF;
  END IF;
  IF problem IS NULL THEN
    rule := billing.resolve_tax_rule(cust_country, cust ->> 'region', is_b2b, pay.paid_at::date);
    IF rule.id IS NULL THEN
      problem := format('No approved tax rule for %s on %s', cust_country, pay.paid_at::date);
    ELSIF rule.treatment <> 'standard' OR rule.rate_bps = 0 THEN
      IF coalesce(pay.provider_tax_minor, 0) > 0 THEN
        problem := 'The provider charged tax but the approved rule charges none';
      END IF;
      tax_amount := 0;
    ELSIF rule.price_mode = 'inclusive' THEN
      tax_amount := billing.inclusive_tax(pay.amount_minor, rule.rate_bps);
    ELSIF pay.provider_tax_minor IS NULL THEN
      problem := 'The approved rule adds tax but the provider did not charge it';
    ELSE
      tax_amount := pay.provider_tax_minor;
    END IF;
  END IF;
  IF problem IS NOT NULL THEN
    UPDATE billing.payments SET invoice_issue_error = problem WHERE id = pay.id;
    RETURN jsonb_build_object('result', 'pending', 'reason', problem);
  END IF;

  doc_number := billing.allocate_document_number(series_id);
  plan_name := (SELECT bp.name FROM public.billing_plans bp WHERE bp.code = pay.plan_code);
  INSERT INTO billing.invoices (invoice_number, series_id, seller_entity_id, seller, company_id, billing_account_id,
    customer, customer_type, currency, subtotal_minor, tax_minor, total_minor, tax_rule_id, tax, payment_id,
    plan_code, plan_price_id, period_start, period_end, issued_at)
  VALUES (doc_number, series_id, seller.id, billing.seller_snapshot(seller), pay.company_id, pay.billing_account_id,
    cust, CASE WHEN is_b2b THEN 'B2B' ELSE 'B2C' END, pay.currency, pay.amount_minor - tax_amount, tax_amount,
    pay.amount_minor, rule.id,
    jsonb_build_object('label', rule.tax_label, 'rateBps', rule.rate_bps, 'mode', rule.price_mode,
      'treatment', rule.treatment, 'note', rule.invoice_note),
    pay.id, pay.plan_code, pay.plan_price_id, pay.period_start, pay.period_end, now())
  RETURNING id INTO invoice_id;
  INSERT INTO billing.invoice_lines (invoice_id, line_no, description, net_minor, tax_minor, total_minor, period_start, period_end)
  VALUES (invoice_id, 1, 'LinkBooks ' || coalesce(plan_name, pay.plan_code, 'subscription') || ' subscription',
    pay.amount_minor - tax_amount, tax_amount, pay.amount_minor, pay.period_start, pay.period_end);
  UPDATE billing.payments SET invoice_issue_error = NULL WHERE id = pay.id;
  PERFORM billing.write_audit('invoice.issued', 'invoice', invoice_id::text, pay.billing_account_id, NULL,
    jsonb_build_object('number', doc_number, 'currency', pay.currency, 'total', pay.amount_minor, 'tax', tax_amount,
      'paymentId', pay.id), 'Payment received');
  RETURN jsonb_build_object('result', 'issued', 'invoiceId', invoice_id, 'number', doc_number);
END $$;

-- Service role only: records a verified provider payment and issues its invoice.
CREATE OR REPLACE FUNCTION public.billing_record_provider_payment(_provider text, _mode text, _payment jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub public.company_subscriptions%ROWTYPE;
  payment_id uuid;
BEGIN
  SELECT * INTO sub FROM public.company_subscriptions
   WHERE provider = _provider AND provider_subscription_id = nullif(_payment ->> 'subscriptionId', '');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'skipped', 'reason', 'unknown subscription');
  END IF;
  INSERT INTO billing.payments (company_id, billing_account_id, provider, mode, provider_payment_id, provider_invoice_id,
    provider_subscription_id, currency, amount_minor, provider_tax_minor, method, period_start, period_end, plan_code,
    plan_price_id, paid_at)
  VALUES (sub.company_id,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = sub.company_id),
    _provider, _mode, _payment ->> 'paymentId', nullif(_payment ->> 'invoiceRef', ''), sub.provider_subscription_id,
    upper(_payment ->> 'currency'), (_payment ->> 'amountMinor')::bigint,
    nullif(_payment ->> 'taxMinor', '')::bigint, nullif(_payment ->> 'method', ''),
    nullif(_payment ->> 'periodStart', '')::timestamptz, nullif(_payment ->> 'periodEnd', '')::timestamptz,
    sub.plan_code, sub.plan_price_id, coalesce(nullif(_payment ->> 'paidAt', '')::timestamptz, now()))
  ON CONFLICT (provider, mode, provider_payment_id) DO NOTHING
  RETURNING id INTO payment_id;
  IF payment_id IS NULL THEN
    SELECT p.id INTO payment_id FROM billing.payments p
     WHERE p.provider = _provider AND p.mode = _mode AND p.provider_payment_id = _payment ->> 'paymentId';
  END IF;
  RETURN jsonb_build_object('paymentId', payment_id) || billing.issue_invoice(payment_id);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Refunds (requested, approved by a different platform owner, executed at the provider)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.complete_refund(_refund_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ref billing.refunds%ROWTYPE;
  inv billing.invoices%ROWTYPE;
  series_id uuid;
  credit_tax bigint;
  doc_number text;
  note_id uuid;
BEGIN
  SELECT * INTO ref FROM billing.refunds WHERE id = _refund_id FOR UPDATE;
  IF ref.status = 'succeeded' THEN
    RETURN jsonb_build_object('result', 'exists');
  END IF;
  SELECT * INTO inv FROM billing.invoices WHERE id = ref.invoice_id FOR UPDATE;
  series_id := billing.active_series(inv.seller_entity_id, 'credit_note');
  IF series_id IS NULL THEN
    RAISE EXCEPTION 'The seller has no active credit note numbering series' USING ERRCODE = 'P0001';
  END IF;
  UPDATE billing.refunds SET status = 'succeeded', completed_at = now() WHERE id = ref.id;
  UPDATE billing.payments SET refunded_minor = refunded_minor + ref.amount_minor,
    status = CASE WHEN refunded_minor + ref.amount_minor >= amount_minor THEN 'refunded' ELSE 'partially_refunded' END
   WHERE id = ref.payment_id;
  credit_tax := billing.round_ratio(ref.amount_minor::numeric * inv.tax_minor, inv.total_minor::numeric, 'HALF_UP');
  doc_number := billing.allocate_document_number(series_id);
  INSERT INTO billing.credit_notes (credit_note_number, series_id, invoice_id, refund_id, company_id, seller, customer,
    currency, subtotal_minor, tax_minor, total_minor, reason)
  VALUES (doc_number, series_id, inv.id, ref.id, inv.company_id, inv.seller, inv.customer, inv.currency,
    ref.amount_minor - credit_tax, credit_tax, ref.amount_minor, ref.reason)
  RETURNING id INTO note_id;
  UPDATE billing.invoices SET credited_minor = credited_minor + ref.amount_minor,
    status = CASE WHEN credited_minor + ref.amount_minor >= total_minor THEN 'credited' ELSE 'partially_credited' END
   WHERE id = inv.id;
  PERFORM billing.write_audit('refund.succeeded', 'refund', ref.id::text, inv.billing_account_id, NULL,
    jsonb_build_object('amount', ref.amount_minor, 'currency', ref.currency, 'creditNote', doc_number,
      'providerRefundId', ref.provider_refund_id), ref.reason);
  RETURN jsonb_build_object('result', 'succeeded', 'creditNoteId', note_id, 'number', doc_number);
END $$;

CREATE OR REPLACE FUNCTION public.platform_request_refund(_payment_id uuid, _amount_minor bigint, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pay billing.payments%ROWTYPE;
  inv billing.invoices%ROWTYPE;
  open_amount bigint;
  refund_id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  SELECT * INTO pay FROM billing.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown payment' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO inv FROM billing.invoices WHERE payment_id = pay.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue the invoice for this payment before refunding it' USING ERRCODE = 'P0001';
  END IF;
  IF billing.active_series(inv.seller_entity_id, 'credit_note') IS NULL THEN
    RAISE EXCEPTION 'Create a credit note numbering series for the seller first' USING ERRCODE = 'P0001';
  END IF;
  open_amount := pay.amount_minor - pay.refunded_minor - coalesce((SELECT sum(r.amount_minor) FROM billing.refunds r
    WHERE r.payment_id = pay.id AND r.status IN ('requested', 'approved', 'submitted')), 0);
  IF _amount_minor IS NULL OR _amount_minor < 1 OR _amount_minor > open_amount THEN
    RAISE EXCEPTION 'Refund between 1 and % minor units', open_amount USING ERRCODE = '22023';
  END IF;
  INSERT INTO billing.refunds (payment_id, invoice_id, amount_minor, currency, reason, requested_by)
  VALUES (pay.id, inv.id, _amount_minor, pay.currency, _reason, auth.uid())
  RETURNING id INTO refund_id;
  PERFORM private.platform_log('refund.requested', 'refund', refund_id::text, NULL,
    jsonb_build_object('paymentId', pay.id, 'amount', _amount_minor, 'currency', pay.currency), _reason);
  RETURN jsonb_build_object('refundId', refund_id, 'status', 'requested');
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Record a reason (3-500 characters)' USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.platform_decide_refund(_refund_id uuid, _approve boolean, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ref billing.refunds%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can approve refunds' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO ref FROM billing.refunds WHERE id = _refund_id FOR UPDATE;
  IF NOT FOUND OR ref.status <> 'requested' THEN
    RAISE EXCEPTION 'Choose a requested refund' USING ERRCODE = '22023';
  END IF;
  IF ref.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'Another platform owner must approve a refund you requested' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.refunds SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    decided_by = auth.uid(), decided_at = now(), decision_reason = _reason
   WHERE id = ref.id;
  PERFORM private.platform_log(CASE WHEN _approve THEN 'refund.approved' ELSE 'refund.rejected' END, 'refund',
    ref.id::text, jsonb_build_object('status', 'requested'),
    jsonb_build_object('status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END), _reason);
  RETURN jsonb_build_object('refundId', ref.id, 'status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END);
END $$;

CREATE OR REPLACE FUNCTION public.platform_refund_for_execution(_refund_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ref billing.refunds%ROWTYPE;
  pay billing.payments%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  SELECT * INTO ref FROM billing.refunds WHERE id = _refund_id;
  IF NOT FOUND OR ref.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved refund can be sent to the provider' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO pay FROM billing.payments WHERE id = ref.payment_id;
  RETURN jsonb_build_object('refundId', ref.id, 'provider', pay.provider, 'mode', pay.mode,
    'providerPaymentId', pay.provider_payment_id, 'amountMinor', ref.amount_minor, 'currency', ref.currency,
    'idempotencyKey', ref.idempotency_key, 'reason', ref.reason);
END $$;

-- Service role only: the provider's answer to a refund we sent, or a later refund webhook.
CREATE OR REPLACE FUNCTION public.billing_refund_submitted(
  _refund_id uuid, _provider_refund_id text, _status text, _failure text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _status NOT IN ('pending', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'Unknown refund status' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.refunds SET provider_refund_id = coalesce(_provider_refund_id, provider_refund_id),
    submitted_at = now(),
    status = CASE _status WHEN 'pending' THEN 'submitted' WHEN 'failed' THEN 'failed' ELSE status END,
    failure = CASE WHEN _status = 'failed' THEN left(coalesce(_failure, 'Provider refused'), 300) END,
    completed_at = CASE WHEN _status = 'failed' THEN now() END
   WHERE id = _refund_id AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The refund is not awaiting the provider' USING ERRCODE = 'P0001';
  END IF;
  IF _status = 'succeeded' THEN
    RETURN billing.complete_refund(_refund_id);
  END IF;
  RETURN jsonb_build_object('result', CASE WHEN _status = 'failed' THEN 'failed' ELSE 'submitted' END);
END $$;

CREATE OR REPLACE FUNCTION public.billing_refund_result(
  _provider text, _provider_refund_id text, _status text, _failure text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ref billing.refunds%ROWTYPE;
BEGIN
  SELECT r.* INTO ref FROM billing.refunds r JOIN billing.payments p ON p.id = r.payment_id
   WHERE r.provider_refund_id = _provider_refund_id AND p.provider = _provider FOR UPDATE OF r;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'skipped', 'reason', 'unknown refund');
  END IF;
  IF ref.status IN ('succeeded', 'failed') THEN
    RETURN jsonb_build_object('result', 'skipped', 'reason', 'refund already final');
  END IF;
  IF _status = 'succeeded' THEN
    RETURN billing.complete_refund(ref.id);
  ELSIF _status = 'failed' THEN
    UPDATE billing.refunds SET status = 'failed', failure = left(coalesce(_failure, 'Provider refund failed'), 300),
      completed_at = now() WHERE id = ref.id;
    RETURN jsonb_build_object('result', 'failed');
  END IF;
  RETURN jsonb_build_object('result', 'skipped', 'reason', 'still pending');
END $$;

-- ---------------------------------------------------------------------------
-- 7. Customer documents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_documents(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.view') THEN
    RAISE EXCEPTION 'You do not have permission to view billing for this organisation' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'invoices', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'number', i.invoice_number,
        'issuedAt', i.issued_at, 'currency', i.currency, 'subtotalMinor', i.subtotal_minor, 'taxMinor', i.tax_minor,
        'totalMinor', i.total_minor, 'creditedMinor', i.credited_minor, 'status', i.status,
        'periodStart', i.period_start, 'periodEnd', i.period_end, 'taxLabel', i.tax ->> 'label')
        ORDER BY i.issued_at DESC) FROM billing.invoices i WHERE i.company_id = _company_id), '[]'::jsonb),
    'creditNotes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'number', n.credit_note_number,
        'invoiceNumber', i.invoice_number, 'issuedAt', n.issued_at, 'currency', n.currency, 'totalMinor', n.total_minor,
        'reason', n.reason) ORDER BY n.issued_at DESC)
      FROM billing.credit_notes n JOIN billing.invoices i ON i.id = n.invoice_id WHERE n.company_id = _company_id), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.billing_document(_kind text, _id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inv billing.invoices%ROWTYPE;
  note billing.credit_notes%ROWTYPE;
  owner_company uuid;
BEGIN
  IF _kind = 'invoice' THEN
    SELECT * INTO inv FROM billing.invoices WHERE id = _id;
    owner_company := inv.company_id;
  ELSIF _kind = 'credit_note' THEN
    SELECT * INTO note FROM billing.credit_notes WHERE id = _id;
    owner_company := note.company_id;
    SELECT * INTO inv FROM billing.invoices WHERE id = note.invoice_id;
  ELSE
    RAISE EXCEPTION 'Unknown document type' USING ERRCODE = '22023';
  END IF;
  IF owner_company IS NULL OR NOT (public.has_company_permission(owner_company, 'billing.view')
       OR private.platform_can('billing.view')) THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'kind', _kind,
    'id', _id,
    'companyId', owner_company,
    'number', CASE WHEN _kind = 'invoice' THEN inv.invoice_number ELSE note.credit_note_number END,
    'invoiceNumber', inv.invoice_number,
    'issuedAt', CASE WHEN _kind = 'invoice' THEN inv.issued_at ELSE note.issued_at END,
    'seller', inv.seller,
    'customer', inv.customer,
    'currency', inv.currency,
    'tax', inv.tax,
    'subtotalMinor', CASE WHEN _kind = 'invoice' THEN inv.subtotal_minor ELSE note.subtotal_minor END,
    'taxMinor', CASE WHEN _kind = 'invoice' THEN inv.tax_minor ELSE note.tax_minor END,
    'totalMinor', CASE WHEN _kind = 'invoice' THEN inv.total_minor ELSE note.total_minor END,
    'reason', note.reason,
    'periodStart', inv.period_start,
    'periodEnd', inv.period_end,
    'lines', CASE WHEN _kind = 'invoice' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('description', l.description,
        'quantity', l.quantity, 'netMinor', l.net_minor, 'taxMinor', l.tax_minor, 'totalMinor', l.total_minor)
        ORDER BY l.line_no) FROM billing.invoice_lines l WHERE l.invoice_id = inv.id), '[]'::jsonb)
      ELSE jsonb_build_array(jsonb_build_object('description', 'Credit against invoice ' || inv.invoice_number,
        'quantity', 1, 'netMinor', note.subtotal_minor, 'taxMinor', note.tax_minor, 'totalMinor', note.total_minor)) END,
    'pdfPath', CASE WHEN _kind = 'invoice' THEN inv.pdf_path ELSE note.pdf_path END);
END $$;

-- Service role only: stores the generated PDF reference once.
CREATE OR REPLACE FUNCTION public.billing_record_document_pdf(_kind text, _id uuid, _path text, _sha256 text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  stored text;
BEGIN
  IF _kind = 'invoice' THEN
    UPDATE billing.invoices SET pdf_path = _path, pdf_sha256 = _sha256 WHERE id = _id AND pdf_path IS NULL;
    SELECT pdf_path INTO stored FROM billing.invoices WHERE id = _id;
  ELSE
    UPDATE billing.credit_notes SET pdf_path = _path, pdf_sha256 = _sha256 WHERE id = _id AND pdf_path IS NULL;
    SELECT pdf_path INTO stored FROM billing.credit_notes WHERE id = _id;
  END IF;
  RETURN stored;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Checkout price with tax
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_checkout_price(_company_id uuid, _plan_code text, _interval text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  country char(2);
  version public.plan_versions%ROWTYPE;
  price public.plan_prices%ROWTYPE;
  cust jsonb;
  rule billing.tax_rules%ROWTYPE;
  tax_amount bigint := 0;
  adds_tax boolean := false;
BEGIN
  IF NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT upper(c.country_code) INTO country FROM public.companies c WHERE c.id = _company_id;
  SELECT v.* INTO version FROM public.plan_versions v JOIN public.billing_plans bp ON bp.code = v.plan_code
   WHERE v.plan_code = _plan_code AND v.status = 'published' AND v.visibility = 'live' AND v.price_book
     AND bp.is_active AND bp.pricing_source = 'price_book'
   ORDER BY v.version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That plan is not on sale' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.* INTO price FROM billing.country_price_rows(version.id, country) p
   WHERE p.billing_interval = _interval AND p.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That billing period is not offered for this plan' USING ERRCODE = 'P0001';
  END IF;
  cust := billing.customer_snapshot(_company_id);
  rule := billing.resolve_tax_rule(country, cust ->> 'region', cust ->> 'taxId' IS NOT NULL, current_date);
  IF rule.id IS NOT NULL AND rule.treatment = 'standard' AND rule.rate_bps > 0 THEN
    adds_tax := rule.price_mode = 'exclusive';
    tax_amount := CASE WHEN adds_tax THEN billing.exclusive_tax(price.amount_minor, rule.rate_bps)
                       ELSE billing.inclusive_tax(price.amount_minor, rule.rate_bps) END;
  END IF;
  RETURN jsonb_build_object(
    'planPriceId', price.id, 'planCode', _plan_code, 'planName', version.name, 'versionId', version.id,
    'interval', price.billing_interval, 'currency', price.currency, 'amountMinor', price.amount_minor,
    'totalMinor', price.amount_minor + CASE WHEN adds_tax THEN tax_amount ELSE 0 END,
    'country', country,
    'billingEnabled', coalesce((SELECT c.billing_enabled FROM billing.countries c WHERE c.code = country), false),
    'providers', to_jsonb(billing.country_providers(country)),
    'tax', CASE WHEN rule.id IS NULL THEN NULL ELSE jsonb_build_object('ruleId', rule.id, 'label', rule.tax_label,
      'rateBps', rule.rate_bps, 'mode', rule.price_mode, 'treatment', rule.treatment, 'taxMinor', tax_amount,
      'note', rule.invoice_note) END);
END $$;

-- ---------------------------------------------------------------------------
-- 9. Country readiness: a country opens only with a seller, numbering and an approved tax rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.country_readiness(_country text) RETURNS text[]
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  problems text[] := '{}';
  seller billing.seller_entities%ROWTYPE;
BEGIN
  seller := billing.seller_for_country(_country);
  IF seller.id IS NULL THEN
    problems := problems || 'no active seller entity serves this country'::text;
  ELSE
    IF billing.active_series(seller.id, 'invoice') IS NULL THEN
      problems := problems || 'the seller has no invoice numbering series'::text;
    END IF;
    IF billing.active_series(seller.id, 'credit_note') IS NULL THEN
      problems := problems || 'the seller has no credit note numbering series'::text;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.tax_rules r WHERE r.status = 'approved' AND r.country_code = _country
       AND r.effective_from <= current_date AND (r.effective_to IS NULL OR r.effective_to > current_date)) THEN
    problems := problems || 'no approved tax rule is in force'::text;
  END IF;
  IF 'razorpay' = ANY (billing.country_providers(_country)) AND EXISTS (SELECT 1 FROM billing.tax_rules r
       WHERE r.status = 'approved' AND r.country_code = _country AND r.price_mode = 'exclusive'
         AND r.treatment = 'standard' AND r.rate_bps > 0
         AND (r.effective_to IS NULL OR r.effective_to > current_date)) THEN
    problems := problems || 'Razorpay cannot add tax to a price, so tax for this country must be price-inclusive'::text;
  END IF;
  RETURN problems;
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_country_billing(_country text, _enabled boolean, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  country char(2) := upper(btrim(coalesce(_country, '')));
  problems text[];
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can open or close a billing country' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.countries c WHERE c.code = country) THEN
    RAISE EXCEPTION 'Unknown country' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_enabled, false) THEN
    problems := billing.country_readiness(country);
    IF cardinality(problems) > 0 THEN
      RAISE EXCEPTION 'Cannot open %: %', country, array_to_string(problems, '; ') USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE billing.countries SET billing_enabled = coalesce(_enabled, false) WHERE code = country;
  PERFORM private.platform_log('payments.country_billing_set', 'billing_country', country, NULL,
    jsonb_build_object('enabled', coalesce(_enabled, false)), _reason);
  RETURN jsonb_build_object('country', country, 'enabled', coalesce(_enabled, false));
END $$;

-- ---------------------------------------------------------------------------
-- 10. Platform administration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_finance_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'sellers', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at) FROM billing.seller_entities s), '[]'::jsonb),
    'series', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'sellerId', x.seller_entity_id,
        'documentType', x.document_type, 'prefix', x.prefix, 'padding', x.padding, 'nextNumber', x.next_number,
        'active', x.is_active) ORDER BY x.created_at) FROM billing.invoice_series x), '[]'::jsonb),
    'taxRules', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.country_code, r.effective_from DESC)
      FROM billing.tax_rules r), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'companyId', p.company_id,
        'provider', p.provider, 'mode', p.mode, 'currency', p.currency, 'amountMinor', p.amount_minor,
        'refundedMinor', p.refunded_minor, 'status', p.status, 'paidAt', p.paid_at,
        'invoiceNumber', (SELECT i.invoice_number FROM billing.invoices i WHERE i.payment_id = p.id),
        'invoiceIssueError', p.invoice_issue_error) ORDER BY p.paid_at DESC)
      FROM (SELECT * FROM billing.payments ORDER BY paid_at DESC LIMIT 50) p), '[]'::jsonb),
    'refunds', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'paymentId', r.payment_id,
        'amountMinor', r.amount_minor, 'currency', r.currency, 'reason', r.reason, 'status', r.status,
        'requestedBy', r.requested_by, 'decidedBy', r.decided_by, 'failure', r.failure, 'createdAt', r.created_at)
        ORDER BY r.created_at DESC) FROM (SELECT * FROM billing.refunds ORDER BY created_at DESC LIMIT 50) r), '[]'::jsonb),
    'pendingInvoices', (SELECT count(*) FROM billing.payments p
      WHERE NOT EXISTS (SELECT 1 FROM billing.invoices i WHERE i.payment_id = p.id)),
    'me', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_seller_entity(_id uuid, _data jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  saved billing.seller_entities%ROWTYPE;
  regs jsonb := coalesce(_data -> 'taxRegistrations', '[]'::jsonb);
  serves char(2)[];
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF jsonb_typeof(regs) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(regs) e
       WHERE coalesce(e ->> 'scheme', '') !~ '^[A-Z]{2,10}$' OR coalesce(e ->> 'number', '') !~ '^[A-Za-z0-9 ./-]{3,40}$') THEN
    RAISE EXCEPTION 'Each tax registration needs a scheme (for example GSTIN or VAT) and a number' USING ERRCODE = '22023';
  END IF;
  serves := ARRAY(SELECT upper(x) FROM jsonb_array_elements_text(coalesce(_data -> 'servesCountries', '[]'::jsonb)) x);
  IF EXISTS (SELECT 1 FROM unnest(serves) c WHERE NOT EXISTS (SELECT 1 FROM billing.countries k WHERE k.code = c)) THEN
    RAISE EXCEPTION 'Unknown country in the served countries' USING ERRCODE = '22023';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO billing.seller_entities (legal_name, trading_name, country_code, address_line1, address_line2, city, region,
      postal_code, tax_registrations, support_email, serves_countries, is_default, created_by)
    VALUES (_data ->> 'legalName', nullif(_data ->> 'tradingName', ''), upper(_data ->> 'country'), _data ->> 'line1',
      nullif(_data ->> 'line2', ''), _data ->> 'city', nullif(_data ->> 'region', ''), nullif(_data ->> 'postalCode', ''),
      regs, nullif(_data ->> 'supportEmail', ''), serves, coalesce((_data ->> 'isDefault')::boolean, false), auth.uid())
    RETURNING * INTO saved;
  ELSE
    UPDATE billing.seller_entities SET legal_name = _data ->> 'legalName', trading_name = nullif(_data ->> 'tradingName', ''),
      country_code = upper(_data ->> 'country'), address_line1 = _data ->> 'line1', address_line2 = nullif(_data ->> 'line2', ''),
      city = _data ->> 'city', region = nullif(_data ->> 'region', ''), postal_code = nullif(_data ->> 'postalCode', ''),
      tax_registrations = regs, support_email = nullif(_data ->> 'supportEmail', ''), serves_countries = serves,
      is_default = coalesce((_data ->> 'isDefault')::boolean, false), updated_at = now()
     WHERE id = _id AND status <> 'retired'
    RETURNING * INTO saved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose a current seller entity' USING ERRCODE = '22023';
    END IF;
  END IF;
  PERFORM private.platform_log('finance.seller_saved', 'seller_entity', saved.id::text, NULL,
    billing.seller_snapshot(saved) || jsonb_build_object('servesCountries', saved.serves_countries, 'isDefault', saved.is_default),
    _reason);
  RETURN billing.seller_snapshot(saved) || jsonb_build_object('status', saved.status);
EXCEPTION
  WHEN check_violation OR not_null_violation OR foreign_key_violation THEN
    RAISE EXCEPTION 'Enter the legal name, country, first address line and city' USING ERRCODE = '22023';
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Another active seller is already the default' USING ERRCODE = '22023';
END $$;

-- Activating a seller is a global change: a platform owner other than its creator does it.
CREATE OR REPLACE FUNCTION public.platform_set_seller_status(_id uuid, _status text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  seller billing.seller_entities%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can activate or retire a seller' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO seller FROM billing.seller_entities WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _status NOT IN ('active', 'retired') OR seller.status = 'retired'
     OR (_status = 'active' AND seller.status <> 'draft') THEN
    RAISE EXCEPTION 'Activate a draft seller or retire a current one' USING ERRCODE = '22023';
  END IF;
  IF _status = 'active' AND seller.created_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Another platform owner must activate a seller you created' USING ERRCODE = '42501';
  END IF;
  UPDATE billing.seller_entities SET status = _status, updated_at = now(),
    activated_by = CASE WHEN _status = 'active' THEN auth.uid() ELSE activated_by END,
    activated_at = CASE WHEN _status = 'active' THEN now() ELSE activated_at END
   WHERE id = _id;
  PERFORM private.platform_log('finance.seller_status', 'seller_entity', _id::text,
    jsonb_build_object('status', seller.status), jsonb_build_object('status', _status), _reason);
  RETURN jsonb_build_object('id', _id, 'status', _status);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Another active seller is already the default' USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.platform_create_invoice_series(
  _seller_id uuid, _document_type text, _prefix text, _padding integer, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  series_id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF NOT EXISTS (SELECT 1 FROM billing.seller_entities s WHERE s.id = _seller_id AND s.status <> 'retired') THEN
    RAISE EXCEPTION 'Choose a current seller' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.invoice_series SET is_active = false
   WHERE seller_entity_id = _seller_id AND document_type = _document_type AND is_active;
  INSERT INTO billing.invoice_series (seller_entity_id, document_type, prefix, padding, created_by)
  VALUES (_seller_id, _document_type, upper(btrim(_prefix)), coalesce(_padding, 6), auth.uid())
  RETURNING id INTO series_id;
  PERFORM private.platform_log('finance.series_created', 'invoice_series', series_id::text, NULL,
    jsonb_build_object('sellerId', _seller_id, 'documentType', _document_type, 'prefix', upper(btrim(_prefix)),
      'padding', coalesce(_padding, 6)), _reason);
  RETURN jsonb_build_object('id', series_id);
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Use a prefix of capital letters, digits, / or - so the number fits in 16 characters' USING ERRCODE = '22023';
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That prefix has already been used for this seller' USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.platform_draft_tax_rule(_data jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rule_id uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  INSERT INTO billing.tax_rules (country_code, region_code, customer_type, tax_label, rate_bps, price_mode, treatment,
    invoice_note, basis, effective_from, effective_to, created_by)
  VALUES (upper(_data ->> 'country'), nullif(upper(_data ->> 'region'), ''), coalesce(_data ->> 'customerType', 'ANY'),
    _data ->> 'label', (_data ->> 'rateBps')::integer, _data ->> 'priceMode', coalesce(_data ->> 'treatment', 'standard'),
    nullif(_data ->> 'invoiceNote', ''), _data ->> 'basis', (_data ->> 'effectiveFrom')::date,
    nullif(_data ->> 'effectiveTo', '')::date, auth.uid())
  RETURNING id INTO rule_id;
  PERFORM private.platform_log('finance.tax_rule_drafted', 'tax_rule', rule_id::text, NULL, _data, _reason);
  RETURN jsonb_build_object('id', rule_id, 'status', 'draft');
EXCEPTION
  WHEN check_violation OR not_null_violation OR foreign_key_violation OR invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Check the country, label, rate (0-10000 basis points, 0 unless standard), price mode, basis and dates'
      USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.platform_approve_tax_rule(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rule billing.tax_rules%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can approve a tax rule' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO rule FROM billing.tax_rules WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR rule.status <> 'draft' THEN
    RAISE EXCEPTION 'Choose a draft tax rule' USING ERRCODE = '22023';
  END IF;
  IF rule.created_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Another platform owner must approve a tax rule you drafted' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.tax_rules o WHERE o.status = 'approved' AND o.country_code = rule.country_code
       AND o.region_code IS NOT DISTINCT FROM rule.region_code AND o.customer_type = rule.customer_type
       AND daterange(o.effective_from, o.effective_to) && daterange(rule.effective_from, rule.effective_to)) THEN
    RAISE EXCEPTION 'An approved rule already covers part of this period; retire it or change the dates' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.tax_rules SET status = 'approved', approved_by = auth.uid(), approved_at = now() WHERE id = _id;
  PERFORM private.platform_log('finance.tax_rule_approved', 'tax_rule', _id::text, jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'approved', 'country', rule.country_code, 'rateBps', rule.rate_bps,
      'priceMode', rule.price_mode, 'treatment', rule.treatment), _reason);
  RETURN jsonb_build_object('id', _id, 'status', 'approved');
END $$;

CREATE OR REPLACE FUNCTION public.platform_retire_tax_rule(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.manage');
  UPDATE billing.tax_rules SET status = 'retired' WHERE id = _id AND status IN ('draft', 'approved');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a current tax rule' USING ERRCODE = '22023';
  END IF;
  PERFORM private.platform_log('finance.tax_rule_retired', 'tax_rule', _id::text, NULL, NULL, _reason);
  RETURN jsonb_build_object('id', _id, 'status', 'retired');
END $$;

CREATE OR REPLACE FUNCTION public.platform_issue_pending_invoices(_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rec record;
  outcome jsonb;
  issued integer := 0;
  pending integer := 0;
BEGIN
  PERFORM private.require_platform('billing.manage');
  FOR rec IN SELECT p.id FROM billing.payments p
              WHERE NOT EXISTS (SELECT 1 FROM billing.invoices i WHERE i.payment_id = p.id)
              ORDER BY p.paid_at LIMIT 200 LOOP
    outcome := billing.issue_invoice(rec.id);
    IF outcome ->> 'result' = 'issued' THEN issued := issued + 1; ELSE pending := pending + 1; END IF;
  END LOOP;
  PERFORM private.platform_log('finance.pending_invoices_issued', 'invoice', 'batch', NULL,
    jsonb_build_object('issued', issued, 'pending', pending), _reason);
  RETURN jsonb_build_object('issued', issued, 'pending', pending);
END $$;

-- Service role only: Stripe tax rates created once per approved rule and mode.
CREATE OR REPLACE FUNCTION public.billing_provider_tax_rate(_rule_id uuid, _provider text, _mode text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT provider_tax_rate_id FROM billing.provider_tax_rate_mappings
   WHERE tax_rule_id = _rule_id AND provider = _provider AND mode = _mode;
$$;

CREATE OR REPLACE FUNCTION public.billing_record_provider_tax_rate(_rule_id uuid, _provider text, _mode text, _rate_id text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO billing.provider_tax_rate_mappings (tax_rule_id, provider, mode, provider_tax_rate_id)
  VALUES (_rule_id, _provider, _mode, _rate_id)
  ON CONFLICT (tax_rule_id, provider, mode) DO NOTHING;
  RETURN public.billing_provider_tax_rate(_rule_id, _provider, _mode);
END $$;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.guard_invoice_series()', 'billing.allocate_document_number(uuid)', 'billing.seller_for_country(text)',
    'billing.active_series(uuid, text)', 'billing.guard_tax_rule()', 'billing.resolve_tax_rule(text, text, boolean, date)',
    'billing.inclusive_tax(bigint, integer)', 'billing.exclusive_tax(bigint, integer)', 'billing.guard_issued_document()',
    'billing.immutable_row()', 'billing.guard_payment()', 'billing.guard_refund()', 'billing.customer_snapshot(uuid)',
    'billing.seller_snapshot(billing.seller_entities)', 'billing.issue_invoice(uuid)', 'billing.complete_refund(uuid)',
    'billing.country_readiness(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.billing_record_provider_payment(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_refund_submitted(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_refund_result(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_record_document_pdf(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_provider_tax_rate(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_record_provider_tax_rate(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_record_provider_payment(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_refund_submitted(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_refund_result(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_document_pdf(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_provider_tax_rate(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_provider_tax_rate(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.billing_set_tax_id(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_documents(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_document(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_request_refund(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_refund(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_refund_for_execution(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_finance_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_save_seller_entity(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_seller_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_create_invoice_series(uuid, text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_draft_tax_rule(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_approve_tax_rule(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_retire_tax_rule(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_issue_pending_invoices(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_set_tax_id(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_documents(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_document(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_request_refund(uuid, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_decide_refund(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_refund_for_execution(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_finance_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_save_seller_entity(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_seller_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_create_invoice_series(uuid, text, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_draft_tax_rule(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_approve_tax_rule(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_retire_tax_rule(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_issue_pending_invoices(text) TO authenticated, service_role;
