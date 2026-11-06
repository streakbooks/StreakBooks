-- Files Batch 9: company-scoped, recoverable deletion and retention controls.
-- Delete becomes a tombstone. Permanent purge is a separate database-gated
-- operation which records every Storage object in a durable cleanup queue.

CREATE TABLE IF NOT EXISTS public.document_retention_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 7 AND 3650),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.document_retention_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_retention_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.document_retention_settings TO authenticated;
DROP POLICY IF EXISTS document_retention_settings_read ON public.document_retention_settings;
CREATE POLICY document_retention_settings_read ON public.document_retention_settings
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS document_retention_settings_insert ON public.document_retention_settings;
CREATE POLICY document_retention_settings_insert ON public.document_retention_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.can_access_attachment(company_id, 'company', 'manage')
  );
DROP POLICY IF EXISTS document_retention_settings_update ON public.document_retention_settings;
CREATE POLICY document_retention_settings_update ON public.document_retention_settings
  FOR UPDATE TO authenticated
  USING (public.can_access_attachment(company_id, 'company', 'manage'))
  WITH CHECK (public.can_access_attachment(company_id, 'company', 'manage'));

CREATE OR REPLACE FUNCTION public.stamp_document_retention_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Retention policy organisation cannot change';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_document_retention_settings()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_retention_settings_stamp ON public.document_retention_settings;
CREATE TRIGGER document_retention_settings_stamp
  BEFORE INSERT OR UPDATE ON public.document_retention_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_document_retention_settings();

ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS document_attachments_recycle_bin_idx
  ON public.document_attachments(company_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_attachments_retention_due_idx
  ON public.document_attachments(company_id, purge_after)
  WHERE deleted_at IS NOT NULL AND retention_hold = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='document_attachments_tombstone_consistent'
      AND conrelid='public.document_attachments'::regclass
  ) THEN
    ALTER TABLE public.document_attachments
      ADD CONSTRAINT document_attachments_tombstone_consistent CHECK (
        (deleted_at IS NULL AND deleted_by IS NULL AND purge_after IS NULL)
        OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND purge_after IS NOT NULL
            AND purge_after > deleted_at)
      );
  END IF;
END $$;

-- Prevent accidental client-side mutations of retention timestamps and
-- editing files while in the bin. Keep original evidence unchanged for restore.
CREATE OR REPLACE FUNCTION public.guard_document_attachment_recycle()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  keep_days integer;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF OLD.retention_hold THEN
      RAISE EXCEPTION 'Retention protection must be removed before moving to Recycle Bin';
    END IF;
    IF OLD.entity_type = 'company' AND EXISTS (
      SELECT 1 FROM public.document_reviews r
      WHERE r.company_id=OLD.company_id AND r.attachment_id=OLD.id
        AND r.status IN ('ready','approved')
    ) THEN
      RAISE EXCEPTION 'Return the reviewed document to Needs review before deletion';
    END IF;
    SELECT retention_days INTO keep_days FROM public.document_retention_settings
      WHERE company_id=OLD.company_id;
    NEW.deleted_at := now();
    NEW.deleted_by := auth.uid();
    NEW.purge_after := NEW.deleted_at + make_interval(days => coalesce(keep_days, 30));
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    NEW.deleted_by := NULL;
    NEW.purge_after := NULL;
  ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Recycle Bin deletion timestamp cannot be modified';
  ELSIF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.purge_after IS DISTINCT FROM OLD.purge_after THEN
    RAISE EXCEPTION 'Recycle Bin retention metadata is immutable';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND
     (to_jsonb(NEW) - 'deleted_at' - 'deleted_by' - 'purge_after' - 'retention_hold')
      IS DISTINCT FROM
     (to_jsonb(OLD) - 'deleted_at' - 'deleted_by' - 'purge_after' - 'retention_hold') THEN
    RAISE EXCEPTION 'Restore the document before editing its contents or metadata';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_document_attachment_recycle()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_document_attachment_recycle_trg ON public.document_attachments;
CREATE TRIGGER guard_document_attachment_recycle_trg
  BEFORE UPDATE ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_attachment_recycle();

-- A direct Data API DELETE cannot bypass retention. Permanent deletion is
-- available only from the SECURITY DEFINER function with a deliberate purge
-- context, and still checks company/entity permissions and the retention date.
CREATE OR REPLACE FUNCTION public.reject_uncontrolled_document_purge()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('linkbooks.document_purge', true) IS DISTINCT FROM 'allowed'
     OR current_user = 'authenticated'
     OR OLD.deleted_at IS NULL
     OR OLD.retention_hold
     OR OLD.purge_after > now() THEN
    RAISE EXCEPTION 'Document must be eligible for an authorized permanent purge';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.reject_uncontrolled_document_purge()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reject_uncontrolled_document_purge_trg ON public.document_attachments;
CREATE TRIGGER reject_uncontrolled_document_purge_trg
  BEFORE DELETE ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.reject_uncontrolled_document_purge();

-- The durable cleanup queue is written in the same database transaction as
-- permanent deletion. It stores all version paths so cleanup may be retried
-- after Storage errors or network interruption.
CREATE TABLE IF NOT EXISTS public.document_storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  original_attachment_id uuid NOT NULL,
  storage_paths text[] NOT NULL DEFAULT '{}'::text[],
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(company_id, original_attachment_id),
  CHECK (array_length(storage_paths,1) IS NULL OR array_length(storage_paths,1) <= 50)
);
ALTER TABLE public.document_storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_storage_cleanup_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.document_storage_cleanup_jobs TO authenticated;
DROP POLICY IF EXISTS document_storage_cleanup_jobs_read ON public.document_storage_cleanup_jobs;
CREATE POLICY document_storage_cleanup_jobs_read ON public.document_storage_cleanup_jobs
  FOR SELECT TO authenticated
  USING (public.can_access_attachment(company_id, 'company', 'manage'));

CREATE INDEX IF NOT EXISTS document_storage_cleanup_jobs_pending
  ON public.document_storage_cleanup_jobs(company_id, created_at)
  WHERE completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.purge_document_from_recycle_bin(
  _company_id uuid, _attachment_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  a public.document_attachments%ROWTYPE;
  objects text[];
  job_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to purge a document'; END IF;
  SELECT * INTO a FROM public.document_attachments
    WHERE company_id=_company_id AND id=_attachment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_attachment(_company_id,a.entity_type,'manage') THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  IF a.deleted_at IS NULL OR a.purge_after > now() OR a.retention_hold THEN
    RAISE EXCEPTION 'Retention period or protection prevents permanent deletion';
  END IF;
  IF a.entity_type='company' AND EXISTS (
    SELECT 1 FROM public.document_reviews r
    WHERE r.company_id=_company_id AND r.attachment_id=_attachment_id
      AND r.status IN ('ready','approved')
  ) THEN
    RAISE EXCEPTION 'Approved evidence must not be permanently purged';
  END IF;

  SELECT coalesce(array_agg(DISTINCT path), '{}'::text[]) INTO objects FROM (
    SELECT a.storage_path AS path WHERE a.storage_bucket='company-documents'
    UNION ALL
    SELECT v.storage_path AS path FROM public.document_attachment_versions v
      WHERE v.company_id=_company_id AND v.attachment_id=_attachment_id
  ) source WHERE path IS NOT NULL;
  IF coalesce(array_length(objects,1),0)>50 THEN
    RAISE EXCEPTION 'Too many Storage objects for a single cleanup request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(objects) p WHERE
    p NOT LIKE (_company_id::text || '/' || a.entity_type || '/' || a.entity_id::text || '/%')
  ) THEN
    RAISE EXCEPTION 'Historical Storage path is outside this document';
  END IF;
  INSERT INTO public.document_storage_cleanup_jobs(
    company_id, original_attachment_id, storage_paths, requested_by, completed_at
  ) VALUES (_company_id, _attachment_id, objects, auth.uid(),
            CASE WHEN cardinality(objects)=0 THEN now() ELSE NULL END)
    RETURNING id INTO job_id;

  PERFORM set_config('linkbooks.document_purge','allowed',true);
  DELETE FROM public.document_attachments
    WHERE company_id=_company_id AND id=_attachment_id;
  PERFORM set_config('linkbooks.document_purge','',true);
  RETURN job_id;
END $$;
REVOKE ALL ON FUNCTION public.purge_document_from_recycle_bin(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_document_from_recycle_bin(uuid,uuid)
  TO authenticated;

-- Mark complete only when the storage.objects catalog independently confirms
-- none of the queued objects still exist. No client can forge a completion state.
CREATE OR REPLACE FUNCTION public.finish_document_storage_cleanup(
  _company_id uuid, _job_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  job public.document_storage_cleanup_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_attachment(
    _company_id,'company','manage'
  ) THEN RAISE EXCEPTION 'Not authorized to complete Storage cleanup'; END IF;
  SELECT * INTO job FROM public.document_storage_cleanup_jobs
    WHERE company_id=_company_id AND id=_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Storage cleanup job not found'; END IF;
  IF job.completed_at IS NOT NULL THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='company-documents'
      AND o.name=ANY(job.storage_paths)
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.document_storage_cleanup_jobs
    SET completed_at=now() WHERE id=_job_id AND company_id=_company_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_document_storage_cleanup(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_document_storage_cleanup(uuid,uuid)
  TO authenticated;


-- Recycled documents cannot be changed through the review Data API. Restore
-- the attachment first; existing review events remain intact in the interim.
CREATE OR REPLACE FUNCTION public.block_recycled_document_review_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id=OLD.company_id AND a.id=OLD.attachment_id
      AND a.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Restore this document before changing its review';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_recycled_document_review_update()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS block_recycled_document_review_update_trg
  ON public.document_reviews;
CREATE TRIGGER block_recycled_document_review_update_trg
  BEFORE UPDATE ON public.document_reviews
  FOR EACH ROW EXECUTE FUNCTION public.block_recycled_document_review_update();

-- Tag associations survive the Recycle Bin so restoration is lossless, but
-- direct Data API modification of a recycled file's tags is denied.
DROP POLICY IF EXISTS document_attachment_tags_read ON public.document_attachment_tags;
CREATE POLICY document_attachment_tags_read
  ON public.document_attachment_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id=document_attachment_tags.company_id
      AND a.id=document_attachment_tags.attachment_id
      AND a.deleted_at IS NULL
      AND public.can_access_attachment(a.company_id,a.entity_type,'view')
  ));
DROP POLICY IF EXISTS document_attachment_tags_insert ON public.document_attachment_tags;
CREATE POLICY document_attachment_tags_insert
  ON public.document_attachment_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id=document_attachment_tags.company_id
      AND a.id=document_attachment_tags.attachment_id
      AND a.deleted_at IS NULL
      AND public.can_access_attachment(a.company_id,a.entity_type,'manage')
  ));
DROP POLICY IF EXISTS document_attachment_tags_delete ON public.document_attachment_tags;
CREATE POLICY document_attachment_tags_delete
  ON public.document_attachment_tags FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id=document_attachment_tags.company_id
      AND a.id=document_attachment_tags.attachment_id
      AND a.deleted_at IS NULL
      AND public.can_access_attachment(a.company_id,a.entity_type,'manage')
  ));
