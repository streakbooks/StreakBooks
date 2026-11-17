-- Organisation collaboration flags for messaging (AI, files, customer/vendor).
-- Additive; defaults remain fail-closed for external + AI.

CREATE OR REPLACE FUNCTION public.messaging_set_collaboration_flags(
  _company_id UUID,
  _allow_ai_assist BOOLEAN DEFAULT NULL,
  _allow_file_share BOOLEAN DEFAULT NULL,
  _allow_customer BOOLEAN DEFAULT NULL,
  _allow_vendor BOOLEAN DEFAULT NULL,
  _allow_group_create BOOLEAN DEFAULT NULL
)
RETURNS public.messaging_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.messaging_settings;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_company_permission(_company_id, 'messaging.manage_settings') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _row := public.messaging_ensure_settings(_company_id);

  UPDATE public.messaging_settings
  SET
    allow_ai_assist = COALESCE(_allow_ai_assist, allow_ai_assist),
    allow_file_share = COALESCE(_allow_file_share, allow_file_share),
    allow_customer = COALESCE(_allow_customer, allow_customer),
    allow_vendor = COALESCE(_allow_vendor, allow_vendor),
    allow_group_create = COALESCE(_allow_group_create, allow_group_create),
    updated_at = now()
  WHERE company_id = _company_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_set_collaboration_flags(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messaging_set_collaboration_flags(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
