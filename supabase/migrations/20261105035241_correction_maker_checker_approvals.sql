-- Transaction correction maker/checker approval gate.
-- OFF by default per company: existing correction posting behaviour is unchanged.
-- When enabled, a database trigger rejects direct apply RPCs without independent
-- authorisation bound to the exact preview, request key, items and posting policy.
-- Deploy to development/staging and verify before production; do not auto-enable.
INSERT INTO public.role_permissions(role, permission)
VALUES ('owner', 'journals.approve'), ('admin', 'journals.approve'),
       ('accountant', 'journals.approve')
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE public.correction_approval_policies (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.correction_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{32}$'),
  preview_hash text NOT NULL CHECK (preview_hash ~ '^[a-f0-9]{32}$'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'posted')),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  posted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  posted_batch_id uuid UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (company_id, request_key),
  CONSTRAINT correction_approval_independent CHECK (
    decided_by IS NULL OR decided_by <> submitted_by
  ),
  CONSTRAINT correction_approval_decision_consistency CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status IN ('approved', 'rejected', 'posted')
      AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT correction_approval_post_consistency CHECK (
    (status = 'posted' AND posted_by IS NOT NULL
      AND posted_at IS NOT NULL AND posted_batch_id IS NOT NULL)
    OR (status <> 'posted' AND posted_by IS NULL
      AND posted_at IS NULL AND posted_batch_id IS NULL)
  )
);

CREATE INDEX correction_approval_queue
  ON public.correction_approval_requests(company_id, status, submitted_at DESC, id);

CREATE TABLE public.correction_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL REFERENCES public.correction_approval_requests(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('submit', 'approve', 'reject', 'post')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  from_status text,
  to_status text NOT NULL,
  request_hash text NOT NULL,
  preview_hash text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX correction_approval_event_history
  ON public.correction_approval_events(company_id, approval_id, created_at, id);

ALTER TABLE public.correction_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.correction_approval_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.correction_approval_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.correction_approval_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.correction_approval_policies TO authenticated;
GRANT SELECT ON public.correction_approval_requests TO authenticated;
GRANT SELECT ON public.correction_approval_events TO authenticated;

CREATE POLICY correction_approval_policy_read ON public.correction_approval_policies
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );
CREATE POLICY correction_approval_requests_read ON public.correction_approval_requests
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );
CREATE POLICY correction_approval_events_read ON public.correction_approval_events
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );

-- Ledger audit evidence is append-only, including for privileged SQL callers.
CREATE FUNCTION private.prevent_correction_approval_event_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Correction approval events are immutable' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER correction_approval_events_immutable
BEFORE UPDATE OR DELETE ON public.correction_approval_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_correction_approval_event_rewrite();
REVOKE ALL ON FUNCTION private.prevent_correction_approval_event_rewrite()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_correction_approval_settings(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE _required boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'accounting.view') THEN
    RAISE EXCEPTION 'Accounting view permission required' USING ERRCODE = '42501';
  END IF;
  SELECT p.required INTO _required FROM public.correction_approval_policies p
  WHERE p.company_id = _company_id;
  RETURN jsonb_build_object(
    'required', coalesce(_required, false),
    'user_id', auth.uid(),
    'can_approve', public.has_company_permission(_company_id, 'journals.approve'),
    'can_configure', public.has_company_permission(_company_id, 'company.settings.edit')
  );
END $$;
REVOKE ALL ON FUNCTION public.get_correction_approval_settings(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_correction_approval_settings(uuid) TO authenticated;

CREATE FUNCTION public.set_correction_approval_policy(_company_id uuid, _required boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _old boolean; _next public.correction_approval_policies;
BEGIN
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Organisation settings permission required' USING ERRCODE = '42501';
  END IF;
  IF _required IS NULL THEN RAISE EXCEPTION 'Choose an approval policy'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text, 29));
  SELECT p.required INTO _old FROM public.correction_approval_policies p
  WHERE p.company_id = _company_id FOR UPDATE;
  INSERT INTO public.correction_approval_policies(company_id, required, updated_by)
  VALUES (_company_id, _required, auth.uid())
  ON CONFLICT (company_id) DO UPDATE
  SET required = EXCLUDED.required, updated_by = EXCLUDED.updated_by,
      updated_at = clock_timestamp()
  RETURNING * INTO _next;
  IF _old IS DISTINCT FROM _required THEN
    PERFORM public.record_audit_event(
      _company_id, 'transaction_correction.approval_policy_changed',
      'correction_approval_policy', _company_id,
      jsonb_build_object('before', _old, 'after', _required, 'actor', auth.uid())
    );
  END IF;
  RETURN jsonb_build_object('required', _next.required);
END $$;
REVOKE ALL ON FUNCTION public.set_correction_approval_policy(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_correction_approval_policy(uuid, boolean) TO authenticated;

CREATE FUNCTION public.submit_correction_for_approval(
  _company_id uuid, _request_key uuid, _preview_hash text,
  _items jsonb, _target_id uuid, _mode text, _date date, _reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _work public.correction_approval_requests; _plan jsonb;
  _hash text; _reason_value text := trim(coalesce(_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'journals.manual')
     OR NOT public.has_company_permission(_company_id, 'accounting.post') THEN
    RAISE EXCEPTION 'Manual journal and posting permissions required'
      USING ERRCODE = '42501';
  END IF;
  IF _request_key IS NULL OR _preview_hash IS NULL
     OR _preview_hash !~ '^[a-f0-9]{32}$'
     OR length(_reason_value) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Valid request reference, preview and supporting reason required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text, 29));
  IF NOT EXISTS (SELECT 1 FROM public.correction_approval_policies
                 WHERE company_id = _company_id AND required) THEN
    RAISE EXCEPTION 'Approval policy is not enabled for this organisation';
  END IF;
  _hash := md5(jsonb_build_object(
    'items', (SELECT jsonb_agg(value ORDER BY value->>'id')
              FROM jsonb_array_elements(_items)),
    'target', _target_id, 'mode', _mode, 'date', _date, 'reason', _reason_value
  )::text);
  SELECT * INTO _work FROM public.correction_approval_requests
  WHERE company_id = _company_id AND request_key = _request_key FOR UPDATE;
  IF FOUND THEN
    IF _work.request_hash IS DISTINCT FROM _hash
       OR _work.preview_hash IS DISTINCT FROM _preview_hash
       OR _work.submitted_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Request key already belongs to a different correction';
    END IF;
    RETURN to_jsonb(_work);
  END IF;
  -- Keep the preview tied to the current ledger, account and period snapshot.
  PERFORM 1 FROM public.accounts WHERE company_id = _company_id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.accounting_periods WHERE company_id = _company_id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.organisation_lock_policy WHERE company_id = _company_id FOR SHARE;
  _plan := private.correction_plan(
    _company_id, _items, _target_id, _mode, _date, _reason_value
  );
  IF _preview_hash IS DISTINCT FROM md5(_plan::text) THEN
    RAISE EXCEPTION 'Correction preview changed; preview and submit again'
      USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.correction_approval_requests(
    company_id, request_key, request_hash, preview_hash, input, plan, submitted_by
  ) VALUES (
    _company_id, _request_key, _hash, _preview_hash,
    jsonb_build_object(
      'companyId', _company_id, 'items', _items, 'targetId', _target_id,
      'mode', _mode, 'date', _date, 'reason', _reason_value
    ), _plan, auth.uid()
  ) RETURNING * INTO _work;
  INSERT INTO public.correction_approval_events(
    company_id, approval_id, actor_id, action, note, from_status, to_status,
    request_hash, preview_hash, version
  ) VALUES (
    _company_id, _work.id, auth.uid(), 'submit', _reason_value, NULL, 'pending',
    _work.request_hash, _work.preview_hash, _work.version
  );
  PERFORM public.record_audit_event(
    _company_id, 'transaction_correction.approval_submitted',
    'correction_approval_request', _work.id,
    jsonb_build_object('request_key', _request_key, 'preview_hash', _preview_hash)
  );
  RETURN to_jsonb(_work);
END $$;
REVOKE ALL ON FUNCTION public.submit_correction_for_approval(
  uuid, uuid, text, jsonb, uuid, text, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_correction_for_approval(
  uuid, uuid, text, jsonb, uuid, text, date, text
) TO authenticated;

CREATE FUNCTION public.decide_correction_approval(
  _company_id uuid, _approval_id uuid, _approve boolean,
  _note text, _expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _work public.correction_approval_requests; _plan jsonb;
  _before jsonb; _note_value text := trim(coalesce(_note, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'journals.approve') THEN
    RAISE EXCEPTION 'Journal approval permission required' USING ERRCODE = '42501';
  END IF;
  IF _approve IS NULL OR length(_note_value) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'A decision and written review reason of 5-1000 characters are required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text, 29));
  SELECT * INTO _work FROM public.correction_approval_requests
  WHERE id = _approval_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Correction approval not found'; END IF;
  IF _work.status <> 'pending' OR _work.version IS DISTINCT FROM _expected_version THEN
    RAISE EXCEPTION 'Approval changed; refresh before deciding' USING ERRCODE = '40001';
  END IF;
  IF _work.submitted_by = auth.uid() THEN
    RAISE EXCEPTION 'The maker cannot approve or reject their own correction'
      USING ERRCODE = '42501';
  END IF;
  IF _approve THEN
    _plan := private.correction_plan(
      _company_id, _work.input->'items', (_work.input->>'targetId')::uuid,
      _work.input->>'mode', (_work.input->>'date')::date,
      _work.input->>'reason'
    );
    IF _work.preview_hash IS DISTINCT FROM md5(_plan::text) THEN
      RAISE EXCEPTION 'Correction evidence changed; maker must preview and resubmit'
        USING ERRCODE = '40001';
    END IF;
  END IF;
  _before := to_jsonb(_work);
  UPDATE public.correction_approval_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(), decided_at = clock_timestamp(),
        decision_note = _note_value, version = version + 1
  WHERE id = _work.id RETURNING * INTO _work;
  INSERT INTO public.correction_approval_events(
    company_id, approval_id, actor_id, action, note, from_status, to_status,
    request_hash, preview_hash, version
  ) VALUES (
    _company_id, _work.id, auth.uid(),
    CASE WHEN _approve THEN 'approve' ELSE 'reject' END,
    _note_value, 'pending', _work.status, _work.request_hash, _work.preview_hash,
    _work.version
  );
  PERFORM public.record_audit_event(
    _company_id, 'transaction_correction.approval_decided',
    'correction_approval_request', _work.id,
    jsonb_build_object('before', _before, 'after', to_jsonb(_work))
  );
  RETURN to_jsonb(_work);
END $$;
REVOKE ALL ON FUNCTION public.decide_correction_approval(
  uuid, uuid, boolean, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_correction_approval(
  uuid, uuid, boolean, text, integer
) TO authenticated;

-- Enforced at the batch table, not only the frontend or the server handler:
-- the old apply_transaction_correction RPC cannot insert a batch around it.
CREATE FUNCTION private.enforce_correction_approval_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _work public.correction_approval_requests;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.correction_approval_policies
    WHERE company_id = NEW.company_id AND required
  ) THEN RETURN NEW; END IF;
  SELECT * INTO _work FROM public.correction_approval_requests
  WHERE company_id = NEW.company_id AND request_key = NEW.request_key FOR UPDATE;
  IF NOT FOUND OR _work.status <> 'approved'
     OR _work.submitted_by IS DISTINCT FROM auth.uid()
     OR _work.decided_by IS NULL OR _work.decided_by = _work.submitted_by
     OR _work.request_hash IS DISTINCT FROM NEW.request_hash
     OR _work.preview_hash IS DISTINCT FROM NEW.preview_hash
     OR _work.plan IS DISTINCT FROM NEW.plan THEN
    RAISE EXCEPTION 'Independent approval of this exact correction is required before posting'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.correction_approval_requests
    SET status = 'posted', posted_by = auth.uid(),
        posted_at = clock_timestamp(), posted_batch_id = NEW.id,
        version = version + 1
  WHERE id = _work.id RETURNING * INTO _work;
  INSERT INTO public.correction_approval_events(
    company_id, approval_id, actor_id, action, note, from_status, to_status,
    request_hash, preview_hash, version
  ) VALUES (
    NEW.company_id, _work.id, auth.uid(), 'post', '', 'approved', 'posted',
    _work.request_hash, _work.preview_hash, _work.version
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_correction_approval_on_insert()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER correction_batch_requires_independent_approval
AFTER INSERT ON public.transaction_correction_batches
FOR EACH ROW EXECUTE FUNCTION private.enforce_correction_approval_on_insert();
