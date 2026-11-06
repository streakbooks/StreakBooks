-- AD-08: Advisors delivery workspaces, periods, tasks, notes and document requests.
-- No ledger posting. Document requests are Advisors-native; optional company attachment refs later.

CREATE TABLE IF NOT EXISTS public.advisors_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL UNIQUE REFERENCES public.advisors_engagements(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('bookkeeping', 'coaching')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'closed')),
  assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  title text NOT NULL,
  cadence text NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('monthly', 'session', 'adhoc')),
  objectives text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_work_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.advisors_workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  period_start date,
  period_end date,
  session_at timestamptz,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'completed', 'cancelled')),
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisors_work_periods_range CHECK (
    period_start IS NULL OR period_end IS NULL OR period_start <= period_end
  )
);

CREATE TABLE IF NOT EXISTS public.advisors_delivery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.advisors_workspaces(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.advisors_work_periods(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'blocked', 'done', 'skipped')),
  sort_order integer NOT NULL DEFAULT 100,
  requires_document boolean NOT NULL DEFAULT false,
  document_label text NOT NULL DEFAULT '',
  assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  admin_note text NOT NULL DEFAULT '',
  customer_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, code)
);

CREATE TABLE IF NOT EXISTS public.advisors_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.advisors_workspaces(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.advisors_work_periods(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.advisors_delivery_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'received', 'reviewed', 'cancelled')),
  due_at timestamptz,
  attachment_id uuid,
  storage_path text,
  received_at timestamptz,
  reviewed_at timestamptz,
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_workspace_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.advisors_workspaces(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.advisors_work_periods(id) ON DELETE SET NULL,
  author_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'customer')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_workspaces_advisor_idx
  ON public.advisors_workspaces (assigned_advisor_id, status);
CREATE INDEX IF NOT EXISTS advisors_work_periods_workspace_idx
  ON public.advisors_work_periods (workspace_id, status, period_start DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS advisors_delivery_tasks_period_idx
  ON public.advisors_delivery_tasks (period_id, sort_order);
CREATE INDEX IF NOT EXISTS advisors_document_requests_workspace_idx
  ON public.advisors_document_requests (workspace_id, status, due_at);
CREATE INDEX IF NOT EXISTS advisors_workspace_notes_workspace_idx
  ON public.advisors_workspace_notes (workspace_id, created_at DESC);

ALTER TABLE public.advisors_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_work_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_delivery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_workspace_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.advisors_workspaces, public.advisors_work_periods, public.advisors_delivery_tasks,
  public.advisors_document_requests, public.advisors_workspace_notes FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_workspaces, public.advisors_work_periods, public.advisors_delivery_tasks,
    public.advisors_document_requests, public.advisors_workspace_notes FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.advisors_workspace_json(w public.advisors_workspaces)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', w.id,
    'engagementId', w.engagement_id,
    'kind', w.kind,
    'status', w.status,
    'assignedAdvisorId', w.assigned_advisor_id,
    'title', w.title,
    'cadence', w.cadence,
    'objectives', w.objectives,
    'createdAt', w.created_at,
    'updatedAt', w.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_work_period_json(p public.advisors_work_periods)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'workspaceId', p.workspace_id,
    'label', p.label,
    'periodStart', p.period_start,
    'periodEnd', p.period_end,
    'sessionAt', p.session_at,
    'status', p.status,
    'summary', p.summary,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_delivery_task_json(t public.advisors_delivery_tasks)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'workspaceId', t.workspace_id,
    'periodId', t.period_id,
    'code', t.code,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'sortOrder', t.sort_order,
    'requiresDocument', t.requires_document,
    'documentLabel', t.document_label,
    'assignedAdvisorId', t.assigned_advisor_id,
    'dueAt', t.due_at,
    'completedAt', t.completed_at,
    'adminNote', t.admin_note,
    'customerNote', t.customer_note,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_document_request_json(d public.advisors_document_requests)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', d.id,
    'workspaceId', d.workspace_id,
    'periodId', d.period_id,
    'taskId', d.task_id,
    'title', d.title,
    'instructions', d.instructions,
    'status', d.status,
    'dueAt', d.due_at,
    'attachmentId', d.attachment_id,
    'storagePath', d.storage_path,
    'receivedAt', d.received_at,
    'reviewedAt', d.reviewed_at,
    'adminNote', d.admin_note,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_workspace_note_json(n public.advisors_workspace_notes)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', n.id,
    'workspaceId', n.workspace_id,
    'periodId', n.period_id,
    'authorAdvisorId', n.author_advisor_id,
    'visibility', n.visibility,
    'body', n.body,
    'createdAt', n.created_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_seed_delivery_period(
  _workspace_id uuid, _period_id uuid, _kind text, _advisor uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind = 'bookkeeping' THEN
    INSERT INTO public.advisors_delivery_tasks(
      workspace_id, period_id, code, title, description, sort_order, requires_document, document_label, assigned_advisor_id
    ) VALUES
      (_workspace_id, _period_id, 'bank_reconcile', 'Reconcile bank accounts', 'Match statements and clear outstanding items.', 10, true, 'Bank statements', _advisor),
      (_workspace_id, _period_id, 'source_docs', 'Collect source documents', 'Sales, purchases and expense evidence for the period.', 20, true, 'Source documents', _advisor),
      (_workspace_id, _period_id, 'ar_ap_review', 'Review AR/AP', 'Confirm open invoices and bills.', 30, false, '', _advisor),
      (_workspace_id, _period_id, 'draft_reports', 'Prepare draft reports', 'P&L and balance sheet draft for advisor review.', 40, false, '', _advisor),
      (_workspace_id, _period_id, 'client_signoff', 'Client period sign-off', 'Customer confirms the period is complete.', 50, false, '', _advisor)
    ON CONFLICT (period_id, code) DO NOTHING;
  ELSE
    INSERT INTO public.advisors_delivery_tasks(
      workspace_id, period_id, code, title, description, sort_order, requires_document, document_label, assigned_advisor_id
    ) VALUES
      (_workspace_id, _period_id, 'agenda', 'Confirm session agenda', 'Objectives and topics for this coaching session.', 10, false, '', _advisor),
      (_workspace_id, _period_id, 'prep_materials', 'Review prep materials', 'Customer materials shared ahead of the session.', 20, true, 'Prep materials', _advisor),
      (_workspace_id, _period_id, 'session_notes', 'Record session notes', 'Capture decisions and coaching notes.', 30, false, '', _advisor),
      (_workspace_id, _period_id, 'action_items', 'Assign action items', 'Customer and advisor follow-ups.', 40, false, '', _advisor),
      (_workspace_id, _period_id, 'follow_up', 'Send follow-up', 'Confirm next steps and next session.', 50, false, '', _advisor)
    ON CONFLICT (period_id, code) DO NOTHING;
  END IF;

  INSERT INTO public.advisors_document_requests(workspace_id, period_id, title, instructions, status)
  SELECT _workspace_id, _period_id, t.document_label, 'Please upload: ' || t.document_label, 'requested'
  FROM public.advisors_delivery_tasks t
  WHERE t.period_id = _period_id AND t.requires_document AND nullif(t.document_label, '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.advisors_document_requests d
      WHERE d.period_id = _period_id AND d.title = t.document_label
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_workspaces(
  _status text DEFAULT NULL,
  _kind text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('active', 'paused', 'closed') THEN
    RAISE EXCEPTION 'Unsupported workspace status filter' USING ERRCODE = '22023';
  END IF;
  IF _kind IS NOT NULL AND _kind NOT IN ('bookkeeping', 'coaching') THEN
    RAISE EXCEPTION 'Unsupported workspace kind filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
      private.advisors_workspace_json(w)
        || jsonb_build_object(
          'engagementTitle', e.title,
          'engagementStatus', e.status,
          'clientEmail', c.email,
          'clientName', c.name,
          'openPeriods', (
            SELECT count(*)::int FROM public.advisors_work_periods p
            WHERE p.workspace_id = w.id AND p.status IN ('open', 'in_review')
          ),
          'openTasks', (
            SELECT count(*)::int FROM public.advisors_delivery_tasks t
            WHERE t.workspace_id = w.id AND t.status NOT IN ('done', 'skipped')
          ),
          'openDocuments', (
            SELECT count(*)::int FROM public.advisors_document_requests d
            WHERE d.workspace_id = w.id AND d.status = 'requested'
          )
        )
      ORDER BY w.updated_at DESC
    )
    FROM (
      SELECT w.*
      FROM public.advisors_workspaces w
      WHERE (_status IS NULL OR w.status = _status)
        AND (_kind IS NULL OR w.kind = _kind)
      ORDER BY w.updated_at DESC
      LIMIT lim
    ) w
    JOIN public.advisors_engagements e ON e.id = w.engagement_id
    JOIN public.advisors_clients c ON c.id = e.client_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_upsert_workspace(
  _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eng public.advisors_engagements;
  ws public.advisors_workspaces;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = (_payload->>'engagementId')::uuid FOR UPDATE;
  IF eng.id IS NULL THEN
    RAISE EXCEPTION 'Engagement not found' USING ERRCODE = 'P0002';
  END IF;
  IF eng.status NOT IN ('active', 'onboarding', 'paused') THEN
    RAISE EXCEPTION 'Open a workspace only for onboarding, active or paused engagements'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.advisors_workspaces(
    engagement_id, kind, status, assigned_advisor_id, title, cadence, objectives
  ) VALUES (
    eng.id,
    eng.service_code,
    coalesce(nullif(_payload->>'status', ''), 'active'),
    coalesce(nullif(_payload->>'assignedAdvisorId', '')::uuid, eng.assigned_advisor_id),
    coalesce(nullif(btrim(_payload->>'title'), ''), eng.title || ' workspace'),
    CASE eng.service_code WHEN 'coaching' THEN 'session' ELSE 'monthly' END,
    coalesce(_payload->>'objectives', eng.scope_summary, '')
  )
  ON CONFLICT (engagement_id) DO UPDATE
    SET assigned_advisor_id = coalesce(EXCLUDED.assigned_advisor_id, public.advisors_workspaces.assigned_advisor_id),
        title = coalesce(nullif(btrim(EXCLUDED.title), ''), public.advisors_workspaces.title),
        status = coalesce(nullif(EXCLUDED.status, ''), public.advisors_workspaces.status),
        objectives = CASE
          WHEN nullif(EXCLUDED.objectives, '') IS NULL THEN public.advisors_workspaces.objectives
          ELSE EXCLUDED.objectives
        END,
        updated_at = now()
  RETURNING * INTO ws;

  PERFORM private.platform_log('advisors.workspace.upsert', 'advisors_workspaces', ws.id::text, NULL, _payload, _reason);
  RETURN private.advisors_workspace_json(ws);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_get_workspace(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws public.advisors_workspaces;
  eng public.advisors_engagements;
  client public.advisors_clients;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO ws FROM public.advisors_workspaces WHERE id = _workspace_id;
  IF ws.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO eng FROM public.advisors_engagements WHERE id = ws.engagement_id;
  SELECT * INTO client FROM public.advisors_clients WHERE id = eng.client_id;
  RETURN private.advisors_workspace_json(ws) || jsonb_build_object(
    'engagementTitle', eng.title,
    'engagementStatus', eng.status,
    'clientEmail', client.email,
    'clientName', client.name,
    'clientBusinessName', client.business_name,
    'companyId', client.company_id,
    'periods', COALESCE((
      SELECT jsonb_agg(private.advisors_work_period_json(p) ORDER BY coalesce(p.session_at, p.period_start::timestamptz, p.created_at) DESC)
      FROM public.advisors_work_periods p WHERE p.workspace_id = ws.id
    ), '[]'::jsonb),
    'tasks', COALESCE((
      SELECT jsonb_agg(private.advisors_delivery_task_json(t) ORDER BY t.sort_order, t.created_at)
      FROM public.advisors_delivery_tasks t WHERE t.workspace_id = ws.id
    ), '[]'::jsonb),
    'documentRequests', COALESCE((
      SELECT jsonb_agg(private.advisors_document_request_json(d) ORDER BY d.created_at DESC)
      FROM public.advisors_document_requests d WHERE d.workspace_id = ws.id
    ), '[]'::jsonb),
    'notes', COALESCE((
      SELECT jsonb_agg(private.advisors_workspace_note_json(n) ORDER BY n.created_at DESC)
      FROM (
        SELECT * FROM public.advisors_workspace_notes n
        WHERE n.workspace_id = ws.id
        ORDER BY n.created_at DESC
        LIMIT 50
      ) n
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_open_work_period(
  _workspace_id uuid, _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws public.advisors_workspaces;
  period public.advisors_work_periods;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ws FROM public.advisors_workspaces WHERE id = _workspace_id FOR UPDATE;
  IF ws.id IS NULL THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;
  IF ws.status = 'closed' THEN
    RAISE EXCEPTION 'Workspace is closed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.advisors_work_periods(
    workspace_id, label, period_start, period_end, session_at, status, summary
  ) VALUES (
    ws.id,
    coalesce(nullif(btrim(_payload->>'label'), ''),
      CASE WHEN ws.kind = 'coaching' THEN 'Coaching session' ELSE to_char(now(), 'Mon YYYY') END),
    nullif(_payload->>'periodStart', '')::date,
    nullif(_payload->>'periodEnd', '')::date,
    nullif(_payload->>'sessionAt', '')::timestamptz,
    'open',
    coalesce(_payload->>'summary', '')
  )
  RETURNING * INTO period;

  PERFORM private.advisors_seed_delivery_period(ws.id, period.id, ws.kind, ws.assigned_advisor_id);
  UPDATE public.advisors_workspaces SET updated_at = now() WHERE id = ws.id;
  PERFORM private.platform_log('advisors.period.open', 'advisors_work_periods', period.id::text, NULL, _payload, _reason);
  RETURN public.platform_advisors_get_workspace(ws.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_set_delivery_task(
  _task_id uuid, _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task public.advisors_delivery_tasks;
  next_status text;
  remaining integer;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO task FROM public.advisors_delivery_tasks WHERE id = _task_id FOR UPDATE;
  IF task.id IS NULL THEN
    RAISE EXCEPTION 'Delivery task not found' USING ERRCODE = 'P0002';
  END IF;
  next_status := coalesce(nullif(_payload->>'status', ''), task.status);
  IF next_status NOT IN ('pending', 'in_progress', 'blocked', 'done', 'skipped') THEN
    RAISE EXCEPTION 'Unsupported delivery task status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_delivery_tasks
     SET status = next_status,
         admin_note = coalesce(_payload->>'adminNote', admin_note),
         customer_note = coalesce(_payload->>'customerNote', customer_note),
         assigned_advisor_id = CASE
           WHEN _payload ? 'assignedAdvisorId' AND nullif(_payload->>'assignedAdvisorId', '') IS NULL THEN NULL
           WHEN nullif(_payload->>'assignedAdvisorId', '') IS NOT NULL THEN (_payload->>'assignedAdvisorId')::uuid
           ELSE assigned_advisor_id
         END,
         completed_at = CASE
           WHEN next_status IN ('done', 'skipped') THEN coalesce(completed_at, now())
           ELSE NULL
         END,
         updated_at = now()
   WHERE id = task.id
   RETURNING * INTO task;

  SELECT count(*)::int INTO remaining
  FROM public.advisors_delivery_tasks
  WHERE period_id = task.period_id AND status NOT IN ('done', 'skipped');
  IF remaining = 0 THEN
    UPDATE public.advisors_work_periods
       SET status = 'completed', updated_at = now()
     WHERE id = task.period_id AND status IN ('open', 'in_review');
  END IF;

  PERFORM private.platform_log('advisors.delivery.task', 'advisors_delivery_tasks', task.id::text, NULL, _payload, _reason);
  RETURN private.advisors_delivery_task_json(task);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_upsert_document_request(
  _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.advisors_document_requests;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  next_status := coalesce(nullif(_payload->>'status', ''), 'requested');
  IF next_status NOT IN ('requested', 'received', 'reviewed', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported document request status' USING ERRCODE = '22023';
  END IF;

  IF nullif(_payload->>'id', '') IS NOT NULL THEN
    UPDATE public.advisors_document_requests
       SET title = coalesce(nullif(btrim(_payload->>'title'), ''), title),
           instructions = coalesce(_payload->>'instructions', instructions),
           status = next_status,
           due_at = CASE
             WHEN _payload ? 'dueAt' AND nullif(_payload->>'dueAt', '') IS NULL THEN NULL
             WHEN nullif(_payload->>'dueAt', '') IS NOT NULL THEN (_payload->>'dueAt')::timestamptz
             ELSE due_at
           END,
           storage_path = coalesce(nullif(_payload->>'storagePath', ''), storage_path),
           attachment_id = CASE
             WHEN _payload ? 'attachmentId' AND nullif(_payload->>'attachmentId', '') IS NULL THEN NULL
             WHEN nullif(_payload->>'attachmentId', '') IS NOT NULL THEN (_payload->>'attachmentId')::uuid
             ELSE attachment_id
           END,
           admin_note = coalesce(_payload->>'adminNote', admin_note),
           received_at = CASE WHEN next_status IN ('received', 'reviewed') THEN coalesce(received_at, now()) ELSE received_at END,
           reviewed_at = CASE WHEN next_status = 'reviewed' THEN coalesce(reviewed_at, now()) ELSE reviewed_at END,
           updated_at = now()
     WHERE id = (_payload->>'id')::uuid
     RETURNING * INTO req;
    IF req.id IS NULL THEN
      RAISE EXCEPTION 'Document request not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF nullif(_payload->>'workspaceId', '') IS NULL OR nullif(btrim(_payload->>'title'), '') IS NULL THEN
      RAISE EXCEPTION 'Workspace and title are required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.advisors_document_requests(
      workspace_id, period_id, task_id, title, instructions, status, due_at, storage_path, attachment_id, admin_note
    ) VALUES (
      (_payload->>'workspaceId')::uuid,
      nullif(_payload->>'periodId', '')::uuid,
      nullif(_payload->>'taskId', '')::uuid,
      btrim(_payload->>'title'),
      coalesce(_payload->>'instructions', ''),
      next_status,
      nullif(_payload->>'dueAt', '')::timestamptz,
      nullif(_payload->>'storagePath', ''),
      nullif(_payload->>'attachmentId', '')::uuid,
      coalesce(_payload->>'adminNote', '')
    )
    RETURNING * INTO req;
  END IF;

  PERFORM private.platform_log('advisors.document.request', 'advisors_document_requests', req.id::text, NULL, _payload, _reason);
  RETURN private.advisors_document_request_json(req);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_add_workspace_note(
  _workspace_id uuid, _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  note public.advisors_workspace_notes;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(_payload->>'body', ''))) < 1 THEN
    RAISE EXCEPTION 'Note body is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.advisors_workspaces WHERE id = _workspace_id) THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.advisors_workspace_notes(
    workspace_id, period_id, author_advisor_id, visibility, body
  ) VALUES (
    _workspace_id,
    nullif(_payload->>'periodId', '')::uuid,
    nullif(_payload->>'authorAdvisorId', '')::uuid,
    coalesce(nullif(_payload->>'visibility', ''), 'internal'),
    left(btrim(_payload->>'body'), 8000)
  )
  RETURNING * INTO note;
  UPDATE public.advisors_workspaces SET updated_at = now() WHERE id = _workspace_id;
  PERFORM private.platform_log('advisors.workspace.note', 'advisors_workspace_notes', note.id::text, NULL, _payload, _reason);
  RETURN private.advisors_workspace_note_json(note);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_document_requests(
  _status text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('requested', 'received', 'reviewed', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported document request status filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
      private.advisors_document_request_json(d)
        || jsonb_build_object(
          'workspaceTitle', w.title,
          'clientEmail', c.email,
          'clientName', c.name
        )
      ORDER BY d.created_at DESC
    )
    FROM (
      SELECT d.*
      FROM public.advisors_document_requests d
      WHERE (_status IS NULL OR d.status = _status)
      ORDER BY d.created_at DESC
      LIMIT lim
    ) d
    JOIN public.advisors_workspaces w ON w.id = d.workspace_id
    JOIN public.advisors_engagements e ON e.id = w.engagement_id
    JOIN public.advisors_clients c ON c.id = e.client_id
  ), '[]'::jsonb);
END;
$$;

-- Eligible engagements without a workspace yet.
CREATE OR REPLACE FUNCTION public.platform_advisors_list_delivery_candidates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'status', e.status,
      'serviceCode', e.service_code,
      'clientId', c.id,
      'clientEmail', c.email,
      'clientName', c.name,
      'assignedAdvisorId', e.assigned_advisor_id
    ) ORDER BY e.updated_at DESC)
    FROM public.advisors_engagements e
    JOIN public.advisors_clients c ON c.id = e.client_id
    WHERE e.status IN ('active', 'onboarding', 'paused')
      AND NOT EXISTS (SELECT 1 FROM public.advisors_workspaces w WHERE w.engagement_id = e.id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'newInquiries', (SELECT count(*)::int FROM public.advisors_leads WHERE status = 'new'),
    'openConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'open'),
    'handedOffConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'handed_off'),
    'pendingConsultations', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed' AND starts_at >= now()
    ),
    'upcomingAppointments', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed' AND starts_at >= now() AND starts_at < now() + interval '7 days'
    ),
    'activeClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'active'),
    'prospectClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'prospect'),
    'activeAdvisors', (SELECT count(*)::int FROM public.advisors_staff WHERE is_active),
    'openProposals', (SELECT count(*)::int FROM public.advisors_proposals WHERE status = 'sent'),
    'onboardingEngagements', (SELECT count(*)::int FROM public.advisors_engagements WHERE status = 'onboarding'),
    'pendingBilling', (
      SELECT count(*)::int FROM public.advisors_subscriptions
      WHERE status IN ('pending_checkout', 'checkout_open')
    ),
    'activeBilling', (
      SELECT count(*)::int FROM public.advisors_subscriptions
      WHERE status IN ('active', 'trialing', 'manual_active')
    ),
    'activeWorkspaces', (SELECT count(*)::int FROM public.advisors_workspaces WHERE status = 'active'),
    'openDeliveryTasks', (
      SELECT count(*)::int FROM public.advisors_delivery_tasks
      WHERE status NOT IN ('done', 'skipped')
    ),
    'openDocumentRequests', (
      SELECT count(*)::int FROM public.advisors_document_requests WHERE status = 'requested'
    ),
    'recentInquiries', COALESCE((
      SELECT jsonb_agg(private.advisors_lead_json(l) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.advisors_leads ORDER BY created_at DESC LIMIT 8) l
    ), '[]'::jsonb),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'status', a.status, 'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'customerName', a.customer_name, 'customerEmail', a.customer_email,
        'businessName', a.business_name, 'serviceCode', a.service_code
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE status = 'confirmed' AND starts_at >= now()
        ORDER BY starts_at LIMIT 8
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_advisors_list_workspaces(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_upsert_workspace(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_get_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_open_work_period(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_set_delivery_task(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_upsert_document_request(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_add_workspace_note(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_document_requests(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_delivery_candidates() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.platform_advisors_list_workspaces(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_upsert_workspace(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_get_workspace(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_open_work_period(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_set_delivery_task(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_upsert_document_request(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_add_workspace_note(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_document_requests(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_delivery_candidates() TO authenticated, service_role;
