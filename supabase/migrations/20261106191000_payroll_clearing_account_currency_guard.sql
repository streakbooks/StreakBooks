-- Guard against payroll payment journals that credit foreign-currency bank/cash
-- GL accounts without any supported FX conversion. Applied as a separate
-- trigger so existing payment and payslip currency checks remain unchanged.
-- No existing payment or accounting data is modified.
CREATE OR REPLACE FUNCTION public.payroll_clearing_account_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _account_currency TEXT;
BEGIN
  SELECT NULLIF(upper(trim(a.currency_code::text)), '')
    INTO _account_currency
  FROM public.accounts a
  WHERE a.id = NEW.clearing_account_id
    AND a.company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll clearing account must belong to the organisation'
      USING ERRCODE = '23514';
  END IF;

  -- A NULL currency on the GL account means no per-account override; this
  -- is common for chart-of-accounts bank/cash rows in a base-currency setup.
  IF _account_currency IS NOT NULL
     AND _account_currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'Payroll clearing account currency differs from payment currency'
      USING ERRCODE = '23514';
  END IF;

  -- Linked bank accounts may carry their own currency even when the GL
  -- account currency is NULL. Never credit a foreign-currency bank at FX=1.
  IF EXISTS (
    SELECT 1
    FROM public.bank_accounts b
    WHERE b.company_id = NEW.company_id
      AND b.gl_account_id = NEW.clearing_account_id
      AND b.is_active
      AND upper(trim(b.currency_code::text)) IS DISTINCT FROM NEW.currency
  ) THEN
    RAISE EXCEPTION 'Linked bank account currency differs from payroll payment currency'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger helpers are not public RPC endpoints.
REVOKE ALL ON FUNCTION public.payroll_clearing_account_currency_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_clearing_account_currency_guard_trg
  ON public.payroll_payments;
CREATE TRIGGER payroll_clearing_account_currency_guard_trg
  BEFORE INSERT OR UPDATE OF company_id, currency, clearing_account_id
  ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.payroll_clearing_account_currency_guard();
