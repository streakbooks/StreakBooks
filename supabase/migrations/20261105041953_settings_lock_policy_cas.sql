-- Atomic optimistic-concurrency guard for Accounting lock policies.
-- Existing set_organisation_lock_policy RPC remains callable for compatibility:
-- its writes also advance the version, so new clients detect stale drafts.
ALTER TABLE public.organisation_lock_policy
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_organisation_lock_policy_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := GREATEST(
    pg_catalog.clock_timestamp(),
    OLD.updated_at + INTERVAL '1 microsecond'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_organisation_lock_policy_version()
  FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS bump_organisation_lock_policy_version
  ON public.organisation_lock_policy;

CREATE TRIGGER bump_organisation_lock_policy_version
  BEFORE UPDATE ON public.organisation_lock_policy
  FOR EACH ROW EXECUTE FUNCTION public.bump_organisation_lock_policy_version();

CREATE OR REPLACE FUNCTION public.set_organisation_lock_policy_if_unchanged(
  _company_id UUID,
  _expected_version BIGINT,
  _lock_date_everyone DATE,
  _lock_date_except_advisors DATE,
  _conversion_date DATE,
  _require_override_reason BOOLEAN,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _current_version BIGINT;
  _created_version BIGINT;
  _saved JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'periods.lock') THEN
    RAISE EXCEPTION 'You do not have permission to change lock dates'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the tenant key even if a lock-policy row does not yet exist.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    20261105, pg_catalog.hashtext(_company_id::text)
  );

  SELECT version INTO _current_version
    FROM public.organisation_lock_policy
   WHERE company_id = _company_id
   FOR UPDATE;

  IF FOUND THEN
    IF _expected_version IS DISTINCT FROM _current_version THEN
      RAISE EXCEPTION 'Lock policy changed in another session. Reload latest policy.'
        USING ERRCODE = '40001';
    END IF;
  ELSE
    IF _expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'Lock policy changed in another session. Reload latest policy.'
        USING ERRCODE = '40001';
    END IF;
    -- Reserve the initial row: legacy INSERTs arriving at the same time
    -- must not be silently overwritten on their ON CONFLICT paths.
    INSERT INTO public.organisation_lock_policy(company_id)
    VALUES (_company_id)
    ON CONFLICT (company_id) DO NOTHING
    RETURNING version INTO _created_version;
    IF _created_version IS NULL THEN
      RAISE EXCEPTION 'Lock policy changed in another session. Reload latest policy.'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  -- Reuse the established permission, date-order, unlock, audit and posting safeguards.
  -- The existing function's UPSERT runs in the same transaction and row lock.
  PERFORM public.set_organisation_lock_policy(
    _company_id,
    _lock_date_everyone,
    _lock_date_except_advisors,
    _conversion_date,
    _require_override_reason,
    _reason
  );

  SELECT jsonb_build_object(
    'version', version,
    'updated_at', updated_at,
    'lock_date_everyone', lock_date_everyone,
    'lock_date_except_advisors', lock_date_except_advisors,
    'conversion_date', conversion_date,
    'require_override_reason', require_override_reason
  ) INTO _saved
  FROM public.organisation_lock_policy
  WHERE company_id = _company_id;

  RETURN _saved;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organisation_lock_policy_if_unchanged(
  UUID, BIGINT, DATE, DATE, DATE, BOOLEAN, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_organisation_lock_policy_if_unchanged(
  UUID, BIGINT, DATE, DATE, DATE, BOOLEAN, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.set_organisation_lock_policy_if_unchanged(
  UUID, BIGINT, DATE, DATE, DATE, BOOLEAN, TEXT
) IS 'Compare-and-set Accounting lock policy, preserving existing permission and audit rules.';
