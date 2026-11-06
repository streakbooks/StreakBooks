-- Files Batch 5: opt-in, company-scoped inbound email inboxes.
-- Only a receiving alias is stored. Provider keys remain in the SERVER environment.
-- Existing billing, outbound email and HostGator MX settings are unchanged.

CREATE TABLE IF NOT EXISTS public.document_email_inboxes (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  local_token text NOT NULL UNIQUE
    DEFAULT ('docs-' || replace(gen_random_uuid()::text, '-', '')),
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_email_inboxes_token_format
    CHECK (local_token ~ '^docs-[0-9a-f]{32}$')
);

ALTER TABLE public.document_email_inboxes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_email_inboxes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.document_email_inboxes TO authenticated;

DROP POLICY IF EXISTS document_email_inboxes_read ON public.document_email_inboxes;
CREATE POLICY document_email_inboxes_read ON public.document_email_inboxes
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS document_email_inboxes_insert ON public.document_email_inboxes;
CREATE POLICY document_email_inboxes_insert ON public.document_email_inboxes
  FOR INSERT TO authenticated WITH CHECK (
    public.can_access_attachment(company_id, 'company', 'manage')
  );

DROP POLICY IF EXISTS document_email_inboxes_update ON public.document_email_inboxes;
CREATE POLICY document_email_inboxes_update ON public.document_email_inboxes
  FOR UPDATE TO authenticated
  USING (public.can_access_attachment(company_id, 'company', 'manage'))
  WITH CHECK (public.can_access_attachment(company_id, 'company', 'manage'));

-- Ignore any client-supplied token. Alias identity cannot be reassigned later.
CREATE OR REPLACE FUNCTION public.guard_document_email_inbox()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.local_token := 'docs-' || replace(gen_random_uuid()::text, '-', '');
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.local_token IS DISTINCT FROM OLD.local_token
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Inbox identity is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.guard_document_email_inbox() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_email_inboxes_guard ON public.document_email_inboxes;
CREATE TRIGGER document_email_inboxes_guard
  BEFORE INSERT OR UPDATE ON public.document_email_inboxes
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_email_inbox();

-- Inbound provider identifiers allow idempotent manual importing of attachments.
-- These columns are advisory provenance; they never grant access or post to the ledger.
ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS inbox_email_id uuid,
  ADD COLUMN IF NOT EXISTS inbox_attachment_id text,
  ADD COLUMN IF NOT EXISTS inbox_sender text,
  ADD COLUMN IF NOT EXISTS inbox_received_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS document_attachments_inbox_import_unique
  ON public.document_attachments(company_id, inbox_email_id, inbox_attachment_id)
  WHERE inbox_email_id IS NOT NULL AND inbox_attachment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_attachments_inbox_message_idx
  ON public.document_attachments(company_id, inbox_email_id)
  WHERE inbox_email_id IS NOT NULL;

-- Prevent partially-specified identifiers even via direct Data API calls.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'document_attachments_inbox_source_pair'
       AND conrelid = 'public.document_attachments'::regclass
  ) THEN
    ALTER TABLE public.document_attachments
      ADD CONSTRAINT document_attachments_inbox_source_pair CHECK (
        (inbox_email_id IS NULL AND inbox_attachment_id IS NULL)
        OR (inbox_email_id IS NOT NULL AND inbox_attachment_id IS NOT NULL
            AND char_length(inbox_attachment_id) BETWEEN 1 AND 128)
      );
  END IF;
END
$$;

-- No anon grants, no service-role bypass, no public Storage bucket, no new ledger postings.
