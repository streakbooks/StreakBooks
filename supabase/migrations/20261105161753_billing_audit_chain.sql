-- Billing platform, phase 1: tamper-evident billing audit.
-- Extends the existing append-only public.platform_billing_audit (UPDATE/DELETE/TRUNCATE
-- are already blocked by platform_billing_audit_immutable) with an ordered sequence and a
-- SHA-256 hash chain. Existing rows keep a NULL hash; the chain starts with the next insert.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.platform_billing_audit
  ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS billing_account_id uuid,
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS platform_billing_audit_seq_key ON public.platform_billing_audit (seq);
CREATE INDEX IF NOT EXISTS platform_billing_audit_account_idx
  ON public.platform_billing_audit (billing_account_id, seq DESC) WHERE billing_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.billing_audit_payload(
  _prev_hash text, _seq bigint, _actor uuid, _action text, _entity_type text, _entity_id text,
  _account uuid, _reason text, _before jsonb, _after jsonb, _created_at timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT concat_ws('|',
    coalesce(_prev_hash, ''), _seq::text, coalesce(_actor::text, ''), _action, _entity_type,
    coalesce(_entity_id, ''), coalesce(_account::text, ''), coalesce(_reason, ''),
    coalesce(_before::text, ''), coalesce(_after::text, ''),
    to_char(_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;

CREATE OR REPLACE FUNCTION private.billing_audit_hash() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialise writers so each row links to exactly one predecessor.
  PERFORM pg_advisory_xact_lock(814202);
  SELECT a.row_hash INTO NEW.prev_hash
    FROM public.platform_billing_audit a
   WHERE a.row_hash IS NOT NULL
   ORDER BY a.seq DESC
   LIMIT 1;
  NEW.row_hash := encode(extensions.digest(convert_to(private.billing_audit_payload(
    NEW.prev_hash, NEW.seq, NEW.actor_user_id, NEW.action, NEW.entity_type, NEW.entity_id,
    NEW.billing_account_id, NEW.reason, NEW.before_state, NEW.after_state, NEW.created_at), 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS platform_billing_audit_hash ON public.platform_billing_audit;
CREATE TRIGGER platform_billing_audit_hash BEFORE INSERT ON public.platform_billing_audit
  FOR EACH ROW EXECUTE FUNCTION private.billing_audit_hash();

-- Single writer for billing audit rows. Not callable by clients; billing functions call it.
CREATE OR REPLACE FUNCTION billing.write_audit(
  _action text, _entity_type text, _entity_id text, _billing_account_id uuid,
  _before jsonb, _after jsonb, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _action IS NULL OR _action !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' THEN
    RAISE EXCEPTION 'Invalid billing audit action %', _action USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.platform_billing_audit
    (actor_user_id, action, entity_type, entity_id, billing_account_id, before_state, after_state, reason)
  VALUES
    (auth.uid(), _action, _entity_type, _entity_id, _billing_account_id,
     coalesce(_before, '{}'::jsonb), coalesce(_after, '{}'::jsonb), _reason);
END $$;
REVOKE ALL ON FUNCTION billing.write_audit(text, text, text, uuid, jsonb, jsonb, text) FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION billing.write_audit(text, text, text, uuid, jsonb, jsonb, text) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Recomputes the chain. Platform billing staff only (aal2 enforced by private.platform_can).
CREATE OR REPLACE FUNCTION public.platform_verify_billing_audit_chain()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  expected_prev text := NULL;
  checked bigint := 0;
BEGIN
  IF NOT private.platform_can('billing.view') THEN
    RAISE EXCEPTION 'Platform billing access and an active MFA session are required' USING ERRCODE = '42501';
  END IF;
  FOR r IN
    SELECT * FROM public.platform_billing_audit WHERE row_hash IS NOT NULL ORDER BY seq
  LOOP
    IF r.prev_hash IS DISTINCT FROM expected_prev
       OR r.row_hash <> encode(extensions.digest(convert_to(private.billing_audit_payload(
            r.prev_hash, r.seq, r.actor_user_id, r.action, r.entity_type, r.entity_id,
            r.billing_account_id, r.reason, r.before_state, r.after_state, r.created_at), 'UTF8'), 'sha256'), 'hex')
    THEN
      RETURN jsonb_build_object('valid', false, 'checkedRows', checked, 'firstInvalidSeq', r.seq);
    END IF;
    expected_prev := r.row_hash;
    checked := checked + 1;
  END LOOP;
  RETURN jsonb_build_object('valid', true, 'checkedRows', checked, 'firstInvalidSeq', NULL);
END $$;
REVOKE ALL ON FUNCTION public.platform_verify_billing_audit_chain() FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.platform_verify_billing_audit_chain() FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.platform_verify_billing_audit_chain() TO authenticated, service_role';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
