-- Budget governance and immutable revision snapshots.
-- Safe default: existing plans remain editable (unlocked) until an authorised user locks one.
-- Direct client writes remain disallowed. All write paths (including CSV and bulk RPCs) are
-- stopped by table triggers when locked. No journals or ledger records are changed.

CREATE TABLE IF NOT EXISTS public.budget_governance (
  budget_id UUID PRIMARY KEY REFERENCES public.budgets(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  CONSTRAINT budget_governance_reason_length CHECK (char_length(reason) BETWEEN 3 AND 500)
);

CREATE INDEX IF NOT EXISTS budget_governance_company_idx
  ON public.budget_governance (company_id, budget_id);

CREATE TABLE IF NOT EXISTS public.budget_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('baseline', 'created', 'updated', 'locked', 'unlocked')),
  line_count INTEGER NOT NULL CHECK (line_count >= 0),
  snapshot JSONB NOT NULL,
  CONSTRAINT budget_revisions_unique UNIQUE (budget_id, version)
);

CREATE INDEX IF NOT EXISTS budget_revisions_timeline_idx
  ON public.budget_revisions (budget_id, version DESC);

ALTER TABLE public.budget_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view budget governance" ON public.budget_governance;
CREATE POLICY "Members can view budget governance"
  ON public.budget_governance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "Members can view budget revisions" ON public.budget_revisions;
CREATE POLICY "Members can view budget revisions"
  ON public.budget_revisions FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

REVOKE ALL ON public.budget_governance, public.budget_revisions FROM PUBLIC, anon;
GRANT SELECT ON public.budget_governance, public.budget_revisions TO authenticated;

-- The same immutable structure is used for baseline, edits and lock/unlock history.
-- Revisions are recorded on the transaction's final budget state. This also captures
-- a duplicated budget after its monthly lines have been copied, not an empty interim state.
CREATE OR REPLACE FUNCTION public.capture_budget_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _budget public.budgets%ROWTYPE;
  _previous_version INTEGER;
  _previous_snapshot JSONB;
  _snapshot JSONB;
  _lines JSONB;
  _count INTEGER;
  _locked BOOLEAN;
  _action TEXT := 'updated';
BEGIN
  SELECT * INTO _budget FROM public.budgets WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(g.is_locked, FALSE) INTO _locked
  FROM public.budget_governance AS g WHERE g.budget_id = NEW.id;
  _locked := COALESCE(_locked, FALSE);

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'account_id', l.account_id,
          'account_code', a.code,
          'account_name', a.name,
          'period_month', l.period_month,
          'amount_minor', l.amount_minor
        ) ORDER BY l.account_id, l.period_month
      ),
      '[]'::jsonb
    )
  INTO _count, _lines
  FROM public.budget_lines AS l
  LEFT JOIN public.accounts AS a ON a.id = l.account_id
  WHERE l.budget_id = NEW.id;

  _snapshot := jsonb_build_object(
    'name', _budget.name,
    'fiscal_year_start', _budget.fiscal_year_start,
    'notes', _budget.notes,
    'locked', _locked,
    'lock_reason', (SELECT g.reason FROM public.budget_governance AS g
                   WHERE g.budget_id = NEW.id),
    'lines', _lines
  );

  SELECT version, snapshot INTO _previous_version, _previous_snapshot
  FROM public.budget_revisions
  WHERE budget_id = NEW.id
  ORDER BY version DESC LIMIT 1;

  IF _previous_snapshot = _snapshot THEN RETURN NULL; END IF;

  IF _previous_version IS NULL THEN
    _action := 'created';
  ELSIF COALESCE((_previous_snapshot->>'locked')::BOOLEAN, FALSE) IS DISTINCT FROM _locked THEN
    _action := CASE WHEN _locked THEN 'locked' ELSE 'unlocked' END;
  END IF;

  INSERT INTO public.budget_revisions (
    company_id, budget_id, version, recorded_by, action, line_count, snapshot
  ) VALUES (
    _budget.company_id, NEW.id, COALESCE(_previous_version, 0) + 1,
    auth.uid(), _action, _count, _snapshot
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_budget_revision() FROM PUBLIC, anon, authenticated;

-- Existing budgets receive a point-in-time starting snapshot, without modifying their values.
INSERT INTO public.budget_revisions (
  company_id, budget_id, version, recorded_at, recorded_by, action, line_count, snapshot
)
SELECT
  b.company_id, b.id, 1, now(), b.created_by, 'baseline',
  (SELECT COUNT(*)::INTEGER FROM public.budget_lines AS l WHERE l.budget_id = b.id),
  jsonb_build_object(
    'name', b.name, 'fiscal_year_start', b.fiscal_year_start,
    'notes', b.notes, 'locked', FALSE, 'lock_reason', NULL,
    'lines', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'account_id', l.account_id,
            'account_code', a.code,
            'account_name', a.name,
            'period_month', l.period_month,
            'amount_minor', l.amount_minor
          ) ORDER BY l.account_id, l.period_month
        )
        FROM public.budget_lines AS l
        LEFT JOIN public.accounts AS a ON a.id = l.account_id
        WHERE l.budget_id = b.id
      ),
      '[]'::jsonb
    )
  )
FROM public.budgets AS b
WHERE NOT EXISTS (SELECT 1 FROM public.budget_revisions WHERE budget_id = b.id);

-- Constraint triggers are deferred, so the new version sees all line changes from the RPC.
DROP TRIGGER IF EXISTS budget_capture_revision ON public.budgets;
CREATE CONSTRAINT TRIGGER budget_capture_revision
AFTER INSERT OR UPDATE ON public.budgets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.capture_budget_revision();

CREATE OR REPLACE FUNCTION public.reject_locked_budget_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _budget_id UUID;
BEGIN
  _budget_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  IF EXISTS (
    SELECT 1 FROM public.budget_governance AS g
    WHERE g.budget_id = _budget_id AND g.is_locked
  ) THEN
    RAISE EXCEPTION 'Budget is locked. Unlock it before editing or deleting.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_locked_budget_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS budget_guard_locked_header ON public.budgets;
CREATE TRIGGER budget_guard_locked_header
BEFORE UPDATE OR DELETE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.reject_locked_budget_mutation();

CREATE OR REPLACE FUNCTION public.reject_locked_budget_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  _old_budget_id UUID;
  _new_budget_id UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _old_budget_id := OLD.budget_id;
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN
    _new_budget_id := NEW.budget_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.budget_governance AS g
    WHERE g.is_locked
      AND (g.budget_id = _old_budget_id OR g.budget_id = _new_budget_id)
  ) THEN
    RAISE EXCEPTION 'Budget is locked. Unlock it before editing its amounts.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$;

REVOKE ALL ON FUNCTION public.reject_locked_budget_line_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS budget_guard_locked_lines ON public.budget_lines;
CREATE TRIGGER budget_guard_locked_lines
BEFORE INSERT OR UPDATE OR DELETE ON public.budget_lines
FOR EACH ROW EXECUTE FUNCTION public.reject_locked_budget_line_mutation();

-- A single privileged transition: permission + lock the budget row + change the
-- governance row + touch header to create a revision snapshot, all in one transaction.
CREATE OR REPLACE FUNCTION public.set_budget_lock(
  _company_id UUID,
  _budget_id UUID,
  _locked BOOLEAN,
  _reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid UUID := auth.uid();
  _budget public.budgets%ROWTYPE;
  _was_locked BOOLEAN;
  _reason_clean TEXT := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id)
    OR NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'Not permitted to change budget lock' USING ERRCODE = '42501';
  END IF;
  IF _reason_clean IS NULL OR char_length(_reason_clean) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Enter a reason between 3 and 500 characters';
  END IF;
  IF _locked IS NULL THEN RAISE EXCEPTION 'Lock state is required'; END IF;

  SELECT * INTO _budget FROM public.budgets
  WHERE id = _budget_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found in this organisation'; END IF;
  SELECT COALESCE(g.is_locked, FALSE) INTO _was_locked
  FROM public.budget_governance AS g WHERE g.budget_id = _budget_id;
  _was_locked := COALESCE(_was_locked, FALSE);
  IF _was_locked = _locked THEN
    RAISE EXCEPTION 'Budget lock state has already changed. Refresh and try again.';
  END IF;

  IF _locked THEN
    -- Touch while still unlocked. Deferred revision capture sees the final locked state.
    UPDATE public.budgets SET updated_at = clock_timestamp() WHERE id = _budget_id;
    INSERT INTO public.budget_governance (
      budget_id, company_id, is_locked, changed_by, changed_at, reason
    ) VALUES (_budget_id, _company_id, TRUE, _uid, clock_timestamp(), _reason_clean)
    ON CONFLICT (budget_id) DO UPDATE SET
      is_locked = TRUE, changed_by = EXCLUDED.changed_by,
      changed_at = EXCLUDED.changed_at, reason = EXCLUDED.reason;
  ELSE
    -- Unlock first, then touch the header; both actions roll back on failure.
    UPDATE public.budget_governance SET
      is_locked = FALSE, changed_by = _uid, changed_at = clock_timestamp(),
      reason = _reason_clean
    WHERE budget_id = _budget_id AND company_id = _company_id;
    UPDATE public.budgets SET updated_at = clock_timestamp() WHERE id = _budget_id;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    CASE WHEN _locked THEN 'budget.locked' ELSE 'budget.unlocked' END,
    'budget',
    _budget_id,
    jsonb_build_object('reason', _reason_clean, 'locked', _locked)
  );
  RETURN _locked;
END;
$$;

REVOKE ALL ON FUNCTION public.set_budget_lock(UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_budget_lock(UUID, UUID, BOOLEAN, TEXT)
  TO authenticated;
