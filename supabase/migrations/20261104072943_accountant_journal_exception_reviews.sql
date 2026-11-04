-- Accountant journal exception dispositions: operational only, no ledger writes.
-- All mutations are performed by a permission-checked and version-guarded RPC.
CREATE TABLE public.accountant_journal_exception_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  finding_key text NOT NULL CHECK (length(finding_key) BETWEEN 40 AND 180),
  status text NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating','ready_for_review','reviewed')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  prepared_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  prepared_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT accountant_exception_one_per_finding
    UNIQUE (company_id, journal_id, finding_key),
  CONSTRAINT accountant_exception_prepared
    CHECK (status = 'investigating' OR (prepared_by IS NOT NULL AND prepared_at IS NOT NULL AND length(trim(note)) >= 3)),
  CONSTRAINT accountant_exception_reviewed
    CHECK (status <> 'reviewed' OR
      (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> prepared_by))
);

CREATE INDEX accountant_exception_review_queue
  ON public.accountant_journal_exception_reviews (company_id, status, updated_at DESC);

CREATE TABLE public.accountant_journal_exception_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.accountant_journal_exception_reviews(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('investigate','submit','approve','reopen')),
  note text NOT NULL CHECK (length(note) <= 2000),
  previous_state jsonb,
  next_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX accountant_exception_history_by_review
  ON public.accountant_journal_exception_events (company_id, review_id, created_at);

ALTER TABLE public.accountant_journal_exception_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_journal_exception_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.accountant_journal_exception_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.accountant_journal_exception_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accountant_journal_exception_reviews TO authenticated;
GRANT SELECT ON public.accountant_journal_exception_events TO authenticated;

CREATE POLICY accountant_exception_reviews_view ON public.accountant_journal_exception_reviews
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );
CREATE POLICY accountant_exception_events_view ON public.accountant_journal_exception_events
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );

CREATE FUNCTION public.save_accountant_journal_exception(
  _company_id uuid, _journal_id uuid, _finding_key text, _action text,
  _note text, _expected_version integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _work public.accountant_journal_exception_reviews;
  _before public.accountant_journal_exception_reviews;
  _previous jsonb;
  _note_value text := trim(coalesce(_note, ''));
  _exists boolean;
BEGIN
  IF auth.uid() IS NULL
     OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'accounting.post')
  THEN
    RAISE EXCEPTION 'Accounting exception management permission required'
      USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('investigate', 'submit', 'approve', 'reopen')
     OR _action IS NULL THEN
    RAISE EXCEPTION 'Invalid exception review action';
  END IF;
  IF _finding_key IS NULL OR length(_finding_key) NOT BETWEEN 40 AND 180
     OR left(_finding_key, length(_journal_id::text) + 1)
        <> _journal_id::text || ':'
     OR _finding_key !~ '^[a-z0-9:_-]+$' THEN
    RAISE EXCEPTION 'Invalid exception finding key';
  END IF;
  IF length(_note_value) > 2000 THEN
    RAISE EXCEPTION 'Exception review notes must be at most 2000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.journals j
    WHERE j.id = _journal_id
      AND j.company_id = _company_id
      AND j.status::text = 'posted'
      AND j.source_type::text = 'manual'
  ) THEN
    RAISE EXCEPTION 'Exception does not refer to a posted manual journal in this organisation'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _work
    FROM public.accountant_journal_exception_reviews
    WHERE company_id = _company_id AND journal_id = _journal_id
      AND finding_key = _finding_key
    FOR UPDATE;
  _exists := FOUND;
  IF _exists THEN
    _before := _work;
    _previous := to_jsonb(_before);
    IF _expected_version IS DISTINCT FROM _work.version THEN
      RAISE EXCEPTION 'Exception review changed. Refresh before continuing'
        USING ERRCODE = '40001';
    END IF;
  ELSIF _action <> 'investigate' OR _expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'Begin an investigation before submitting for review';
  END IF;

  IF _action = 'investigate' THEN
    IF _exists AND _work.status <> 'investigating' THEN
      RAISE EXCEPTION 'Reopen submitted or reviewed findings with a reason first';
    END IF;
    IF _exists THEN
      UPDATE public.accountant_journal_exception_reviews
         SET note = _note_value, updated_at = clock_timestamp(),
             version = version + 1
       WHERE id = _work.id RETURNING * INTO _work;
    ELSE
      INSERT INTO public.accountant_journal_exception_reviews
        (company_id, journal_id, finding_key, status, note, created_by)
      VALUES (_company_id, _journal_id, _finding_key, 'investigating', _note_value, auth.uid())
      RETURNING * INTO _work;
    END IF;
  ELSIF _action = 'submit' THEN
    IF NOT _exists OR _work.status <> 'investigating' OR length(_note_value) < 3 THEN
      RAISE EXCEPTION 'Record an investigation and a reason before submitting';
    END IF;
    UPDATE public.accountant_journal_exception_reviews
       SET status = 'ready_for_review', note = _note_value,
           prepared_by = auth.uid(), prepared_at = clock_timestamp(),
           reviewed_by = NULL, reviewed_at = NULL,
           updated_at = clock_timestamp(), version = version + 1
     WHERE id = _work.id RETURNING * INTO _work;
  ELSIF _action = 'approve' THEN
    IF NOT _exists OR _work.status <> 'ready_for_review'
       OR _work.prepared_by IS NULL OR _work.prepared_by = auth.uid()
       OR length(_note_value) < 3 THEN
      RAISE EXCEPTION 'Independent reviewer and written review conclusion required';
    END IF;
    UPDATE public.accountant_journal_exception_reviews
       SET status = 'reviewed', note = _note_value,
           reviewed_by = auth.uid(), reviewed_at = clock_timestamp(),
           updated_at = clock_timestamp(), version = version + 1
     WHERE id = _work.id RETURNING * INTO _work;
  ELSE
    IF NOT _exists OR _work.status = 'investigating' OR length(_note_value) < 3 THEN
      RAISE EXCEPTION 'A submitted or reviewed exception requires a reopening reason';
    END IF;
    UPDATE public.accountant_journal_exception_reviews
       SET status = 'investigating', note = _note_value,
           prepared_by = NULL, prepared_at = NULL,
           reviewed_by = NULL, reviewed_at = NULL,
           updated_at = clock_timestamp(), version = version + 1
     WHERE id = _work.id RETURNING * INTO _work;
  END IF;

  INSERT INTO public.accountant_journal_exception_events
    (company_id, review_id, actor_id, action, note, previous_state, next_state)
  VALUES (_company_id, _work.id, auth.uid(), _action, _note_value,
    _previous, to_jsonb(_work));

  PERFORM public.record_audit_event(
    _company_id, 'accountant.exception.' || _action,
    'accountant_journal_exception', _work.id,
    jsonb_build_object('before', _previous, 'after', to_jsonb(_work))
  );
  RETURN jsonb_build_object(
    'id', _work.id, 'status', _work.status, 'version', _work.version
  );
END $$;

REVOKE ALL ON FUNCTION public.save_accountant_journal_exception(uuid,uuid,text,text,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accountant_journal_exception(uuid,uuid,text,text,text,integer)
  TO authenticated;
