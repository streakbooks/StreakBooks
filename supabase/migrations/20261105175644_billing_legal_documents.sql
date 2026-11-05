-- Billing platform, phase 4a: versioned legal documents and recorded acceptances.
-- No legal wording is seeded. Documents are written by platform staff, carry
-- requires_legal_review until a second platform owner approves them, and are immutable once
-- they leave draft. Additive and idempotent.

CREATE TABLE IF NOT EXISTS billing.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'REFUND_POLICY', 'CANCELLATION_POLICY',
    'RECURRING_PAYMENT_AUTHORISATION', 'PARTNER_TERMS', 'PARTNER_DISCLOSURE')),
  locale text NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  version integer NOT NULL CHECK (version >= 1),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 20 AND 200000),
  body_sha256 text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'retired')),
  requires_legal_review boolean NOT NULL DEFAULT true,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, locale, version),
  CONSTRAINT legal_documents_published_reviewed CHECK (status NOT IN ('approved', 'published') OR NOT requires_legal_review)
);
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_one_published
  ON billing.legal_documents (kind, locale) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS billing.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing.legal_documents(id),
  kind text NOT NULL,
  version integer NOT NULL,
  user_id uuid NOT NULL,
  company_id uuid,
  billing_account_id uuid,
  context text NOT NULL CHECK (context IN ('signup', 'checkout', 'cancellation', 'partner')),
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON billing.legal_acceptances (user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS legal_acceptances_company_idx ON billing.legal_acceptances (company_id, accepted_at DESC);

ALTER TABLE billing.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing.legal_documents, billing.legal_acceptances FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON billing.legal_documents, billing.legal_acceptances FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION billing.guard_legal_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft documents can be deleted' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  NEW.body_sha256 := encode(extensions.digest(convert_to(NEW.body, 'UTF8'), 'sha256'), 'hex');
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'draft' AND (NEW.kind, NEW.locale, NEW.version, NEW.title, NEW.body)
       IS DISTINCT FROM (OLD.kind, OLD.locale, OLD.version, OLD.title, OLD.body) THEN
      RAISE EXCEPTION 'A reviewed document cannot change; draft a new version' USING ERRCODE = '55000';
    END IF;
    IF NOT ((OLD.status = NEW.status)
         OR (OLD.status = 'draft' AND NEW.status IN ('approved', 'retired'))
         OR (OLD.status = 'approved' AND NEW.status IN ('published', 'retired'))
         OR (OLD.status = 'published' AND NEW.status = 'retired')) THEN
      RAISE EXCEPTION 'Invalid document status change % -> %', OLD.status, NEW.status USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS legal_documents_guard ON billing.legal_documents;
CREATE TRIGGER legal_documents_guard BEFORE INSERT OR UPDATE OR DELETE ON billing.legal_documents
  FOR EACH ROW EXECUTE FUNCTION billing.guard_legal_document();

CREATE OR REPLACE FUNCTION billing.immutable_legal_acceptance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Legal acceptances are append-only' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS legal_acceptances_immutable ON billing.legal_acceptances;
CREATE TRIGGER legal_acceptances_immutable BEFORE UPDATE OR DELETE ON billing.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION billing.immutable_legal_acceptance();

CREATE OR REPLACE FUNCTION billing.legal_document_json(d billing.legal_documents, _with_body boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', d.id, 'kind', d.kind, 'locale', d.locale, 'version', d.version, 'title', d.title,
    'status', d.status, 'requiresLegalReview', d.requires_legal_review, 'bodySha256', d.body_sha256,
    'createdBy', d.created_by, 'approvedBy', d.approved_by, 'approvedAt', d.approved_at,
    'publishedAt', d.published_at, 'createdAt', d.created_at)
    || CASE WHEN _with_body THEN jsonb_build_object('body', d.body) ELSE '{}'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION billing.published_legal_document(_kind text, _locale text DEFAULT 'en')
RETURNS billing.legal_documents LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT d.* FROM billing.legal_documents d
   WHERE d.kind = _kind AND d.status = 'published' AND d.locale IN (_locale, 'en')
   ORDER BY (d.locale = _locale) DESC
   LIMIT 1;
$$;

-- Published documents are public.
CREATE OR REPLACE FUNCTION public.billing_published_legal_documents(_kinds text[] DEFAULT NULL, _locale text DEFAULT 'en')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(billing.legal_document_json(d, true) ORDER BY d.kind), '[]'::jsonb)
    FROM (
      SELECT DISTINCT ON (x.kind) x.* FROM billing.legal_documents x
       WHERE x.status = 'published' AND x.locale IN (coalesce(_locale, 'en'), 'en')
         AND (_kinds IS NULL OR x.kind = ANY (_kinds))
       ORDER BY x.kind, (x.locale = coalesce(_locale, 'en')) DESC
    ) d;
$$;

CREATE OR REPLACE FUNCTION public.platform_legal_documents() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN coalesce((SELECT jsonb_agg(billing.legal_document_json(d, true) ORDER BY d.kind, d.locale, d.version DESC)
    FROM billing.legal_documents d), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.platform_draft_legal_document(
  _kind text, _locale text, _title text, _body text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  doc billing.legal_documents%ROWTYPE;
  loc text := coalesce(nullif(btrim(_locale), ''), 'en');
BEGIN
  PERFORM private.require_platform('billing.manage');
  PERFORM pg_advisory_xact_lock(hashtext('billing.legal_documents'));
  INSERT INTO billing.legal_documents (kind, locale, version, title, body, created_by)
  SELECT _kind, loc, coalesce(max(d.version), 0) + 1, btrim(_title), _body, auth.uid()
    FROM billing.legal_documents d WHERE d.kind = _kind AND d.locale = loc
  RETURNING * INTO doc;
  PERFORM private.platform_log('legal.drafted', 'legal_document', doc.id::text, NULL,
    jsonb_build_object('kind', doc.kind, 'locale', doc.locale, 'version', doc.version, 'bodySha256', doc.body_sha256), _reason);
  RETURN billing.legal_document_json(doc, false);
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Choose a document type and enter a title (3-200 characters) and text (at least 20 characters)'
      USING ERRCODE = '22023';
END $$;

-- Approval records that the text has had legal review. The author cannot approve their own text.
CREATE OR REPLACE FUNCTION public.platform_approve_legal_document(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  doc billing.legal_documents%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can approve legal documents' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO doc FROM billing.legal_documents WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR doc.status <> 'draft' THEN
    RAISE EXCEPTION 'Choose a draft document' USING ERRCODE = '22023';
  END IF;
  IF doc.created_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Another platform owner must approve text you drafted' USING ERRCODE = '42501';
  END IF;
  UPDATE billing.legal_documents
     SET status = 'approved', requires_legal_review = false, approved_by = auth.uid(), approved_at = now()
   WHERE id = _id RETURNING * INTO doc;
  PERFORM private.platform_log('legal.approved', 'legal_document', doc.id::text,
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'approved', 'bodySha256', doc.body_sha256), _reason);
  RETURN billing.legal_document_json(doc, false);
END $$;

CREATE OR REPLACE FUNCTION public.platform_publish_legal_document(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  doc billing.legal_documents%ROWTYPE;
  previous uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can publish legal documents' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO doc FROM billing.legal_documents WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR doc.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved document can be published' USING ERRCODE = '22023';
  END IF;
  UPDATE billing.legal_documents SET status = 'retired', retired_at = now()
   WHERE kind = doc.kind AND locale = doc.locale AND status = 'published'
  RETURNING id INTO previous;
  UPDATE billing.legal_documents SET status = 'published', published_at = now() WHERE id = _id RETURNING * INTO doc;
  PERFORM private.platform_log('legal.published', 'legal_document', doc.id::text,
    CASE WHEN previous IS NULL THEN NULL ELSE jsonb_build_object('retired', previous) END,
    jsonb_build_object('kind', doc.kind, 'locale', doc.locale, 'version', doc.version), _reason);
  RETURN billing.legal_document_json(doc, false);
END $$;

CREATE OR REPLACE FUNCTION public.platform_retire_legal_document(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  doc billing.legal_documents%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  UPDATE billing.legal_documents SET status = 'retired', retired_at = now()
   WHERE id = _id AND status IN ('draft', 'approved', 'published') RETURNING * INTO doc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a current document' USING ERRCODE = '22023';
  END IF;
  PERFORM private.platform_log('legal.retired', 'legal_document', doc.id::text, NULL,
    jsonb_build_object('kind', doc.kind, 'version', doc.version), _reason);
  RETURN billing.legal_document_json(doc, false);
END $$;

-- Records that the signed-in user accepted a published document. The server passes a keyed hash
-- of the client address (never the address itself).
CREATE OR REPLACE FUNCTION public.billing_record_legal_acceptance(
  _document_id uuid, _company_id uuid, _context text, _ip_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  doc billing.legal_documents%ROWTYPE;
  rid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO doc FROM billing.legal_documents WHERE id = _document_id AND status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That document is not the current published version' USING ERRCODE = '40001';
  END IF;
  IF _company_id IS NOT NULL AND NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  INSERT INTO billing.legal_acceptances (document_id, kind, version, user_id, company_id, billing_account_id, context, ip_hash)
  VALUES (doc.id, doc.kind, doc.version, auth.uid(), _company_id,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    _context, _ip_hash)
  RETURNING id INTO rid;
  RETURN rid;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.guard_legal_document()', 'billing.immutable_legal_acceptance()',
    'billing.legal_document_json(billing.legal_documents, boolean)', 'billing.published_legal_document(text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.platform_legal_documents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_draft_legal_document(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_approve_legal_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_publish_legal_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_retire_legal_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_record_legal_acceptance(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_legal_documents() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_draft_legal_document(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_approve_legal_document(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_publish_legal_document(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_retire_legal_document(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_legal_acceptance(uuid, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_published_legal_documents(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_published_legal_documents(text[], text) TO anon, authenticated, service_role;
