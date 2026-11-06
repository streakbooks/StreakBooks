-- Files Batch 8: immutable document versions.
-- Stores version metadata separately, never overwrites a private Storage object.
-- Version 1 is captured when the first replacement is committed. Existing files
-- remain valid, with current_version=1, without a large backfill.

ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_attachments_current_version_check'
      AND conrelid = 'public.document_attachments'::regclass
  ) THEN
    ALTER TABLE public.document_attachments
      ADD CONSTRAINT document_attachments_current_version_check
      CHECK (current_version BETWEEN 1 AND 50);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.document_attachment_versions (
  company_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 50),
  storage_bucket text NOT NULL DEFAULT 'company-documents'
    CHECK (storage_bucket = 'company-documents'),
  storage_path text NOT NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  content_type text,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, attachment_id, version),
  CONSTRAINT document_attachment_versions_parent_same_company
    FOREIGN KEY (company_id, attachment_id)
    REFERENCES public.document_attachments(company_id, id) ON DELETE CASCADE,
  CONSTRAINT document_attachment_versions_unique_storage_path UNIQUE(storage_path)
);

CREATE INDEX IF NOT EXISTS document_attachment_versions_history
  ON public.document_attachment_versions(company_id, attachment_id, version DESC);

ALTER TABLE public.document_attachment_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_attachment_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.document_attachment_versions TO authenticated;

DROP POLICY IF EXISTS document_attachment_versions_read ON public.document_attachment_versions;
CREATE POLICY document_attachment_versions_read
  ON public.document_attachment_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_attachment_versions.company_id
      AND a.id = document_attachment_versions.attachment_id
      AND public.can_access_attachment(a.company_id, a.entity_type, 'view')
  ));

-- Block direct Data API edits that would silently replace the current file or
-- increment its version without recording immutable history.
CREATE OR REPLACE FUNCTION public.guard_document_attachment_version_swap()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (
    NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
    OR NEW.content_type IS DISTINCT FROM OLD.content_type
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.content_base64 IS DISTINCT FROM OLD.content_base64
    OR NEW.current_version IS DISTINCT FROM OLD.current_version
  ) AND current_setting('linkbooks.document_version_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Document bytes and version may only change via version history';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_document_attachment_version_swap()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_document_attachment_version_swap_trg ON public.document_attachments;
CREATE TRIGGER guard_document_attachment_version_swap_trg
  BEFORE UPDATE OF storage_path, storage_bucket, content_type, size_bytes,
                   content_base64, current_version
  ON public.document_attachments FOR EACH ROW
  EXECUTE FUNCTION public.guard_document_attachment_version_swap();

-- SECURITY DEFINER is limited by an explicit signed-in user, scoped document
-- manage permission, Storage owner, company/record path, and optimistic version.
-- The SQL transaction locks the attachment while inserting snapshots + swapping
-- the current pointer. No arbitrary Storage path may be referenced.
CREATE OR REPLACE FUNCTION public.commit_document_attachment_version(
  _company_id uuid,
  _attachment_id uuid,
  _expected_version integer,
  _new_storage_path text,
  _new_size_bytes bigint,
  _new_content_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  old_file public.document_attachments%ROWTYPE;
  actual_size bigint;
  actual_mime text;
  next_version integer;
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL OR _attachment_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to update document versions';
  END IF;
  SELECT * INTO old_file FROM public.document_attachments
   WHERE company_id=_company_id AND id=_attachment_id FOR UPDATE;
  IF NOT FOUND OR
     NOT public.can_access_attachment(_company_id, old_file.entity_type, 'manage') THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  IF old_file.storage_bucket IS DISTINCT FROM 'company-documents'
     OR old_file.storage_path IS NULL OR old_file.content_base64 IS NOT NULL THEN
    RAISE EXCEPTION 'Version history requires a private Storage-backed attachment';
  END IF;
  IF old_file.current_version IS DISTINCT FROM _expected_version THEN
    RAISE EXCEPTION 'This document was updated. Refresh before uploading another version';
  END IF;
  IF old_file.current_version >= 50 THEN
    RAISE EXCEPTION 'This document has reached the 50-version limit';
  END IF;
  IF _new_storage_path IS NULL
     OR _new_storage_path !~ ('^' || _company_id::text || '/' || old_file.entity_type ||
       '/' || old_file.entity_id::text || '/[0-9a-fA-F-]{36}-[^/]+$')
     OR _new_storage_path = old_file.storage_path THEN
    RAISE EXCEPTION 'Invalid replacement Storage path';
  END IF;
  IF _new_size_bytes IS NULL OR _new_size_bytes < 1 OR _new_size_bytes > 20971520
     OR _new_content_type IS NULL OR char_length(_new_content_type) > 120 THEN
    RAISE EXCEPTION 'Invalid replacement metadata';
  END IF;

  -- User-owned upload must exist already; never adopt another user's file.
  SELECT (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
    INTO actual_size, actual_mime
    FROM storage.objects o
   WHERE o.bucket_id='company-documents'
     AND o.name=_new_storage_path
     AND o.owner_id=auth.uid()::text;
  IF actual_size IS NULL OR actual_size IS DISTINCT FROM _new_size_bytes
     OR lower(coalesce(actual_mime,'')) IS DISTINCT FROM lower(_new_content_type) THEN
    RAISE EXCEPTION 'Uploaded replacement is missing, unowned or inconsistent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.document_attachment_versions
    WHERE storage_path=_new_storage_path
  ) THEN
    RAISE EXCEPTION 'Replacement object is already used in version history';
  END IF;

  -- The original becomes immutable version 1 on first replacement.
  IF old_file.current_version=1 THEN
    INSERT INTO public.document_attachment_versions(
      company_id, attachment_id, version, storage_bucket, storage_path,
      file_name, content_type, size_bytes, uploaded_by, created_at
    ) VALUES(
      _company_id, _attachment_id, 1, old_file.storage_bucket, old_file.storage_path,
      old_file.file_name, old_file.content_type, old_file.size_bytes,
      old_file.uploaded_by, old_file.created_at
    );
  END IF;

  next_version := old_file.current_version + 1;
  INSERT INTO public.document_attachment_versions(
    company_id, attachment_id, version, storage_bucket, storage_path,
    file_name, content_type, size_bytes, uploaded_by
  ) VALUES (
    _company_id, _attachment_id, next_version, 'company-documents', _new_storage_path,
    old_file.file_name, _new_content_type, _new_size_bytes, auth.uid()
  );

  -- Only this transaction can set the current version pointer.
  PERFORM set_config('linkbooks.document_version_write', 'allowed', true);
  UPDATE public.document_attachments
     SET storage_path=_new_storage_path, storage_bucket='company-documents',
         size_bytes=_new_size_bytes, content_type=_new_content_type,
         uploaded_by=auth.uid(), current_version=next_version
   WHERE company_id=_company_id AND id=_attachment_id;
  PERFORM set_config('linkbooks.document_version_write', '', true);
  RETURN next_version;
END $$;

REVOKE ALL ON FUNCTION public.commit_document_attachment_version(
  uuid,uuid,integer,text,bigint,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_document_attachment_version(
  uuid,uuid,integer,text,bigint,text
) TO authenticated;
