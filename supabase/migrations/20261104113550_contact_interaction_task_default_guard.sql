-- A newly created task must start open even when the Data API is called directly.
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
    NEW.completed_at := NULL;
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
