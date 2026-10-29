-- Additive document folders. Existing document_attachments remain intact.
CREATE TABLE IF NOT EXISTS public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id uuid NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_folders_company_id_id_unique UNIQUE(company_id,id),
  CONSTRAINT document_folders_parent_same_company FOREIGN KEY (company_id,parent_id)
    REFERENCES public.document_folders(company_id,id) ON DELETE RESTRICT,
  CONSTRAINT document_folders_no_self_parent CHECK (parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX IF NOT EXISTS document_folders_sibling_name_unique
  ON public.document_folders(company_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
CREATE INDEX IF NOT EXISTS document_folders_company_parent_idx ON public.document_folders(company_id,parent_id);
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_folders_read ON public.document_folders;
CREATE POLICY document_folders_read ON public.document_folders FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS document_folders_insert ON public.document_folders;
CREATE POLICY document_folders_insert ON public.document_folders FOR INSERT TO authenticated
  WITH CHECK (public.can_access_attachment(company_id,'company','manage'));
DROP POLICY IF EXISTS document_folders_update ON public.document_folders;
CREATE POLICY document_folders_update ON public.document_folders FOR UPDATE TO authenticated
  USING (public.can_access_attachment(company_id,'company','manage'))
  WITH CHECK (public.can_access_attachment(company_id,'company','manage'));
DROP POLICY IF EXISTS document_folders_delete ON public.document_folders;
CREATE POLICY document_folders_delete ON public.document_folders FOR DELETE TO authenticated
  USING (public.can_access_attachment(company_id,'company','manage'));
REVOKE ALL ON public.document_folders FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.document_folders TO authenticated;
-- Protect against indirect cycles, even when a user changes an ancestor.
CREATE OR REPLACE FUNCTION public.document_folders_guard_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE ancestor uuid;
BEGIN
  NEW.name := btrim(NEW.name);
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id,parent_id FROM public.document_folders WHERE id=NEW.parent_id AND company_id=NEW.company_id
    UNION ALL
    SELECT f.id,f.parent_id FROM public.document_folders f JOIN ancestors a ON f.id=a.parent_id
      WHERE f.company_id=NEW.company_id
  ) SELECT id INTO ancestor FROM ancestors WHERE id=NEW.id LIMIT 1;
  IF ancestor IS NOT NULL THEN RAISE EXCEPTION 'Folder cannot be moved inside itself or its descendants'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS document_folders_guard_cycle_trg ON public.document_folders;
CREATE TRIGGER document_folders_guard_cycle_trg BEFORE INSERT OR UPDATE OF parent_id,name
  ON public.document_folders FOR EACH ROW EXECUTE FUNCTION public.document_folders_guard_cycle();
ALTER TABLE public.document_attachments ADD COLUMN IF NOT EXISTS folder_id uuid NULL;
-- Enforce that an attachment can only reference a folder within its own company.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='document_attachments_folder_same_company') THEN
  ALTER TABLE public.document_attachments ADD CONSTRAINT document_attachments_folder_same_company
    FOREIGN KEY(company_id,folder_id) REFERENCES public.document_folders(company_id,id) ON DELETE RESTRICT;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS document_attachments_folder_idx ON public.document_attachments(company_id,folder_id);
