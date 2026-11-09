-- CRM-12: territory catalogue with optional owner (assignment auto-rules still deferred).
CREATE TABLE IF NOT EXISTS public.crm_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT crm_territories_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_territories_company_name_uidx
  ON public.crm_territories (company_id, lower(name));
CREATE INDEX IF NOT EXISTS crm_territories_company_active_idx
  ON public.crm_territories (company_id, is_active, sort_order);

ALTER TABLE public.crm_territories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM territories select" ON public.crm_territories;
CREATE POLICY "CRM territories select"
  ON public.crm_territories FOR SELECT TO authenticated
  USING (
    public.has_company_permission(company_id, 'crm.view')
    OR public.has_company_permission(company_id, 'crm.admin')
  );

REVOKE ALL ON TABLE public.crm_territories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_territories TO authenticated;
GRANT ALL ON TABLE public.crm_territories TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_crm_territory(
  _company_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id UUID := NULLIF(_payload->>'id', '')::UUID;
  _name TEXT := NULLIF(trim(COALESCE(_payload->>'name', '')), '');
  _code TEXT := NULLIF(trim(COALESCE(_payload->>'code', '')), '');
  _description TEXT := NULLIF(trim(COALESCE(_payload->>'description', '')), '');
  _owner UUID := NULLIF(_payload->>'ownerUserId', '')::UUID;
  _is_active BOOLEAN := COALESCE((_payload->>'isActive')::BOOLEAN, true);
  _sort_order INTEGER := COALESCE((_payload->>'sortOrder')::INTEGER, 100);
  _row public.crm_territories%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.admin');
  PERFORM private.crm_seed_defaults(_company_id);

  IF _name IS NULL OR char_length(_name) > 120 THEN
    RAISE EXCEPTION 'Territory name is required (1–120 characters)';
  END IF;
  IF _sort_order < 0 OR _sort_order > 100000 THEN
    RAISE EXCEPTION 'sortOrder out of range';
  END IF;
  IF _owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _owner AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Territory owner must be an active company member';
  END IF;

  IF _id IS NOT NULL THEN
    SELECT * INTO _row FROM public.crm_territories
    WHERE id = _id AND company_id = _company_id FOR UPDATE;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Territory not found';
    END IF;
    UPDATE public.crm_territories SET
      name = _name,
      code = _code,
      description = _description,
      owner_user_id = _owner,
      is_active = _is_active,
      sort_order = _sort_order,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    INSERT INTO public.crm_territories (
      company_id, name, code, description, owner_user_id, is_active, sort_order, created_by, updated_by
    ) VALUES (
      _company_id, _name, _code, _description, _owner, _is_active, _sort_order, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'name', _row.name,
    'code', _row.code,
    'description', _row.description,
    'ownerUserId', _row.owner_user_id,
    'isActive', _row.is_active,
    'sortOrder', _row.sort_order
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_territory(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_territory(UUID, JSONB) TO authenticated;
