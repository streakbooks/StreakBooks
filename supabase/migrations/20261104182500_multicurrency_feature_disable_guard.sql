-- Keep multicurrency feature disabling consistent with enabled company currencies.
-- This is an additive guard: no existing currency selections, documents, or ledger data change.
-- The lock ID matches replace_company_currencies_atomic, so the two settings write
-- paths cannot race between a currency selection and a feature disable.

CREATE OR REPLACE FUNCTION public.guard_multicurrency_feature_disable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.feature_key <> 'multicurrency' OR NEW.enabled IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Serialize with the currency replacement RPC, including first-row creation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    20261104, pg_catalog.hashtext(NEW.company_id::text)
  );

  IF EXISTS (
    SELECT 1
    FROM public.company_currencies c
    WHERE c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION
      'Multicurrency cannot be disabled while additional currencies are configured.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_multicurrency_feature_disable()
  FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS guard_multicurrency_feature_disable
  ON public.organisation_features;

CREATE TRIGGER guard_multicurrency_feature_disable
  BEFORE INSERT OR UPDATE OF enabled ON public.organisation_features
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_multicurrency_feature_disable();

COMMENT ON FUNCTION public.guard_multicurrency_feature_disable() IS
  'Transactional safety guard: prevent disabling multicurrency while company currencies are configured.';

-- Currency entries created through direct table access must share the lock as well;
-- otherwise a direct INSERT could race with an in-flight feature disable.
-- Explicitly disabled organisations must enable multicurrency before adding
-- transaction currencies again. A missing feature row retains legacy behavior.
CREATE OR REPLACE FUNCTION public.guard_currency_add_when_feature_disabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Currency entries cannot be reassigned to another organisation.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    20261104, pg_catalog.hashtext(NEW.company_id::text)
  );

  IF EXISTS (
    SELECT 1 FROM public.organisation_features f
    WHERE f.company_id = NEW.company_id
      AND f.feature_key = 'multicurrency'
      AND f.enabled IS FALSE
  ) THEN
    RAISE EXCEPTION
      'Enable multicurrency before adding or editing foreign currencies.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_currency_add_when_feature_disabled()
  FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS guard_currency_add_when_feature_disabled
  ON public.company_currencies;

CREATE TRIGGER guard_currency_add_when_feature_disabled
  BEFORE INSERT OR UPDATE ON public.company_currencies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_currency_add_when_feature_disabled();

COMMENT ON FUNCTION public.guard_currency_add_when_feature_disabled() IS
  'Block new currency configuration while multicurrency explicitly disabled; synchronize direct writes with feature toggle.';
