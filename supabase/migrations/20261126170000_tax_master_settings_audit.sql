-- Audit tax master edits in the same transaction as the setting change.
-- Rate/code history remains protected by the posted-document guard migration.

CREATE OR REPLACE FUNCTION public.audit_tax_master_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _company_id uuid;
  _record_id text;
  _old jsonb;
  _new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _company_id := NEW.company_id;
    _record_id := NEW.id::text;
    _old := NULL;
    _new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Tax master records cannot move between organisations';
    END IF;
    _company_id := NEW.company_id;
    _record_id := NEW.id::text;
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
  ELSE
    _company_id := OLD.company_id;
    _record_id := OLD.id::text;
    _old := to_jsonb(OLD);
    _new := NULL;
  END IF;

  INSERT INTO public.settings_change_log (
    company_id, actor_user_id, category, setting_key,
    old_value, new_value, reason, source
  ) VALUES (
    _company_id, auth.uid(), 'tax', TG_TABLE_NAME || ':' || _record_id,
    _old, _new, NULL, 'tax_module'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_tax_master_settings_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tax_rates_settings_audit ON public.tax_rates;
CREATE TRIGGER tax_rates_settings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tax_rates
FOR EACH ROW EXECUTE FUNCTION public.audit_tax_master_settings_change();

DROP TRIGGER IF EXISTS tax_codes_settings_audit ON public.tax_codes;
CREATE TRIGGER tax_codes_settings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tax_codes
FOR EACH ROW EXECUTE FUNCTION public.audit_tax_master_settings_change();
