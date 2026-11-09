-- CRM hotfix: get_crm_settings must be VOLATILE because it seeds defaults (writes).
-- STABLE + INSERT fails under read-only RPC transactions ("cannot execute INSERT in a read-only transaction").

CREATE OR REPLACE FUNCTION public.get_crm_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.crm_settings%ROWTYPE;
BEGIN
  PERFORM private.crm_require_permission(_company_id, 'crm.view');
  PERFORM private.crm_seed_defaults(_company_id);
  SELECT * INTO _row FROM public.crm_settings WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'companyId', _row.company_id,
    'enabled', _row.enabled,
    'leadNumberPrefix', _row.lead_number_prefix,
    'opportunityNumberPrefix', _row.opportunity_number_prefix,
    'staleDealDays', _row.stale_deal_days,
    'defaultPipelineId', _row.default_pipeline_id,
    'version', _row.version,
    'updatedAt', _row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_crm_settings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_crm_settings(UUID) TO authenticated;
