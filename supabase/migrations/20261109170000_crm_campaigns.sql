-- CRM-11: campaign records (attribution catalogue; no GL, no silent email send).
CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'paused', 'completed', 'cancelled')),
  channel TEXT,
  source_id UUID REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  starts_on DATE,
  ends_on DATE,
  budget_minor BIGINT NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT crm_campaigns_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
  CONSTRAINT crm_campaigns_dates CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_campaigns_company_name_uidx
  ON public.crm_campaigns (company_id, lower(name));
CREATE INDEX IF NOT EXISTS crm_campaigns_company_status_idx
  ON public.crm_campaigns (company_id, status, is_active);

ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM campaigns select" ON public.crm_campaigns;
CREATE POLICY "CRM campaigns select"
  ON public.crm_campaigns FOR SELECT TO authenticated
  USING (
    public.has_company_permission(company_id, 'crm.view')
    OR public.has_company_permission(company_id, 'crm.campaigns.manage')
    OR public.has_company_permission(company_id, 'crm.admin')
  );

REVOKE ALL ON TABLE public.crm_campaigns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_campaigns TO authenticated;
GRANT ALL ON TABLE public.crm_campaigns TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_crm_campaign(
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
  _status TEXT := COALESCE(NULLIF(trim(COALESCE(_payload->>'status', '')), ''), 'planned');
  _channel TEXT := NULLIF(trim(COALESCE(_payload->>'channel', '')), '');
  _source_id UUID := NULLIF(_payload->>'sourceId', '')::UUID;
  _starts_on DATE := NULLIF(_payload->>'startsOn', '')::DATE;
  _ends_on DATE := NULLIF(_payload->>'endsOn', '')::DATE;
  _budget BIGINT := COALESCE((_payload->>'budgetMinor')::BIGINT, 0);
  _currency TEXT := upper(COALESCE(NULLIF(trim(COALESCE(_payload->>'currencyCode', '')), ''), 'USD'));
  _notes TEXT := NULLIF(trim(COALESCE(_payload->>'notes', '')), '');
  _is_active BOOLEAN := COALESCE((_payload->>'isActive')::BOOLEAN, true);
  _row public.crm_campaigns%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.campaigns.manage');
  PERFORM private.crm_seed_defaults(_company_id);

  IF _name IS NULL OR char_length(_name) > 160 THEN
    RAISE EXCEPTION 'Campaign name is required (1–160 characters)';
  END IF;
  IF _status NOT IN ('planned', 'active', 'paused', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid campaign status';
  END IF;
  IF _budget < 0 THEN
    RAISE EXCEPTION 'budgetMinor must be >= 0';
  END IF;
  IF char_length(_currency) <> 3 THEN
    RAISE EXCEPTION 'currencyCode must be 3 letters';
  END IF;
  IF _ends_on IS NOT NULL AND _starts_on IS NOT NULL AND _ends_on < _starts_on THEN
    RAISE EXCEPTION 'endsOn must be on or after startsOn';
  END IF;
  IF _source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_lead_sources s
    WHERE s.id = _source_id AND s.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Lead source not found';
  END IF;

  IF _id IS NOT NULL THEN
    SELECT * INTO _row FROM public.crm_campaigns
    WHERE id = _id AND company_id = _company_id FOR UPDATE;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'Campaign not found';
    END IF;
    UPDATE public.crm_campaigns SET
      name = _name,
      code = _code,
      status = _status,
      channel = _channel,
      source_id = _source_id,
      starts_on = _starts_on,
      ends_on = _ends_on,
      budget_minor = _budget,
      currency_code = _currency,
      notes = _notes,
      is_active = _is_active,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    INSERT INTO public.crm_campaigns (
      company_id, name, code, status, channel, source_id, starts_on, ends_on,
      budget_minor, currency_code, notes, is_active, created_by, updated_by
    ) VALUES (
      _company_id, _name, _code, _status, _channel, _source_id, _starts_on, _ends_on,
      _budget, _currency, _notes, _is_active, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'name', _row.name,
    'code', _row.code,
    'status', _row.status,
    'channel', _row.channel,
    'sourceId', _row.source_id,
    'startsOn', _row.starts_on,
    'endsOn', _row.ends_on,
    'budgetMinor', _row.budget_minor,
    'currencyCode', _row.currency_code,
    'notes', _row.notes,
    'isActive', _row.is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_crm_campaign(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_crm_campaign(UUID, JSONB) TO authenticated;
