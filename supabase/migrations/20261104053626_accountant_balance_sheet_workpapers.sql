-- Account-level balance-sheet workpapers. Operational evidence only:
-- never updates journals, tax filings, reconciliation links or accounting periods.
CREATE TABLE public.account_workpapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  as_of date NOT NULL,
  gl_balance_minor bigint NOT NULL,
  supporting_balance_minor bigint,
  evidence_reference text NOT NULL DEFAULT '' CHECK (length(evidence_reference) <= 300),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 4000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'prepared', 'reviewed')),
  prepared_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  prepared_at timestamptz,
  reviewed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT account_workpapers_uniq UNIQUE (company_id, account_id, as_of),
  CONSTRAINT account_workpapers_safe_gl CHECK (abs(gl_balance_minor::numeric) <= 9007199254740991),
  CONSTRAINT account_workpapers_safe_support CHECK (
    supporting_balance_minor IS NULL OR
    abs(supporting_balance_minor::numeric) <= 9007199254740991
  ),
  CONSTRAINT account_workpapers_prepared CHECK (
    status = 'draft' OR
    (prepared_by IS NOT NULL AND prepared_at IS NOT NULL
      AND supporting_balance_minor = gl_balance_minor
      AND length(trim(evidence_reference)) >= 3)
  ),
  CONSTRAINT account_workpapers_reviewed CHECK (
    status <> 'reviewed' OR
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by <> prepared_by)
  )
);
CREATE INDEX account_workpapers_review_queue ON public.account_workpapers
  (company_id, as_of, status, account_id);

ALTER TABLE public.account_workpapers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_workpapers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_workpapers TO authenticated;
CREATE POLICY account_workpapers_view ON public.account_workpapers
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.mfa_requirement_met())
    AND public.has_company_permission(company_id, 'accounting.view')
  );

-- A single atomic, version-guarded mutation path. Reject stale GL snapshots,
-- invalid account/company combinations and self-review. Audit is transactional.
CREATE FUNCTION public.save_account_workpaper(_company_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _work public.account_workpapers;
  _before public.account_workpapers;
  _account uuid;
  _as_of date;
  _action text;
  _gl bigint;
  _submitted_gl bigint;
  _support bigint;
  _reference text;
  _note text;
  _existing boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.mfa_requirement_met()
     OR NOT public.has_company_permission(_company_id, 'accounting.post') THEN
    RAISE EXCEPTION 'Accounting workpaper management permission required'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid workpaper request';
  END IF;
  _action := coalesce(_payload->>'action', 'save');
  IF _action NOT IN ('save', 'prepare', 'review', 'reopen') THEN
    RAISE EXCEPTION 'Invalid workpaper action';
  END IF;
  _account := nullif(_payload->>'accountId', '')::uuid;
  IF _account IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = _account AND a.company_id = _company_id
         AND a.is_postable AND a.account_type::text IN ('asset', 'liability', 'equity')
     ) THEN
    RAISE EXCEPTION 'This is not a postable balance-sheet account in the organisation'
      USING ERRCODE = '42501';
  END IF;
  IF coalesce(_payload->>'asOf', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Enter a valid workpaper date';
  END IF;
  _as_of := (_payload->>'asOf')::date;
  _submitted_gl := nullif(_payload->>'ledgerBalanceMinor', '')::bigint;

  SELECT coalesce((
    SELECT debit_minor - credit_minor
    FROM public.ledger_balances(_company_id, NULL::date, _as_of, false)
    WHERE account_id = _account
  ), 0)::bigint INTO _gl;
  IF abs(_gl::numeric) > 9007199254740991 OR
     _submitted_gl IS NULL OR _submitted_gl IS DISTINCT FROM _gl THEN
    RAISE EXCEPTION 'Ledger balance has changed or exceeds the safe review range. Refresh the trial balance';
  END IF;

  SELECT * INTO _work FROM public.account_workpapers
    WHERE company_id = _company_id AND account_id = _account AND as_of = _as_of
    FOR UPDATE;
  _existing := FOUND;
  IF _existing THEN
    _before := _work;
    IF (_payload->>'version')::integer IS DISTINCT FROM _work.version THEN
      RAISE EXCEPTION 'Workpaper changed. Refresh before saving'
        USING ERRCODE = '40001';
    END IF;
    IF nullif(_payload->>'id', '')::uuid IS DISTINCT FROM _work.id THEN
      RAISE EXCEPTION 'Incorrect workpaper identity';
    END IF;
  ELSIF _action <> 'save' OR _payload ? 'id' THEN
    RAISE EXCEPTION 'Save a draft workpaper before submitting it for review';
  END IF;

  IF _action = 'save' THEN
    IF _existing AND _work.status <> 'draft' THEN
      RAISE EXCEPTION 'Reopen signed-off work before editing its evidence';
    END IF;
    _support := nullif(_payload->>'supportingBalanceMinor', '')::bigint;
    _reference := coalesce(trim(_payload->>'evidenceReference'), '');
    _note := coalesce(trim(_payload->>'note'), '');
    IF length(_reference) > 300 OR length(_note) > 4000
       OR (_support IS NOT NULL AND abs(_support::numeric) > 9007199254740991) THEN
      RAISE EXCEPTION 'Invalid workpaper evidence or amount';
    END IF;
    IF _existing THEN
      UPDATE public.account_workpapers
        SET gl_balance_minor = _gl,
            supporting_balance_minor = _support,
            evidence_reference = _reference,
            note = _note,
            version = version + 1,
            updated_at = clock_timestamp()
        WHERE id = _work.id RETURNING * INTO _work;
    ELSE
      INSERT INTO public.account_workpapers (
        company_id, account_id, as_of, gl_balance_minor, supporting_balance_minor,
        evidence_reference, note, created_by
      ) VALUES (
        _company_id, _account, _as_of, _gl, _support,
        _reference, _note, auth.uid()
      ) RETURNING * INTO _work;
    END IF;
  ELSIF _action = 'prepare' THEN
    IF _work.status <> 'draft'
       OR _work.supporting_balance_minor IS NULL
       OR _work.supporting_balance_minor <> _gl
       OR length(trim(_work.evidence_reference)) < 3 THEN
      RAISE EXCEPTION 'A matching supporting balance and evidence reference are required';
    END IF;
    UPDATE public.account_workpapers
      SET status = 'prepared', gl_balance_minor = _gl,
          prepared_by = auth.uid(), prepared_at = clock_timestamp(),
          reviewed_by = NULL, reviewed_at = NULL, version = version + 1,
          updated_at = clock_timestamp()
      WHERE id = _work.id RETURNING * INTO _work;
  ELSIF _action = 'review' THEN
    IF _work.status <> 'prepared' OR _work.prepared_by IS NULL
       OR _work.prepared_by = auth.uid() THEN
      RAISE EXCEPTION 'An independent reviewer must approve prepared work';
    END IF;
    IF _work.gl_balance_minor <> _gl OR _work.supporting_balance_minor IS DISTINCT FROM _gl THEN
      RAISE EXCEPTION 'Ledger balance or evidence changed. Reopen and reprepare';
    END IF;
    UPDATE public.account_workpapers
      SET status = 'reviewed', reviewed_by = auth.uid(),
          reviewed_at = clock_timestamp(), version = version + 1,
          updated_at = clock_timestamp()
      WHERE id = _work.id RETURNING * INTO _work;
  ELSE
    _note := trim(coalesce(_payload->>'note', ''));
    IF NOT _existing OR _work.status = 'draft' OR length(_note) < 3 OR length(_note) > 4000 THEN
      RAISE EXCEPTION 'State a reason to reopen prepared or reviewed work';
    END IF;
    UPDATE public.account_workpapers
      SET status = 'draft', note = _note, gl_balance_minor = _gl,
          prepared_by = NULL, prepared_at = NULL,
          reviewed_by = NULL, reviewed_at = NULL,
          version = version + 1, updated_at = clock_timestamp()
      WHERE id = _work.id RETURNING * INTO _work;
  END IF;

  PERFORM public.record_audit_event(
    _company_id, 'account_workpaper.' || _action, 'account_workpaper', _work.id,
    jsonb_build_object('before', to_jsonb(_before), 'after', to_jsonb(_work))
  );
  RETURN jsonb_build_object('id', _work.id, 'status', _work.status, 'version', _work.version);
END $$;

REVOKE ALL ON FUNCTION public.save_account_workpaper(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account_workpaper(uuid, jsonb) TO authenticated;
