-- Budget approvals: independent reviewer, audit events and freeze while under review.
-- Requires base Budgets migration. Approval freezes do NOT depend on manually locking the
-- budget; governance locks remain independent and are still respected after reopening.
-- No journals or general-ledger transactions are created by these workflows.

CREATE TABLE IF NOT EXISTS public.budget_approval_state (
  budget_id UUID PRIMARY KEY REFERENCES public.budgets(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'withdrawn', 'reopened')
  ),
  cycle INTEGER NOT NULL CHECK (cycle >= 1),
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  submitted_budget_updated_at TIMESTAMPTZ NOT NULL,
  request_note TEXT NOT NULL CHECK (char_length(request_note) BETWEEN 3 AND 500),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  decision_note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS budget_approval_state_company_idx
  ON public.budget_approval_state (company_id, status, budget_id);

CREATE TABLE IF NOT EXISTS public.budget_approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL CHECK (cycle >= 1),
  action TEXT NOT NULL CHECK (action IN ('submit', 'withdraw', 'approve', 'reject', 'reopen')),
  status_after TEXT NOT NULL CHECK (
    status_after IN ('pending', 'approved', 'rejected', 'withdrawn', 'reopened')
  ),
  acted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 3 AND 500),
  budget_updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS budget_approval_events_timeline_idx
  ON public.budget_approval_events (budget_id, acted_at DESC, id DESC);

ALTER TABLE public.budget_approval_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_approval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organisation members read budget approval state"
  ON public.budget_approval_state;
CREATE POLICY "Organisation members read budget approval state"
  ON public.budget_approval_state FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Organisation members read budget approval history"
  ON public.budget_approval_events;
CREATE POLICY "Organisation members read budget approval history"
  ON public.budget_approval_events FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- No direct INSERT, UPDATE or DELETE grants. All state changes use an audited RPC.
REVOKE ALL ON public.budget_approval_state, public.budget_approval_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.budget_approval_state, public.budget_approval_events TO authenticated;

-- All write paths (editor, legacy save RPC, CSV, copy/delete, direct administrator SQL)
-- are blocked when a plan is awaiting review or approved.
CREATE OR REPLACE FUNCTION public.budget_approval_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _old_budget UUID;
  _new_budget UUID;
BEGIN
  IF TG_TABLE_NAME = 'budgets' AND TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF TG_TABLE_NAME = 'budgets' THEN
      _old_budget := OLD.id;
    ELSE
      _old_budget := OLD.budget_id;
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN
    IF TG_TABLE_NAME = 'budgets' THEN
      _new_budget := NEW.id;
    ELSE
      _new_budget := NEW.budget_id;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.budget_approval_state AS a
    WHERE a.status IN ('pending', 'approved')
      AND (a.budget_id = _old_budget OR a.budget_id = _new_budget)
  ) THEN
    RAISE EXCEPTION
      'Budget is pending approval or approved. Withdraw, reject or reopen it before editing.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.budget_approval_write_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS budget_approval_guard_header ON public.budgets;
CREATE TRIGGER budget_approval_guard_header
BEFORE UPDATE OR DELETE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.budget_approval_write_guard();

DROP TRIGGER IF EXISTS budget_approval_guard_lines ON public.budget_lines;
CREATE TRIGGER budget_approval_guard_lines
BEFORE INSERT OR UPDATE OR DELETE ON public.budget_lines
FOR EACH ROW EXECUTE FUNCTION public.budget_approval_write_guard();

-- Action transitions are serialized on the budget header row, the same row lock
-- used by save_budget and save_budget_lines. No separate transport-side status writes.
CREATE OR REPLACE FUNCTION public.transition_budget_approval(
  _company_id UUID,
  _budget_id UUID,
  _action TEXT,
  _note TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor UUID := auth.uid();
  _budget public.budgets%ROWTYPE;
  _previous public.budget_approval_state%ROWTYPE;
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
  _status TEXT;
  _cycle INTEGER;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF _company_id IS NULL OR
     NOT public.is_company_member(_company_id) OR
     NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'You cannot manage budget approvals for this organisation'
      USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR _action NOT IN
    ('submit', 'withdraw', 'approve', 'reject', 'reopen') THEN
    RAISE EXCEPTION 'Unknown budget approval action';
  END IF;
  IF _note_clean IS NULL OR char_length(_note_clean) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Give an approval note between 3 and 500 characters';
  END IF;

  SELECT * INTO _budget FROM public.budgets
  WHERE id = _budget_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found in this organisation'; END IF;

  SELECT * INTO _previous FROM public.budget_approval_state
  WHERE budget_id = _budget_id AND company_id = _company_id
  FOR UPDATE;

  IF _action = 'submit' THEN
    IF _previous.status IN ('pending', 'approved') THEN
      RAISE EXCEPTION 'This budget is already pending approval or approved';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.budget_governance AS g
      WHERE g.budget_id = _budget_id AND g.is_locked
    ) THEN
      RAISE EXCEPTION 'Unlock this budget before requesting review';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.budget_lines WHERE budget_id = _budget_id
    ) THEN
      RAISE EXCEPTION 'Add and save budget amounts before requesting approval';
    END IF;
    _status := 'pending';
    _cycle := COALESCE(_previous.cycle, 0) + 1;

    INSERT INTO public.budget_approval_state (
      company_id, budget_id, status, cycle,
      submitted_by, submitted_at, submitted_budget_updated_at,
      request_note, reviewed_by, reviewed_at, decision_note, changed_at
    ) VALUES (
      _company_id, _budget_id, 'pending', _cycle,
      _actor, clock_timestamp(), _budget.updated_at,
      _note_clean, NULL, NULL, NULL, clock_timestamp()
    )
    ON CONFLICT (budget_id) DO UPDATE SET
      status = 'pending',
      cycle = EXCLUDED.cycle,
      submitted_by = EXCLUDED.submitted_by,
      submitted_at = EXCLUDED.submitted_at,
      submitted_budget_updated_at = EXCLUDED.submitted_budget_updated_at,
      request_note = EXCLUDED.request_note,
      reviewed_by = NULL,
      reviewed_at = NULL,
      decision_note = NULL,
      changed_at = clock_timestamp();

  ELSIF _action = 'withdraw' THEN
    IF _previous.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Only a pending review can be withdrawn';
    END IF;
    IF _previous.submitted_by IS DISTINCT FROM _actor THEN
      RAISE EXCEPTION 'Only the requester can withdraw this review'
        USING ERRCODE = '42501';
    END IF;
    _status := 'withdrawn';
    _cycle := _previous.cycle;
    UPDATE public.budget_approval_state SET
      status = _status, decision_note = _note_clean,
      reviewed_by = NULL, reviewed_at = clock_timestamp(),
      changed_at = clock_timestamp()
    WHERE budget_id = _budget_id;

  ELSIF _action = 'approve' OR _action = 'reject' THEN
    IF _previous.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'This budget is not waiting for approval';
    END IF;
    IF _previous.submitted_by IS NOT DISTINCT FROM _actor THEN
      RAISE EXCEPTION 'The requester cannot approve or reject their own budget'
        USING ERRCODE = '42501';
    END IF;
    IF _budget.updated_at IS DISTINCT FROM _previous.submitted_budget_updated_at THEN
      RAISE EXCEPTION 'The submitted budget has changed. Withdraw and resubmit it.'
        USING ERRCODE = '40001';
    END IF;
    _status := CASE WHEN _action = 'approve' THEN 'approved' ELSE 'rejected' END;
    _cycle := _previous.cycle;
    UPDATE public.budget_approval_state SET
      status = _status, reviewed_by = _actor, reviewed_at = clock_timestamp(),
      decision_note = _note_clean, changed_at = clock_timestamp()
    WHERE budget_id = _budget_id;

  ELSE -- reopen
    IF _previous.status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Only approved budgets can be reopened';
    END IF;
    _status := 'reopened';
    _cycle := _previous.cycle;
    UPDATE public.budget_approval_state SET
      status = _status, reviewed_by = _actor, reviewed_at = clock_timestamp(),
      decision_note = _note_clean, changed_at = clock_timestamp()
    WHERE budget_id = _budget_id;
  END IF;

  INSERT INTO public.budget_approval_events (
    company_id, budget_id, cycle, action, status_after, acted_by,
    note, budget_updated_at
  ) VALUES (
    _company_id, _budget_id, _cycle, _action, _status, _actor,
    _note_clean, _budget.updated_at
  );

  PERFORM public.record_audit_event(
    _company_id, 'budget.approval_' || _action, 'budget', _budget_id,
    jsonb_build_object('action', _action, 'status', _status,
                       'cycle', _cycle, 'actor', _actor)
  );
  RETURN _status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_budget_approval(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_budget_approval(UUID, UUID, TEXT, TEXT)
  TO authenticated;
