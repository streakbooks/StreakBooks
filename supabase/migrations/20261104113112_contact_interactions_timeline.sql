-- Contact CRM activity. No accounting postings or historical document changes.
SET LOCAL lock_timeout = '5s';

-- Composite FK makes tenant alignment a hard database constraint even for privileged callers.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_company_id_id_interactions_uidx
  ON public.contacts (company_id, id);

CREATE TABLE IF NOT EXISTS public.contact_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('note', 'call', 'meeting', 'email', 'task')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 4000),
  due_on date,
  completed_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_interactions_same_company FOREIGN KEY (company_id, contact_id)
    REFERENCES public.contacts(company_id, id) ON DELETE CASCADE,
  CONSTRAINT contact_interactions_task_fields
    CHECK (kind = 'task' OR (due_on IS NULL AND completed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS contact_interactions_timeline_idx
  ON public.contact_interactions(company_id, contact_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS contact_interactions_open_tasks_idx
  ON public.contact_interactions(company_id, contact_id, due_on)
  WHERE kind = 'task' AND completed_at IS NULL;

ALTER TABLE public.contact_interactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_interactions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.contact_interactions TO authenticated;

CREATE POLICY contact_interactions_company_read ON public.contact_interactions
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY contact_interactions_manager_insert ON public.contact_interactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_company_permission(company_id, 'contacts.manage')
    AND created_by = auth.uid()
  );

CREATE POLICY contact_interactions_manager_update ON public.contact_interactions
  FOR UPDATE TO authenticated
  USING (public.has_company_permission(company_id, 'contacts.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'contacts.manage'));

-- Interaction content is append-only. Only completion of follow-up tasks can change.
CREATE OR REPLACE FUNCTION public.guard_contact_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.occurred_at := now();
    RETURN NEW;
  END IF;

  IF OLD.kind <> 'task' OR
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW.company_id IS DISTINCT FROM OLD.company_id OR
    NEW.contact_id IS DISTINCT FROM OLD.contact_id OR
    NEW.kind IS DISTINCT FROM OLD.kind OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.detail IS DISTINCT FROM OLD.detail OR
    NEW.due_on IS DISTINCT FROM OLD.due_on OR
    NEW.occurred_at IS DISTINCT FROM OLD.occurred_at OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Contact activity is immutable except task completion';
  END IF;

  IF NEW.completed_at IS NOT NULL THEN
    NEW.completed_at := COALESCE(OLD.completed_at, now());
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_contact_interaction() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER contact_interactions_guard
  BEFORE INSERT OR UPDATE ON public.contact_interactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_contact_interaction();
