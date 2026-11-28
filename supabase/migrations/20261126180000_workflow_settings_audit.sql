-- Audit the existing per-organisation workflow settings row in the same transaction.
-- Free-text defaults can contain payment instructions, so audit their change without values.

CREATE OR REPLACE FUNCTION public.audit_company_workflow_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  old_document jsonb := '{}'::jsonb;
  new_document jsonb := to_jsonb(NEW);
  field_name text;
  old_value jsonb;
  new_value jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_document := to_jsonb(OLD);
  END IF;

  FOR field_name IN SELECT jsonb_object_keys(new_document) LOOP
    IF field_name IN ('company_id', 'updated_at', 'updated_by') THEN
      CONTINUE;
    END IF;

    new_value := new_document -> field_name;
    old_value := old_document -> field_name;
    -- Treat SQL NULL and JSON null equally; adding a row with nullable defaults
    -- is not a meaningful change for those settings.
    IF old_value = 'null'::jsonb THEN old_value := NULL; END IF;
    IF new_value = 'null'::jsonb THEN new_value := NULL; END IF;
    IF old_value IS NOT DISTINCT FROM new_value THEN
      CONTINUE;
    END IF;

    -- Keep exact values only for the current allowlist of non-sensitive settings.
    -- New fields remain redacted until reviewed and added to this list.
    IF field_name NOT IN (
      'sales_default_payment_terms_days',
      'sales_quote_validity_days',
      'sales_prices_include_tax',
      'purchases_default_payment_terms_days',
      'purchases_require_po',
      'banking_csv_date_format',
      'accounting_require_journal_memo'
    ) THEN
      old_value := CASE
        WHEN old_value IS NULL OR old_value = 'null'::jsonb THEN NULL
        ELSE '{"redacted":true}'::jsonb
      END;
      new_value := CASE
        WHEN new_value IS NULL OR new_value = 'null'::jsonb THEN NULL
        ELSE '{"redacted":true}'::jsonb
      END;
    END IF;

    INSERT INTO public.settings_change_log (
      company_id,
      actor_user_id,
      category,
      setting_key,
      old_value,
      new_value,
      source
    ) VALUES (
      NEW.company_id,
      auth.uid(),
      'workflow',
      field_name,
      old_value,
      new_value,
      'workflow_settings'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_company_workflow_settings_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS company_workflow_settings_audit ON public.company_workflow_settings;
CREATE TRIGGER company_workflow_settings_audit
AFTER INSERT OR UPDATE ON public.company_workflow_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_company_workflow_settings_change();

COMMENT ON FUNCTION public.audit_company_workflow_settings_change() IS
  'Writes same-transaction before/after workflow setting audit rows; only reviewed non-sensitive fields retain values.';
