-- Customer and supplier portals.
-- Portal users are NOT company members. They cannot read the ledger, the chart, or other
-- contacts. Every portal read is a security-definer function that checks one active membership.
-- Online payments allocate accounts receivable only by calling public.record_customer_receipt
-- as the organisation's nominated settlement member (the same impersonation pattern as
-- scheduled journals). Supplier documents become draft or awaiting-approval bills and are
-- not posted here.
-- Additive. Do not apply to production without approval.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portal_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  settlement_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  settlement_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fee_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  default_purchase_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  allow_sandbox BOOLEAN NOT NULL DEFAULT false,
  require_mfa BOOLEAN NOT NULL DEFAULT false,
  invite_days INTEGER NOT NULL DEFAULT 14 CHECK (invite_days BETWEEN 1 AND 90),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portal_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  portal_role TEXT NOT NULL CHECK (portal_role IN ('customer', 'supplier')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
  mfa_required BOOLEAN NOT NULL DEFAULT false,
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portal_memberships_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_memberships_open_uidx
  ON public.portal_memberships (company_id, contact_id, portal_role)
  WHERE status IN ('invited', 'active');

CREATE INDEX IF NOT EXISTS portal_memberships_user_idx
  ON public.portal_memberships (user_id) WHERE user_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS portal_memberships_token_idx
  ON public.portal_memberships (invite_token_hash) WHERE invite_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('staff', 'customer', 'supplier')),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  invoice_id UUID REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  submission_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_messages_contact_idx
  ON public.portal_messages (company_id, contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.portal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_notifications_contact_idx
  ON public.portal_notifications (company_id, contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.portal_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_role TEXT NOT NULL CHECK (uploader_role IN ('staff', 'customer', 'supplier')),
  category TEXT NOT NULL CHECK (category IN ('general', 'tax', 'supporting', 'invoice_query')),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5000000),
  content BYTEA NOT NULL,
  submission_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portal_files_size CHECK (octet_length(content) = byte_size AND octet_length(content) <= 5000000)
);

CREATE INDEX IF NOT EXISTS portal_files_contact_idx
  ON public.portal_files (company_id, contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.portal_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE RESTRICT,
  membership_id UUID NOT NULL REFERENCES public.portal_memberships(id) ON DELETE RESTRICT,
  payer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'requires_action', 'processing', 'sandbox_confirmed', 'succeeded',
    'captured_unposted', 'failed', 'refunded', 'refund_pending', 'disputed', 'cancelled'
  )),
  provider TEXT CHECK (provider IN ('stripe', 'razorpay', 'linkbooks_sandbox')),
  provider_session_id TEXT,
  provider_payment_id TEXT,
  idempotency_key TEXT NOT NULL,
  receipt_id UUID REFERENCES public.sales_receipts(id) ON DELETE SET NULL,
  fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  fee_journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS portal_payment_intents_invoice_idx
  ON public.portal_payment_intents (invoice_id, status);

CREATE TABLE IF NOT EXISTS public.portal_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES public.portal_payment_intents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.portal_staff_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  intent_id UUID REFERENCES public.portal_payment_intents(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS portal_staff_alerts_open_idx
  ON public.portal_staff_alerts (company_id, created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.portal_supplier_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  membership_id UUID NOT NULL REFERENCES public.portal_memberships(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('bill', 'credit_note')),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'approved', 'rejected', 'withdrawn')),
  supplier_reference TEXT NOT NULL CHECK (length(btrim(supplier_reference)) BETWEEN 1 AND 80),
  document_date DATE NOT NULL,
  due_date DATE,
  currency_code CHAR(3) NOT NULL,
  lines JSONB NOT NULL,
  memo TEXT,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor BIGINT NOT NULL CHECK (tax_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  bill_id UUID REFERENCES public.purchase_bills(id) ON DELETE SET NULL,
  credit_note_id UUID REFERENCES public.purchase_credit_notes(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portal_submissions_total CHECK (total_minor = subtotal_minor + tax_minor)
);

CREATE INDEX IF NOT EXISTS portal_submissions_company_idx
  ON public.portal_supplier_submissions (company_id, status, created_at DESC);

ALTER TABLE public.portal_messages
  DROP CONSTRAINT IF EXISTS portal_messages_submission_fk;
ALTER TABLE public.portal_messages
  ADD CONSTRAINT portal_messages_submission_fk
  FOREIGN KEY (submission_id) REFERENCES public.portal_supplier_submissions(id) ON DELETE SET NULL;

ALTER TABLE public.portal_files
  DROP CONSTRAINT IF EXISTS portal_files_submission_fk;
ALTER TABLE public.portal_files
  ADD CONSTRAINT portal_files_submission_fk
  FOREIGN KEY (submission_id) REFERENCES public.portal_supplier_submissions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.portal_po_acknowledgements (
  order_id UUID PRIMARY KEY REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.portal_memberships(id) ON DELETE RESTRICT,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_acknowledged_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.portal_bank_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.portal_memberships(id) ON DELETE RESTRICT,
  account_name TEXT NOT NULL CHECK (length(btrim(account_name)) BETWEEN 2 AND 120),
  bank_name TEXT NOT NULL CHECK (length(btrim(bank_name)) BETWEEN 2 AND 120),
  account_number TEXT NOT NULL CHECK (length(btrim(account_number)) BETWEEN 4 AND 40),
  routing_code TEXT CHECK (routing_code IS NULL OR length(btrim(routing_code)) BETWEEN 4 AND 40),
  country_code CHAR(2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_bank_change_open_uidx
  ON public.portal_bank_change_requests (company_id, contact_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.contact_payment_details (
  contact_id UUID PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  routing_code TEXT,
  country_code CHAR(2) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.portal_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  sent_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, sent_on)
);

CREATE TABLE IF NOT EXISTS public.portal_rate_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_rate_events_bucket_idx
  ON public.portal_rate_events (bucket, created_at DESC);

-- Deny direct table access. Portal and staff clients use the functions below.
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_staff_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_supplier_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_po_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_bank_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_rate_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.portal_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_files FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_payment_intents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_payment_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_staff_alerts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_supplier_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_po_acknowledgements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_bank_change_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.contact_payment_details FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_reminder_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.portal_rate_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.portal_settings TO service_role;
GRANT ALL ON public.portal_memberships TO service_role;
GRANT ALL ON public.portal_messages TO service_role;
GRANT ALL ON public.portal_notifications TO service_role;
GRANT ALL ON public.portal_files TO service_role;
GRANT ALL ON public.portal_payment_intents TO service_role;
GRANT ALL ON public.portal_payment_events TO service_role;
GRANT ALL ON public.portal_staff_alerts TO service_role;
GRANT ALL ON public.portal_supplier_submissions TO service_role;
GRANT ALL ON public.portal_po_acknowledgements TO service_role;
GRANT ALL ON public.portal_bank_change_requests TO service_role;
GRANT ALL ON public.contact_payment_details TO service_role;
GRANT ALL ON public.portal_reminder_log TO service_role;
GRANT ALL ON public.portal_rate_events TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_enabled(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT enabled FROM public.organisation_features
    WHERE company_id = _company_id AND feature_key = 'portals'
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.portal_session_aal()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    NULLIF(current_setting('request.jwt.claim.aal', true), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.portal_jwt_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(btrim(COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    ''
  )));
$$;

CREATE OR REPLACE FUNCTION public.portal_assert_writable(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_tenant_controls
    WHERE company_id = _company_id AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'This business is read-only. Contact platform support.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.plan_version_limits l
    JOIN public.company_subscriptions s ON s.price_version_id = l.version_id
    WHERE s.company_id = _company_id AND l.feature_key = 'portals' AND NOT l.enabled
  ) THEN
    RAISE EXCEPTION 'Portals are not included in this subscription' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_rate_limit(_bucket TEXT, _max INTEGER, _window INTERVAL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n INTEGER;
BEGIN
  DELETE FROM public.portal_rate_events
  WHERE bucket = _bucket AND created_at < now() - _window;
  SELECT count(*) INTO _n FROM public.portal_rate_events
  WHERE bucket = _bucket AND created_at >= now() - _window;
  IF _n >= _max THEN
    RAISE EXCEPTION 'Too many attempts. Wait a few minutes and try again.';
  END IF;
  INSERT INTO public.portal_rate_events (bucket) VALUES (_bucket);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_audit(
  _company_id UUID, _actor UUID, _action TEXT, _entity_type TEXT, _entity_id UUID, _details JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    _company_id, _actor, left(_action, 80), left(_entity_type, 40), _entity_id,
    COALESCE(_details, '{}'::jsonb) - 'password' - 'token' - 'secret' - 'account_number'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_notify(
  _company_id UUID, _contact_id UUID, _title TEXT, _body TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.portal_notifications (company_id, contact_id, title, body)
  VALUES (_company_id, _contact_id, left(_title, 160), left(_body, 2000));
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_require_member(_membership_id UUID)
RETURNS public.portal_memberships
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _m FROM public.portal_memberships WHERE id = _membership_id;
  IF NOT FOUND OR _m.user_id IS DISTINCT FROM auth.uid() OR _m.status <> 'active' THEN
    RAISE EXCEPTION 'You do not have access to that portal';
  END IF;
  IF NOT public.portal_enabled(_m.company_id) THEN
    RAISE EXCEPTION 'This organisation has not turned the portal on';
  END IF;
  PERFORM public.portal_assert_writable(_m.company_id);
  IF _m.mfa_required AND COALESCE(public.portal_session_aal(), '') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'This portal requires an authenticator. Open Security and finish the second step.';
  END IF;
  RETURN _m;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_company_today(_company_id UUID)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz TEXT;
BEGIN
  SELECT timezone INTO _tz FROM public.companies WHERE id = _company_id;
  BEGIN
    RETURN (now() AT TIME ZONE COALESCE(_tz, 'UTC'))::DATE;
  EXCEPTION WHEN OTHERS THEN
    RETURN CURRENT_DATE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_mask_account(_number TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _number IS NULL OR length(btrim(_number)) <= 4 THEN '••••'
    ELSE repeat('•', greatest(length(btrim(_number)) - 4, 4)) || right(btrim(_number), 4)
  END;
$$;

CREATE OR REPLACE FUNCTION public.portal_line_amounts(_quantity NUMERIC, _unit BIGINT, _bps INTEGER)
RETURNS TABLE (net_minor BIGINT, tax_minor BIGINT)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _qty_scaled BIGINT;
  _net BIGINT;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF _unit IS NULL OR _unit < 0 THEN RAISE EXCEPTION 'Unit price cannot be negative'; END IF;
  IF _bps IS NULL OR _bps < 0 OR _bps > 10000 THEN RAISE EXCEPTION 'Tax rate must be 0–10000 basis points'; END IF;
  _qty_scaled := round(_quantity * 1000000)::BIGINT;
  _net := (_unit * _qty_scaled) / 1000000;
  net_minor := _net;
  tax_minor := (_net * _bps + 5000) / 10000;
  RETURN NEXT;
END;
$$;

-- Hold statuses must match PORTAL_BALANCE_HOLD_STATUSES in src/lib/portals/payment-rules.ts.
CREATE OR REPLACE FUNCTION public.portal_invoice_hold(_invoice_id UUID, _except UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(amount_minor), 0)
  FROM public.portal_payment_intents
  WHERE invoice_id = _invoice_id
    AND id IS DISTINCT FROM _except
    AND status IN ('requires_action', 'processing', 'sandbox_confirmed', 'captured_unposted');
$$;

REVOKE ALL ON FUNCTION public.portal_enabled(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_session_aal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_jwt_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_assert_writable(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_rate_limit(TEXT, INTEGER, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_audit(UUID, UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_notify(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_require_member(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_company_today(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_mask_account(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_line_amounts(NUMERIC, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_invoice_hold(UUID, UUID) FROM PUBLIC, anon, authenticated;
