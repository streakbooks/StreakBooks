-- Tax GL exception reviews: versioned workflow with immutable event history.
-- No journals, posted documents or filed tax returns are altered.
-- Staging verification required before applying to production.

CREATE TABLE IF NOT EXISTS public.tax_gl_review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  basis text NOT NULL CHECK (basis IN ('cash','accrual')),
  output_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  input_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note) <= 4000),
  comparison_snapshot text NOT NULL DEFAULT '' CHECK (length(comparison_snapshot) <= 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_gl_review_period_check CHECK (period_start <= period_end),
  CONSTRAINT tax_gl_review_accounts_distinct CHECK (output_account_id <> input_account_id),
  CONSTRAINT tax_gl_review_unique_scope UNIQUE (
    company_id, period_start, period_end, basis, output_account_id, input_account_id
  )
);

CREATE INDEX IF NOT EXISTS tax_gl_reviews_company_status_idx
 ON public.tax_gl_review_sessions(company_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.tax_gl_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.tax_gl_review_sessions(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','updated')),
  previous_status text,
  new_status text NOT NULL,
  previous_reviewer_id uuid,
  new_reviewer_id uuid,
  review_note text NOT NULL CHECK (length(review_note) <= 4000),
  comparison_snapshot text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_gl_review_events_scope_idx
 ON public.tax_gl_review_events (company_id, review_id, created_at, id);

ALTER TABLE public.tax_gl_review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_gl_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tax_gl_review_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tax_gl_review_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tax_gl_review_sessions TO authenticated;
GRANT SELECT ON TABLE public.tax_gl_review_events TO authenticated;

DROP POLICY IF EXISTS "Read tax GL review sessions" ON public.tax_gl_review_sessions;
CREATE POLICY "Read tax GL review sessions" ON public.tax_gl_review_sessions
 FOR SELECT TO authenticated
 USING (public.is_company_member(company_id) AND
        (public.has_company_permission(company_id,'accounting.view') OR
         public.has_company_permission(company_id,'tax.settings')));

DROP POLICY IF EXISTS "Read tax GL review events" ON public.tax_gl_review_events;
CREATE POLICY "Read tax GL review events" ON public.tax_gl_review_events
 FOR SELECT TO authenticated
 USING (public.is_company_member(company_id) AND
        (public.has_company_permission(company_id,'accounting.view') OR
         public.has_company_permission(company_id,'tax.settings')));

-- Only this tightly authorised RPC may write the review and its append-only events.
-- Row locking + expected-version prevents silent concurrent reviewer overwrites.
CREATE OR REPLACE FUNCTION public.save_tax_gl_review(
  _company_id uuid,
  _period_start date,
  _period_end date,
  _basis text,
  _output_account_id uuid,
  _input_account_id uuid,
  _status text,
  _review_note text,
  _reviewer_id uuid,
  _comparison_snapshot text,
  _expected_version integer
) RETURNS TABLE (review_id uuid, new_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  who uuid := auth.uid();
  existing public.tax_gl_review_sessions%ROWTYPE;
  saved_id uuid;
  saved_version integer;
  old_status text;
  old_reviewer uuid;
  kind text;
  normalized_note text := btrim(coalesce(_review_note,''));
BEGIN
  IF who IS NULL OR NOT public.is_company_member(_company_id)
    OR NOT public.has_company_permission(_company_id,'tax.settings')
    OR NOT public.has_company_permission(_company_id,'accounting.view') THEN
    RAISE EXCEPTION 'Not authorised to update tax GL review' USING ERRCODE='42501';
  END IF;

  IF _period_start IS NULL OR _period_end IS NULL OR _period_start > _period_end
    OR _basis NOT IN ('cash','accrual') OR _basis IS NULL
    OR _status NOT IN ('open','in_review','resolved') OR _status IS NULL
    OR _output_account_id IS NULL OR _input_account_id IS NULL
    OR _output_account_id = _input_account_id
    OR length(normalized_note) > 4000
    OR length(coalesce(_comparison_snapshot,'')) > 500 THEN
    RAISE EXCEPTION 'Invalid tax GL review request';
  END IF;

  IF _status = 'resolved' AND (
    _basis <> 'accrual' OR length(normalized_note) < 10
    OR nullif(_comparison_snapshot,'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Resolving requires accrual basis, a comparison snapshot and a meaningful note';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE id=_output_account_id AND company_id=_company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE id=_input_account_id AND company_id=_company_id
  ) THEN
    RAISE EXCEPTION 'Tax control accounts must belong to this organisation';
  END IF;

  IF _reviewer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id=_company_id AND user_id=_reviewer_id AND status='active'
  ) THEN
    RAISE EXCEPTION 'Assigned reviewer must be an active company member';
  END IF;

  SELECT * INTO existing FROM public.tax_gl_review_sessions
   WHERE company_id=_company_id AND period_start=_period_start AND period_end=_period_end
     AND basis=_basis AND output_account_id=_output_account_id
     AND input_account_id=_input_account_id
   FOR UPDATE;
  IF FOUND THEN
    IF _expected_version IS NULL OR _expected_version <> existing.version THEN
      RAISE EXCEPTION 'Review changed in another session. Refresh before saving.';
    END IF;
    -- An old resolution cannot remain resolved when its evidence has changed.
    IF existing.status = 'resolved' AND _status = 'resolved'
      AND existing.comparison_snapshot IS DISTINCT FROM _comparison_snapshot THEN
      RAISE EXCEPTION 'Reopen the changed review and document the new evidence before resolving it again';
    END IF;
    old_status := existing.status;
    old_reviewer := existing.reviewer_id;
    saved_id := existing.id;
    saved_version := existing.version + 1;
    kind := 'updated';
    UPDATE public.tax_gl_review_sessions
     SET status=_status, reviewer_id=_reviewer_id, review_note=normalized_note,
         comparison_snapshot=coalesce(_comparison_snapshot,''),
         version=saved_version, updated_by=who, updated_at=now()
     WHERE id=saved_id;
  ELSE
    IF _expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'Review was created in another session. Refresh before saving.';
    END IF;
    old_status := NULL;
    old_reviewer := NULL;
    saved_version := 1;
    kind := 'created';
    BEGIN
      INSERT INTO public.tax_gl_review_sessions (
        company_id,period_start,period_end,basis,output_account_id,input_account_id,
        status,reviewer_id,review_note,comparison_snapshot,version,created_by,updated_by
      ) VALUES (
        _company_id,_period_start,_period_end,_basis,_output_account_id,_input_account_id,
        _status,_reviewer_id,normalized_note,coalesce(_comparison_snapshot,''),1,who,who
      ) RETURNING id INTO saved_id;
    EXCEPTION WHEN unique_violation THEN
      -- Another reviewer created the same scoped review after our SELECT.
      -- Return an actionable concurrency message, never overwrite their work.
      RAISE EXCEPTION 'Review was created in another session. Refresh before saving.';
    END;
  END IF;

  INSERT INTO public.tax_gl_review_events (
    company_id,review_id,actor_user_id,event_type,previous_status,new_status,
    previous_reviewer_id,new_reviewer_id,review_note,comparison_snapshot,version
  ) VALUES (
    _company_id,saved_id,who,kind,old_status,_status,old_reviewer,_reviewer_id,
    normalized_note,coalesce(_comparison_snapshot,''),saved_version
  );
  RETURN QUERY SELECT saved_id, saved_version;
END;
$$;

REVOKE ALL ON FUNCTION public.save_tax_gl_review(
  uuid,date,date,text,uuid,uuid,text,text,uuid,text,integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tax_gl_review(
  uuid,date,date,text,uuid,uuid,text,text,uuid,text,integer
) TO authenticated;
