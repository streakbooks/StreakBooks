-- Fixed Asset register CSV import: atomic, authenticated, idempotent and non-posting.
-- This migration MUST be validated on isolated Supabase staging before deployment.
-- The existing save_fixed_asset RPC remains the only asset register writer.
-- Importing a register NEVER creates opening balance or depreciation journal entries.

CREATE TABLE IF NOT EXISTS public.fixed_asset_import_refs (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_code TEXT NOT NULL CHECK (char_length(external_code) BETWEEN 1 AND 80),
  asset_id UUID NOT NULL UNIQUE REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  original_payload JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, external_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS fixed_asset_import_refs_casefold_uniq
  ON public.fixed_asset_import_refs (company_id, lower(external_code));
CREATE INDEX IF NOT EXISTS fixed_asset_import_refs_asset_idx
  ON public.fixed_asset_import_refs (company_id, asset_id);

ALTER TABLE public.fixed_asset_import_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fixed_asset_import_refs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.fixed_asset_import_refs TO authenticated;

DROP POLICY IF EXISTS fixed_asset_import_refs_read ON public.fixed_asset_import_refs;
CREATE POLICY fixed_asset_import_refs_read ON public.fixed_asset_import_refs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.import_fixed_asset_register(
  _company_id UUID,
  _rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid UUID := auth.uid();
  _item JSONB;
  _code TEXT;
  _payload JSONB;
  _prior RECORD;
  _asset_id UUID;
  _created INTEGER := 0;
  _skipped INTEGER := 0;
  _assets JSONB := '[]'::JSONB;
  _codes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign-in is required'; END IF;
  IF NOT public.is_company_member(_company_id) OR NOT public.has_company_permission(_company_id, 'accounts.manage') THEN
    RAISE EXCEPTION 'No permission to import fixed assets in this organisation';
  END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0
     OR jsonb_array_length(_rows) > 100 THEN
    RAISE EXCEPTION 'Provide between 1 and 100 fixed asset rows';
  END IF;

  -- Serialise imports by organisation to ensure concurrent retries are deterministic.
  PERFORM pg_advisory_xact_lock(hashtext('fixed_asset_import:' || _company_id::TEXT));

  -- Preflight all external references before ANY asset is saved.
  FOR _item IN SELECT value FROM jsonb_array_elements(_rows)
  LOOP
    _code := NULLIF(trim(COALESCE(_item->>'external_code', '')), '');
    _payload := _item->'payload';
    IF _code IS NULL OR _code !~ '^[a-zA-Z0-9._-]{1,80}$' THEN
      RAISE EXCEPTION 'Every row must have a valid external asset reference';
    END IF;
    IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
      RAISE EXCEPTION 'Asset % lacks its validated payload', _code;
    END IF;
    IF lower(_code) = ANY(_codes) THEN
      RAISE EXCEPTION 'Duplicate asset reference in CSV: %', _code;
    END IF;
    _codes := _codes || lower(_code);
  END LOOP;

  FOR _item IN SELECT value FROM jsonb_array_elements(_rows)
  LOOP
    _code := trim(_item->>'external_code');
    _payload := _item->'payload';
    SELECT asset_id, original_payload INTO _prior
      FROM public.fixed_asset_import_refs
      WHERE company_id = _company_id AND lower(external_code) = lower(_code)
      FOR UPDATE;
    IF FOUND THEN
      IF _prior.original_payload <> _payload THEN
        RAISE EXCEPTION 'External asset reference % was already imported with different values; review the asset instead of reimporting', _code;
      END IF;
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- Existing RPC performs the authoritative period, account-type, depreciation
    -- term, organisation and permission validation. It writes no ledger journal.
    _asset_id := public.save_fixed_asset(_company_id, NULL, _payload);
    INSERT INTO public.fixed_asset_import_refs
      (company_id, external_code, asset_id, original_payload, created_by)
    VALUES (_company_id, _code, _asset_id, _payload, _uid);
    _assets := _assets || jsonb_build_array(jsonb_build_object('external_code', _code, 'asset_id', _asset_id));
    _created := _created + 1;
  END LOOP;

  PERFORM public.record_audit_event(
    _company_id, 'fixed_assets.csv_import', 'fixed_asset', NULL,
    jsonb_build_object('created', _created, 'skipped', _skipped, 'source', 'csv')
  );
  RETURN jsonb_build_object('created', _created, 'skipped', _skipped, 'assets', _assets);
END;
$$;
REVOKE ALL ON FUNCTION public.import_fixed_asset_register(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_fixed_asset_register(UUID, JSONB) TO authenticated;
