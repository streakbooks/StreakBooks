-- Keep Tax workspace edits in settings history and enforce Tax permission.
-- Updated-at maintenance is excluded from the per-field audit.

CREATE OR REPLACE FUNCTION public.audit_company_tax_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _field record;
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Tax settings cannot move between organisations';
  END IF;

  IF (pg_catalog.to_jsonb(NEW) - 'updated_at' - 'created_at')
       IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'updated_at' - 'created_at')
     AND auth.uid() IS NOT NULL
     AND NOT public.has_company_permission(NEW.company_id, 'tax.settings') THEN
    RAISE EXCEPTION 'Permission denied for Tax settings' USING ERRCODE = '42501';
  END IF;

  FOR _field IN
    SELECT old_field.key, old_field.value AS old_value, new_field.value AS new_value
    FROM pg_catalog.jsonb_each(pg_catalog.to_jsonb(OLD)) AS old_field
    JOIN pg_catalog.jsonb_each(pg_catalog.to_jsonb(NEW)) AS new_field USING (key)
    WHERE old_field.key = ANY (ARRAY[
      'tax_regime', 'registration_number', 'prices_include_tax', 'filing_frequency',
      'tax_basis', 'jurisdiction_code', 'default_sales_tax_code_id',
      'default_purchase_tax_code_id', 'output_tax_account_id', 'input_tax_account_id',
      'registration_date', 'registration_end_date', 'applied_pack_id',
      'applied_pack_version', 'non_recoverable_tax_account_id'
    ])
      AND old_field.value IS DISTINCT FROM new_field.value
  LOOP
    INSERT INTO public.settings_change_log (
      company_id, actor_user_id, category, setting_key, old_value, new_value, source
    ) VALUES (
      NEW.company_id,
      auth.uid(),
      'tax',
      'company_tax_settings.' || _field.key,
      _field.old_value,
      _field.new_value,
      'tax_settings'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_company_tax_settings_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS company_tax_settings_audit ON public.company_tax_settings;
CREATE TRIGGER company_tax_settings_audit
  BEFORE UPDATE ON public.company_tax_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_company_tax_settings_change();

COMMENT ON FUNCTION public.audit_company_tax_settings_change() IS
  'Enforces tax.settings and audits changed Tax fields in the same transaction; updated_at is excluded.';
