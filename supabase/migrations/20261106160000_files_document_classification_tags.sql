-- Files Batch 7: classification and reusable company document tags.
-- Classification is only metadata, not approval, bookkeeping or tax treatment.
ALTER TABLE public.document_attachments
  ADD COLUMN IF NOT EXISTS document_category text NOT NULL DEFAULT 'unclassified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_attachments_category_check'
      AND conrelid = 'public.document_attachments'::regclass
  ) THEN
    ALTER TABLE public.document_attachments
      ADD CONSTRAINT document_attachments_category_check
      CHECK (document_category IN (
        'unclassified', 'bill', 'invoice', 'receipt', 'statement',
        'contract', 'tax', 'payroll', 'bank', 'other'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS document_attachments_category_idx
  ON public.document_attachments(company_id, document_category, created_at DESC);

CREATE TABLE IF NOT EXISTS public.document_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 50
    AND name !~ '[[:cntrl:]]'
  ),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_tags_company_id_id_unique UNIQUE(company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS document_tags_unique_name
  ON public.document_tags(company_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS document_tags_company_name_idx
  ON public.document_tags(company_id, name);

ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_tags FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.document_tags TO authenticated;

DROP POLICY IF EXISTS document_tags_read ON public.document_tags;
CREATE POLICY document_tags_read ON public.document_tags FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS document_tags_insert ON public.document_tags;
CREATE POLICY document_tags_insert ON public.document_tags FOR INSERT TO authenticated
  WITH CHECK (public.can_access_attachment(company_id, 'company', 'manage'));
DROP POLICY IF EXISTS document_tags_delete ON public.document_tags;
CREATE POLICY document_tags_delete ON public.document_tags FOR DELETE TO authenticated
  USING (public.can_access_attachment(company_id, 'company', 'manage'));

-- Server sets the actor; clients cannot submit a forged created_by.
CREATE OR REPLACE FUNCTION public.document_tags_stamp_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.document_tags_stamp_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_tags_stamp_insert_trg ON public.document_tags;
CREATE TRIGGER document_tags_stamp_insert_trg
  BEFORE INSERT ON public.document_tags FOR EACH ROW
  EXECUTE FUNCTION public.document_tags_stamp_insert();

-- Both composite FKs enforce same-company membership at the database level.
-- Association permissions follow each attachment's specific entity type, not just membership.
CREATE TABLE IF NOT EXISTS public.document_attachment_tags (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, attachment_id, tag_id),
  CONSTRAINT document_attachment_tags_attachment_same_company
    FOREIGN KEY(company_id, attachment_id)
    REFERENCES public.document_attachments(company_id, id) ON DELETE CASCADE,
  CONSTRAINT document_attachment_tags_tag_same_company
    FOREIGN KEY(company_id, tag_id)
    REFERENCES public.document_tags(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_attachment_tags_tag_lookup
  ON public.document_attachment_tags(company_id, tag_id, attachment_id);
ALTER TABLE public.document_attachment_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_attachment_tags FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.document_attachment_tags TO authenticated;

DROP POLICY IF EXISTS document_attachment_tags_read ON public.document_attachment_tags;
CREATE POLICY document_attachment_tags_read
  ON public.document_attachment_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_attachment_tags.company_id
      AND a.id = document_attachment_tags.attachment_id
      AND public.can_access_attachment(a.company_id, a.entity_type, 'view')
  ));

DROP POLICY IF EXISTS document_attachment_tags_insert ON public.document_attachment_tags;
CREATE POLICY document_attachment_tags_insert
  ON public.document_attachment_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_attachment_tags.company_id
      AND a.id = document_attachment_tags.attachment_id
      AND public.can_access_attachment(a.company_id, a.entity_type, 'manage')
  ));

DROP POLICY IF EXISTS document_attachment_tags_delete ON public.document_attachment_tags;
CREATE POLICY document_attachment_tags_delete
  ON public.document_attachment_tags FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = document_attachment_tags.company_id
      AND a.id = document_attachment_tags.attachment_id
      AND public.can_access_attachment(a.company_id, a.entity_type, 'manage')
  ));

-- No public Storage paths, no service-role grants, no modifications to accounting journals.
