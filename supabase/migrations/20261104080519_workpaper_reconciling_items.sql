-- Workpaper reconciling-issue schedules. No changes to posted ledger or transaction engine.
-- Follow the existing account_workpapers permission and two-person sign-off boundary.
CREATE TABLE public.account_workpaper_reconciling_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workpaper_id uuid NOT NULL REFERENCES public.account_workpapers(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 500),
  amount_minor bigint NOT NULL CHECK (
    amount_minor <> 0
    AND abs(amount_minor::numeric) <= 9007199254740991
  ),
  evidence_reference text NOT NULL DEFAULT '' CHECK (length(evidence_reference) <= 300),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
  resolution_note text NOT NULL DEFAULT '' CHECK (length(resolution_note) <= 2000),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT workpaper_item_resolution_complete CHECK (
    state = 'open' OR (
      length(trim(resolution_note)) >= 3
      AND length(trim(evidence_reference)) >= 3
      AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
    )
  )
);
CREATE INDEX workpaper_reconciling_item_queue ON public.account_workpaper_reconciling_items
  (company_id, workpaper_id, state, created_at);

CREATE TABLE public.account_workpaper_reconciling_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workpaper_id uuid NOT NULL REFERENCES public.account_workpapers(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.account_workpaper_reconciling_items(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('add','update','resolve','reopen')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 2000),
  previous_state jsonb,
  next_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX workpaper_reconciling_events_history ON public.account_workpaper_reconciling_item_events
  (company_id, workpaper_id, item_id, created_at);

ALTER TABLE public.account_workpaper_reconciling_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_workpaper_reconciling_item_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_workpaper_reconciling_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.account_workpaper_reconciling_item_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_workpaper_reconciling_items TO authenticated;
GRANT SELECT ON public.account_workpaper_reconciling_item_events TO authenticated;
CREATE POLICY workpaper_reconciling_items_read ON public.account_workpaper_reconciling_items
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );
CREATE POLICY workpaper_reconciling_events_read ON public.account_workpaper_reconciling_item_events
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );

-- A parent cannot be prepared or reviewed while reconciling differences remain unresolved.
-- This trigger applies even when callers bypass the UI and use save_account_workpaper RPC.
CREATE FUNCTION public.guard_account_workpaper_reconciling_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('prepared','reviewed') AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1 FROM public.account_workpaper_reconciling_items i
       WHERE i.company_id = NEW.company_id
         AND i.workpaper_id = NEW.id AND i.state = 'open'
     ) THEN
    RAISE EXCEPTION 'Resolve every open reconciling item before preparing this workpaper';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_workpaper_reconciling_gate
  BEFORE UPDATE OF status ON public.account_workpapers
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_workpaper_reconciling_items();
REVOKE ALL ON FUNCTION public.guard_account_workpaper_reconciling_items() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_account_workpaper_reconciling_item(
  _company_id uuid, _workpaper_id uuid, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _parent public.account_workpapers;
  _item public.account_workpaper_reconciling_items;
  _previous jsonb;
  _action text;
  _item_id uuid;
  _version integer;
  _description text;
  _amount bigint;
  _evidence text;
  _reason text;
  _existing boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'accounting.post') THEN
    RAISE EXCEPTION 'Accountant workpaper editing permission required' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid reconciling item payload';
  END IF;
  _action := _payload->>'action';
  IF _action IS NULL OR _action NOT IN ('add','update','resolve','reopen') THEN
    RAISE EXCEPTION 'Invalid reconciling item action';
  END IF;

  SELECT * INTO _parent FROM public.account_workpapers
    WHERE id = _workpaper_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workpaper not found in this organisation' USING ERRCODE='42501';
  END IF;
  IF _parent.status <> 'draft' THEN
    RAISE EXCEPTION 'Reopen the signed-off workpaper before changing reconciling items';
  END IF;

  _item_id := nullif(_payload->>'id','')::uuid;
  _version := nullif(_payload->>'version','')::integer;
  _description := trim(coalesce(_payload->>'description',''));
  _reason := trim(coalesce(_payload->>'reason',''));
  _evidence := trim(coalesce(_payload->>'evidenceReference',''));
  IF length(_reason) > 2000 OR length(_evidence) > 300 THEN
    RAISE EXCEPTION 'Reconciling item evidence or reason is too long';
  END IF;
  IF _action = 'add' AND (_item_id IS NOT NULL OR _version IS NOT NULL) THEN
    RAISE EXCEPTION 'A new item cannot supply a saved identity';
  END IF;

  IF _action <> 'add' THEN
    IF _item_id IS NULL OR _version IS NULL THEN
      RAISE EXCEPTION 'Item ID and current version required';
    END IF;
    SELECT * INTO _item FROM public.account_workpaper_reconciling_items
      WHERE id = _item_id AND company_id = _company_id AND workpaper_id = _workpaper_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reconciling item not found in this workpaper' USING ERRCODE='42501';
    END IF;
    _existing := true;
    _previous := to_jsonb(_item);
    IF _version IS DISTINCT FROM _item.version THEN
      RAISE EXCEPTION 'Reconciling item changed; refresh and retry' USING ERRCODE='40001';
    END IF;
  END IF;

  IF _action IN ('add','update') THEN
    IF _action = 'update' AND _item.state <> 'open' THEN
      RAISE EXCEPTION 'Reopen a resolved item before changing its evidence';
    END IF;
    IF length(_description) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION 'Enter a description of 3 to 500 characters';
    END IF;
    IF coalesce(_payload->>'amountMinor','') !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION 'Enter an exact signed amount in minor units';
    END IF;
    _amount := (_payload->>'amountMinor')::bigint;
    IF _amount = 0 OR abs(_amount::numeric) > 9007199254740991 THEN
      RAISE EXCEPTION 'Reconciling item must have a nonzero safe amount';
    END IF;
    IF _action = 'add' THEN
      INSERT INTO public.account_workpaper_reconciling_items (
        company_id, workpaper_id, description, amount_minor, evidence_reference,
        created_by, updated_by
      ) VALUES (
        _company_id, _workpaper_id, _description, _amount, _evidence,
        auth.uid(), auth.uid()
      ) RETURNING * INTO _item;
    ELSE
      UPDATE public.account_workpaper_reconciling_items SET
        description = _description, amount_minor = _amount, evidence_reference = _evidence,
        updated_by = auth.uid(), updated_at = clock_timestamp(), version = version + 1
      WHERE id = _item.id RETURNING * INTO _item;
    END IF;
  ELSIF _action = 'resolve' THEN
    IF _item.state <> 'open' OR length(_reason) < 3
       OR length(trim(_item.evidence_reference)) < 3 THEN
      RAISE EXCEPTION 'An open item needs a resolution reason and saved evidence reference';
    END IF;
    UPDATE public.account_workpaper_reconciling_items SET
      state = 'resolved', resolution_note = _reason,
      resolved_by = auth.uid(), resolved_at = clock_timestamp(),
      updated_by = auth.uid(), updated_at = clock_timestamp(), version = version + 1
    WHERE id = _item.id RETURNING * INTO _item;
  ELSE
    IF _item.state <> 'resolved' OR length(_reason) < 3 THEN
      RAISE EXCEPTION 'A resolved item requires a reopening reason';
    END IF;
    UPDATE public.account_workpaper_reconciling_items SET
      state = 'open', resolution_note = _reason,
      resolved_by = NULL, resolved_at = NULL,
      updated_by = auth.uid(), updated_at = clock_timestamp(), version = version + 1
    WHERE id = _item.id RETURNING * INTO _item;
  END IF;

  -- Invalidates stale parent form versions and serializes prepare vs item changes.
  UPDATE public.account_workpapers
    SET version = version + 1, updated_at = clock_timestamp()
    WHERE id = _workpaper_id;

  INSERT INTO public.account_workpaper_reconciling_item_events (
    company_id, workpaper_id, item_id, actor_id, action, reason, previous_state, next_state
  ) VALUES (
    _company_id, _workpaper_id, _item.id, auth.uid(), _action, _reason,
    _previous, to_jsonb(_item)
  );
  PERFORM public.record_audit_event(
    _company_id, 'account_workpaper.item.' || _action,
    'account_workpaper_reconciling_item', _item.id,
    jsonb_build_object('before', _previous, 'after', to_jsonb(_item))
  );
  RETURN jsonb_build_object('id', _item.id, 'state', _item.state, 'version', _item.version);
END $$;

REVOKE ALL ON FUNCTION public.save_account_workpaper_reconciling_item(uuid,uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account_workpaper_reconciling_item(uuid,uuid,jsonb)
  TO authenticated;
