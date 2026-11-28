-- Record expense policy changes in the same transaction as the settings row.
-- The save RPC is authenticated and permission checked; service maintenance
-- without an authenticated actor is intentionally not attributed to a user.
CREATE OR REPLACE FUNCTION public.audit_expense_management_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _before jsonb := '{}'::jsonb;
  _after jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  _after := pg_catalog.jsonb_build_object(
    'enabled', NEW.enabled,
    'claim_number_prefix', NEW.claim_number_prefix,
    'default_claim_currency', NEW.default_claim_currency,
    'employee_payable_account_id', NEW.employee_payable_account_id,
    'employee_advance_account_id', NEW.employee_advance_account_id,
    'petty_cash_account_id', NEW.petty_cash_account_id,
    'rebilling_income_account_id', NEW.rebilling_income_account_id,
    'fx_gain_account_id', NEW.fx_gain_account_id,
    'fx_loss_account_id', NEW.fx_loss_account_id,
    'require_receipt_above_minor', NEW.require_receipt_above_minor,
    'require_spending_request_above_minor', NEW.require_spending_request_above_minor,
    'allow_multi_currency_claims', NEW.allow_multi_currency_claims,
    'prevent_self_approval', NEW.prevent_self_approval,
    'default_distance_unit', NEW.default_distance_unit,
    'approval_escalation_days', NEW.approval_escalation_days,
    'required_approval_count', NEW.required_approval_count
  );

  IF TG_OP = 'UPDATE' THEN
    _before := pg_catalog.jsonb_build_object(
      'enabled', OLD.enabled,
      'claim_number_prefix', OLD.claim_number_prefix,
      'default_claim_currency', OLD.default_claim_currency,
      'employee_payable_account_id', OLD.employee_payable_account_id,
      'employee_advance_account_id', OLD.employee_advance_account_id,
      'petty_cash_account_id', OLD.petty_cash_account_id,
      'rebilling_income_account_id', OLD.rebilling_income_account_id,
      'fx_gain_account_id', OLD.fx_gain_account_id,
      'fx_loss_account_id', OLD.fx_loss_account_id,
      'require_receipt_above_minor', OLD.require_receipt_above_minor,
      'require_spending_request_above_minor', OLD.require_spending_request_above_minor,
      'allow_multi_currency_claims', OLD.allow_multi_currency_claims,
      'prevent_self_approval', OLD.prevent_self_approval,
      'default_distance_unit', OLD.default_distance_unit,
      'approval_escalation_days', OLD.approval_escalation_days,
      'required_approval_count', OLD.required_approval_count
    );
    IF _before IS NOT DISTINCT FROM _after THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.record_audit_event(
    NEW.company_id,
    'settings.expense_management',
    'expense_management_settings',
    NEW.company_id,
    pg_catalog.jsonb_build_object('before', _before, 'after', _after)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_expense_management_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expense_management_settings_audit ON public.expense_management_settings;
CREATE TRIGGER expense_management_settings_audit
  AFTER INSERT OR UPDATE ON public.expense_management_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_expense_management_settings();
