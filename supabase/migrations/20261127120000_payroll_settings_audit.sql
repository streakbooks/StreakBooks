-- Record payroll configuration changes alongside the settings write. The existing RPC
-- summary event remains useful for operations; this event provides field-level evidence.
CREATE OR REPLACE FUNCTION public.audit_payroll_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _before jsonb := '{}'::jsonb;
  _after jsonb := '{}'::jsonb;
  _company_id uuid;
BEGIN
  -- Service maintenance without an authenticated actor is deliberately not attributed.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _before := to_jsonb(OLD) - ARRAY['company_id', 'version', 'created_at', 'updated_at'];
  END IF;

  IF TG_OP = 'DELETE' THEN
    _company_id := OLD.company_id;
  ELSE
    _company_id := NEW.company_id;
    _after := to_jsonb(NEW) - ARRAY['company_id', 'version', 'created_at', 'updated_at'];
  END IF;

  -- Payslip notes may contain personal or confidential content. Preserve whether a
  -- value existed without copying its text into the audit log.
  IF _before ? 'payslip_footer_note' THEN
    _before := jsonb_set(
      _before,
      '{payslip_footer_note}',
      to_jsonb(CASE WHEN NULLIF(_before->>'payslip_footer_note', '') IS NULL THEN '' ELSE '[redacted]' END)
    );
  END IF;
  IF _after ? 'payslip_footer_note' THEN
    _after := jsonb_set(
      _after,
      '{payslip_footer_note}',
      to_jsonb(CASE WHEN NULLIF(_after->>'payslip_footer_note', '') IS NULL THEN '' ELSE '[redacted]' END)
    );
  END IF;

  IF TG_OP = 'UPDATE' AND _before = _after THEN
    RETURN NEW;
  END IF;

  PERFORM public.record_audit_event(
    _company_id,
    'settings.payroll.configuration',
    'payroll_settings',
    _company_id,
    jsonb_build_object('before', _before, 'after', _after)
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_payroll_settings_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_settings_configuration_audit ON public.payroll_settings;
CREATE TRIGGER payroll_settings_configuration_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_payroll_settings_change();
