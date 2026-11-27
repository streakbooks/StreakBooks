-- Keep expense settings ledger mappings inside their owning organisation and
-- constrain each mapping to the account type used by its posting workflow.
CREATE OR REPLACE FUNCTION public.guard_expense_settings_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.employee_payable_account_id IS NOT NULL
     AND (TG_OP = 'INSERT'
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.employee_payable_account_id IS DISTINCT FROM OLD.employee_payable_account_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.employee_payable_account_id
         AND a.company_id = NEW.company_id
         AND a.account_type = 'liability'
         AND a.is_active AND a.is_postable AND a.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Employee payable account must be an active, postable liability account owned by this organisation';
  END IF;

  IF NEW.employee_advance_account_id IS NOT NULL
     AND (TG_OP = 'INSERT'
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.employee_advance_account_id IS DISTINCT FROM OLD.employee_advance_account_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.employee_advance_account_id
         AND a.company_id = NEW.company_id
         AND a.account_type = 'asset'
         AND a.is_active AND a.is_postable AND a.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Employee advance account must be an active, postable asset account owned by this organisation';
  END IF;

  IF NEW.petty_cash_account_id IS NOT NULL
     AND (TG_OP = 'INSERT'
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.petty_cash_account_id IS DISTINCT FROM OLD.petty_cash_account_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.petty_cash_account_id
         AND a.company_id = NEW.company_id
         AND a.account_type = 'asset'
         AND a.is_active AND a.is_postable AND a.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Petty cash account must be an active, postable asset account owned by this organisation';
  END IF;

  IF NEW.rebilling_income_account_id IS NOT NULL
     AND (TG_OP = 'INSERT'
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.rebilling_income_account_id IS DISTINCT FROM OLD.rebilling_income_account_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.rebilling_income_account_id
         AND a.company_id = NEW.company_id
         AND a.account_type = 'income'
         AND a.is_active AND a.is_postable AND a.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Rebilling income account must be an active, postable income account owned by this organisation';
  END IF;

  IF NEW.fx_gain_account_id IS NOT NULL
     AND (TG_OP = 'INSERT'
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.fx_gain_account_id IS DISTINCT FROM OLD.fx_gain_account_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.fx_gain_account_id
         AND a.company_id = NEW.company_id
         AND a.account_type = 'income'
         AND a.is_active AND a.is_postable AND a.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'FX gain account must be an active, postable income account owned by this organisation';
  END IF;

  IF NEW.fx_loss_account_id IS NOT NULL
     AND (TG_OP = 'INSERT'
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.fx_loss_account_id IS DISTINCT FROM OLD.fx_loss_account_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.fx_loss_account_id
         AND a.company_id = NEW.company_id
         AND a.account_type = 'expense'
         AND a.is_active AND a.is_postable AND a.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'FX loss account must be an active, postable expense account owned by this organisation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_expense_settings_account_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS expense_settings_account_scope ON public.expense_management_settings;
CREATE TRIGGER expense_settings_account_scope
  BEFORE INSERT OR UPDATE OF company_id, employee_payable_account_id,
    employee_advance_account_id, petty_cash_account_id, rebilling_income_account_id,
    fx_gain_account_id, fx_loss_account_id
  ON public.expense_management_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_settings_account_scope();

NOTIFY pgrst, 'reload schema';
