-- Firm onboarding automation: assignments, dependencies, relative due dates, and in-app reminders.
-- Existing accounting records, user grants, and completed checklist evidence are unchanged.
ALTER TABLE public.firm_client_onboarding_steps
  ADD COLUMN assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN due_date date,
  ADD COLUMN depends_on_task_key text,
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT firm_onboarding_no_self_dependency
    CHECK (depends_on_task_key IS NULL OR depends_on_task_key <> task_key);
CREATE INDEX firm_onboarding_due_queue_idx
  ON public.firm_client_onboarding_steps(firm_id,due_date,company_id)
  WHERE completed_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX firm_onboarding_assignee_idx
  ON public.firm_client_onboarding_steps(assignee_id,due_date)
  WHERE assignee_id IS NOT NULL AND completed_at IS NULL;

ALTER TABLE public.firm_onboarding_template_steps
  ADD COLUMN due_in_days integer CHECK (due_in_days BETWEEN 0 AND 365),
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT true;

CREATE FUNCTION private.firm_onboarding_step_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  creates_cycle boolean;
BEGIN
  -- Existing firm/client and task identifiers remain protected by the prior guard.
  IF new.assignee_id IS NOT NULL AND NOT (
    EXISTS (SELECT 1 FROM public.firm_members m
      WHERE m.firm_id=new.firm_id AND m.user_id=new.assignee_id)
    AND EXISTS (SELECT 1 FROM public.company_members cm
      WHERE cm.company_id=new.company_id AND cm.user_id=new.assignee_id
        AND cm.status='active')
  ) THEN
    RAISE EXCEPTION 'Assignee must be an active firm and client organisation member'
      USING ERRCODE='42501';
  END IF;
  IF new.depends_on_task_key IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.firm_client_onboarding_steps s
      WHERE s.firm_id=new.firm_id AND s.company_id=new.company_id
        AND s.task_key=new.depends_on_task_key
    ) THEN
      RAISE EXCEPTION 'Dependency must be a step in the same client checklist'
        USING ERRCODE='22023';
    END IF;
    WITH RECURSIVE predecessors(task_key) AS (
      SELECT new.depends_on_task_key
      UNION
      SELECT s.depends_on_task_key
      FROM public.firm_client_onboarding_steps s
      JOIN predecessors p ON s.task_key=p.task_key
      WHERE s.firm_id=new.firm_id AND s.company_id=new.company_id
        AND s.depends_on_task_key IS NOT NULL
    )
    SELECT EXISTS(SELECT 1 FROM predecessors WHERE task_key=new.task_key)
      INTO creates_cycle;
    IF creates_cycle THEN
      RAISE EXCEPTION 'Checklist dependencies cannot form a cycle'
        USING ERRCODE='22023';
    END IF;
    IF new.completed_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.firm_client_onboarding_steps s
      WHERE s.firm_id=new.firm_id AND s.company_id=new.company_id
        AND s.task_key=new.depends_on_task_key AND s.completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Complete the prerequisite step before marking this step complete'
        USING ERRCODE='22023';
    END IF;
  END IF;
  -- Do not allow reopening a prerequisite while an immediately dependent step
  -- remains completed; this preserves checklist consistency.
  IF tg_op='UPDATE' AND old.completed_at IS NOT NULL AND new.completed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.firm_client_onboarding_steps child
      WHERE child.firm_id=new.firm_id AND child.company_id=new.company_id
        AND child.depends_on_task_key=new.task_key AND child.completed_at IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'Reopen dependent steps before reopening this prerequisite'
      USING ERRCODE='22023';
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER firm_onboarding_step_guard
  BEFORE INSERT OR UPDATE OF assignee_id,depends_on_task_key,completed_at
  ON public.firm_client_onboarding_steps FOR EACH ROW
  EXECUTE FUNCTION private.firm_onboarding_step_guard();
REVOKE ALL ON FUNCTION private.firm_onboarding_step_guard()
  FROM public,anon,authenticated;

-- Reuse existing custom template engine, copying defaults only on first insert.
CREATE OR REPLACE FUNCTION public.apply_firm_onboarding_template(
  _firm_id uuid,_company_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  created_count integer;
  active_count integer;
  existing_count integer;
  missing_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.is_firm_admin(_firm_id)
     OR NOT public.has_company_permission(_company_id,'accounting.view')
     OR NOT EXISTS (
       SELECT 1 FROM public.firm_client_links l
       WHERE l.firm_id=_firm_id AND l.company_id=_company_id
         AND l.revoked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Firm admin and active client access required'
      USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    _firm_id::text || ':' || _company_id::text,29));
  SELECT count(*) INTO active_count
    FROM public.firm_onboarding_template_steps t
    WHERE t.firm_id=_firm_id AND t.is_active;
  SELECT count(*) INTO existing_count
    FROM public.firm_client_onboarding_steps s
    WHERE s.firm_id=_firm_id AND s.company_id=_company_id;
  SELECT count(*) INTO missing_count
    FROM public.firm_onboarding_template_steps t
    WHERE t.firm_id=_firm_id AND t.is_active AND NOT EXISTS (
      SELECT 1 FROM public.firm_client_onboarding_steps s
      WHERE s.firm_id=_firm_id AND s.company_id=_company_id
        AND s.task_key=t.task_key
    );
  IF active_count>50 OR existing_count+missing_count>100 THEN
    RAISE EXCEPTION 'Checklist exceeds 100 steps; archive unused templates'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.firm_client_onboarding_steps(
    firm_id,company_id,task_key,title,due_date,reminders_enabled,updated_by
  )
  SELECT _firm_id,_company_id,t.task_key,t.title,
    CASE WHEN t.due_in_days IS NULL THEN NULL
      ELSE current_date+t.due_in_days END,
    t.reminders_enabled,(SELECT auth.uid())
  FROM public.firm_onboarding_template_steps t
  WHERE t.firm_id=_firm_id AND t.is_active
  ORDER BY t.sort_order,t.task_key
  ON CONFLICT(firm_id,company_id,task_key) DO NOTHING;
  GET DIAGNOSTICS created_count=ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('added',created_count,'available',active_count);
END $$;
REVOKE ALL ON FUNCTION public.apply_firm_onboarding_template(uuid,uuid)
  FROM public,anon;
GRANT EXECUTE ON FUNCTION public.apply_firm_onboarding_template(uuid,uuid)
  TO authenticated;

-- Strictly in-app notifications. No email, SMS, or external communications.
-- A linked client, active firm membership and independent company membership
-- must all still be valid when the daily reminder is generated.
CREATE FUNCTION private.firm_onboarding_due_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sent integer;
BEGIN
  WITH candidates AS (
    SELECT s.firm_id,s.company_id,s.task_key,s.assignee_id,s.due_date,
      s.due_date-current_date AS days_left
    FROM public.firm_client_onboarding_steps s
    JOIN public.firm_client_links l
      ON l.firm_id=s.firm_id AND l.company_id=s.company_id
      AND l.revoked_at IS NULL
    JOIN public.firm_members fm
      ON fm.firm_id=s.firm_id AND fm.user_id=s.assignee_id
    JOIN public.company_members cm
      ON cm.company_id=s.company_id AND cm.user_id=s.assignee_id
      AND cm.status='active'
    WHERE s.completed_at IS NULL AND s.reminders_enabled
      AND s.assignee_id IS NOT NULL AND s.due_date IS NOT NULL
      AND s.due_date BETWEEN current_date-28 AND current_date+3
      AND (
        s.due_date-current_date IN (3,0)
        OR (current_date>s.due_date AND (current_date-s.due_date)%7=0)
      )
  )
  INSERT INTO public.action_notifications (
    company_id,recipient_user_id,event_key,category,priority,
    title,body,entity_type,entity_id,target_path,action_kind
  )
  SELECT c.company_id,c.assignee_id,
    'firm-onboard-due:'||c.firm_id::text||':'||c.task_key||':'||current_date::text,
    'system',
    CASE WHEN c.days_left<0 THEN 'high' ELSE 'medium' END,
    CASE WHEN c.days_left<0 THEN 'Client onboarding step overdue'
      WHEN c.days_left=0 THEN 'Client onboarding step due today'
      ELSE 'Client onboarding step due in 3 days' END,
    'Open Firm & Clients → Onboarding to review your assigned checklist item.',
    'firm_onboarding_step',c.company_id,'/firm','open'
  FROM candidates c
  ON CONFLICT (company_id,recipient_user_id,event_key) DO NOTHING;
  GET DIAGNOSTICS sent=ROW_COUNT;
  RETURN sent;
END $$;
REVOKE ALL ON FUNCTION private.firm_onboarding_due_notifications()
  FROM public,anon,authenticated;

-- pg_cron is installed for the existing firm document reminders.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname='linkbooks-firm-onboarding-reminders'
  ) THEN
    PERFORM cron.schedule(
      'linkbooks-firm-onboarding-reminders',
      '25 1 * * *',
      'SELECT private.firm_onboarding_due_notifications();'
    );
  END IF;
END $$;
