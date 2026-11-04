-- Additive review workflow for uploaded company files.
-- This is a DOCUMENT REVIEW, not a ledger authorisation or automated posting path.
-- No external OCR/email provider is presumed to be connected.
CREATE UNIQUE INDEX IF NOT EXISTS document_attachments_company_id_unique
  ON public.document_attachments(company_id, id);

CREATE TABLE IF NOT EXISTS public.document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'ready', 'approved', 'rejected', 'archived')),
  document_type text NOT NULL DEFAULT 'unclassified'
    CHECK (document_type IN ('unclassified', 'receipt', 'bill', 'invoice', 'statement', 'contract', 'other')),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 120),
  supplier_name text CHECK (supplier_name IS NULL OR char_length(supplier_name) <= 160),
  document_date date,
  currency_code text CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  total_minor bigint CHECK (total_minor IS NULL OR total_minor >= 0),
  note text CHECK (note IS NULL OR char_length(note) <= 3000),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_reviews_same_company FOREIGN KEY (company_id, attachment_id)
    REFERENCES public.document_attachments(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_reviews_queue_idx
  ON public.document_reviews(company_id, status, updated_at DESC, id DESC);

ALTER TABLE public.document_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_reviews FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.document_reviews TO authenticated;

DROP POLICY IF EXISTS document_reviews_read ON public.document_reviews;
CREATE POLICY document_reviews_read ON public.document_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_reviews.company_id
      AND a.id = document_reviews.attachment_id
      AND a.entity_type = 'company'
      AND public.can_access_attachment(a.company_id, a.entity_type, 'view')
  ));
DROP POLICY IF EXISTS document_reviews_manage ON public.document_reviews;
CREATE POLICY document_reviews_manage ON public.document_reviews FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_reviews.company_id
      AND a.id = document_reviews.attachment_id
      AND a.entity_type = 'company'
      AND public.can_access_attachment(a.company_id, a.entity_type, 'manage')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_reviews.company_id
      AND a.id = document_reviews.attachment_id
      AND a.entity_type = 'company'
      AND public.can_access_attachment(a.company_id, a.entity_type, 'manage')
  ));

-- Database-level transition enforcement: a direct Data API call cannot forge a review approval.
CREATE OR REPLACE FUNCTION public.stamp_document_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.attachment_id IS DISTINCT FROM OLD.attachment_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'Review identity or version cannot be modified';
    END IF;
    IF (NEW.status = 'approved' OR OLD.status = 'approved')
      AND NOT (
        public.has_company_permission(NEW.company_id, 'purchases.authorise')
        OR public.has_company_permission(NEW.company_id, 'sales.authorise')
      ) THEN
      RAISE EXCEPTION 'Document review approval requires authorisation permission';
    END IF;
    IF NEW.status = 'approved' AND OLD.status NOT IN ('ready', 'approved') THEN
      RAISE EXCEPTION 'Only a ready document can be approved';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  IF NEW.status IN ('ready', 'approved') AND NEW.document_type = 'unclassified' THEN
    RAISE EXCEPTION 'Classify the document before review approval';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF NEW.status = 'approved' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_document_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_reviews_stamp ON public.document_reviews;
CREATE TRIGGER document_reviews_stamp BEFORE UPDATE ON public.document_reviews
  FOR EACH ROW EXECUTE FUNCTION public.stamp_document_review();

CREATE TABLE IF NOT EXISTS public.document_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.document_reviews(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  old_type text,
  new_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_review_events_history
  ON public.document_review_events(company_id, review_id, created_at DESC);
ALTER TABLE public.document_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_review_events FROM PUBLIC, anon;
GRANT SELECT ON public.document_review_events TO authenticated;
DROP POLICY IF EXISTS document_review_events_read ON public.document_review_events;
CREATE POLICY document_review_events_read ON public.document_review_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_reviews r
    WHERE r.company_id = document_review_events.company_id
      AND r.id = document_review_events.review_id
  ));

-- Write-once history, attributed to the authenticated actor.
CREATE OR REPLACE FUNCTION public.audit_document_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.document_review_events
      (company_id, review_id, old_status, new_status, old_type, new_type, actor_user_id)
    VALUES (NEW.company_id, NEW.id, NULL, NEW.status, NULL, NEW.document_type, auth.uid());
  ELSIF ROW(NEW.status, NEW.document_type, NEW.reference, NEW.supplier_name,
           NEW.document_date, NEW.currency_code, NEW.total_minor, NEW.note)
       IS DISTINCT FROM
       ROW(OLD.status, OLD.document_type, OLD.reference, OLD.supplier_name,
           OLD.document_date, OLD.currency_code, OLD.total_minor, OLD.note) THEN
    INSERT INTO public.document_review_events
      (company_id, review_id, old_status, new_status, old_type, new_type, actor_user_id)
    VALUES (
      NEW.company_id, NEW.id, OLD.status, NEW.status,
      OLD.document_type, NEW.document_type, auth.uid()
    );
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_document_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_reviews_audit ON public.document_reviews;
CREATE TRIGGER document_reviews_audit AFTER INSERT OR UPDATE ON public.document_reviews
  FOR EACH ROW EXECUTE FUNCTION public.audit_document_review();

-- The inbox is made from real private uploaded attachments; backfill only company-level uploads.
INSERT INTO public.document_reviews (company_id, attachment_id, created_by, updated_by)
SELECT a.company_id, a.id, a.uploaded_by, a.uploaded_by
FROM public.document_attachments a
WHERE a.entity_type = 'company'
ON CONFLICT (attachment_id) DO NOTHING;

-- Auto-enqueue new company-level uploads; leave existing invoice/bill attachments alone.
CREATE OR REPLACE FUNCTION public.enqueue_uploaded_document_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.entity_type = 'company' THEN
    INSERT INTO public.document_reviews(company_id, attachment_id, created_by, updated_by)
    VALUES (NEW.company_id, NEW.id, NEW.uploaded_by, NEW.uploaded_by)
    ON CONFLICT (attachment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_uploaded_document_review() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_review_enqueue ON public.document_attachments;
CREATE TRIGGER document_review_enqueue AFTER INSERT ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_uploaded_document_review();
