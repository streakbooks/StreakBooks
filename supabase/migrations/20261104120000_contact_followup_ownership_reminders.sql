-- Contact follow-up ownership and in-app reminders.
-- Additive: existing notes and historical task details are preserved.
ALTER TABLE public.contact_interactions
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remind_on date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contact_interactions'::regclass
      AND conname = 'contact_interactions_reminder_fields_check'
  ) THEN
    ALTER TABLE public.contact_interactions
      ADD CONSTRAINT contact_interactions_reminder_fields_check
      CHECK (
        (kind = 'task' OR (assigned_to IS NULL AND remind_on IS NULL))
        AND (remind_on IS NULL OR (due_on IS NOT NULL AND remind_on <= due_on))
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contact_interactions_followup_assignee_idx
  ON public.contact_interactions (company_id, assigned_to, due_on, id)
  WHERE kind = 'task' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS contact_interactions_followup_reminder_idx
  ON public.contact_interactions (company_id, remind_on, due_on, id)
  WHERE kind = 'task' AND completed_at IS NULL;

-- Team members may update completion of their own tasks. Only contact managers
-- may change task ownership and reminder dates. The trigger enforces this even
-- when a caller bypasses the application's server functions.
DROP POLICY IF EXISTS contact_interactions_manager_update ON public.contact_interactions;
CREATE POLICY contact_interactions_task_update ON public.contact_interactions
  FOR UPDATE TO authenticated
  USING (
    public.has_company_permission(company_id, 'contacts.manage')
    OR (kind = 'task' AND assigned_to = (SELECT auth.uid())
      AND public.is_company_member(company_id))
  )
  WITH CHECK (
    public.has_company_permission(company_id, 'contacts.manage')
    OR (kind = 'task' AND assigned_to = (SELECT auth.uid())
      AND public.is_company_member(company_id))
  );

CREATE OR REPLACE FUNCTION public.guard_contact_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Defaults are stamped from the authenticated session, not client claims.
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.occurred_at := now();
    NEW.completed_at := NULL;
    IF NEW.kind = 'task' THEN
      NEW.assigned_to := COALESCE(NEW.assigned_to, auth.uid());
    ELSE
      NEW.assigned_to := NULL;
      NEW.remind_on := NULL;
    END IF;
  ELSE
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
      RAISE EXCEPTION 'Contact activity is immutable except task status, owner and reminder';
    END IF;

    IF (
      NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR
      NEW.remind_on IS DISTINCT FROM OLD.remind_on
    ) AND NOT public.has_company_permission(OLD.company_id, 'contacts.manage') THEN
      RAISE EXCEPTION 'Only contact managers can reassign tasks or change reminders';
    END IF;

    IF NEW.completed_at IS NOT NULL THEN
      NEW.completed_at := COALESCE(OLD.completed_at, now());
    END IF;
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
  END IF;

  IF NEW.kind = 'task' AND NEW.assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = NEW.company_id
      AND m.user_id = NEW.assigned_to
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Task assignee must be an active member of this organisation';
  END IF;

  IF NEW.remind_on IS NOT NULL AND (NEW.due_on IS NULL OR NEW.remind_on > NEW.due_on) THEN
    RAISE EXCEPTION 'Reminder date must be on or before the due date';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_contact_interaction() FROM PUBLIC, anon, authenticated;
