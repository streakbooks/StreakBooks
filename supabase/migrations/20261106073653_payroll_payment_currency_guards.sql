-- Defensive payroll settlement invariants for ALL SQL paths, including direct RPC calls.
-- The current payroll post_journal write uses fx_rate_to_base = 1.
-- Until correct FX conversion and realised FX handling exist, payroll payments
-- must be in both the organisation base currency and configured payroll currency.
-- This deliberately blocks non-base-currency payroll settlements.
-- No changes to accounting journal balances or existing records are performed.

CREATE OR REPLACE FUNCTION public.payroll_payment_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _base_currency TEXT;
  _payroll_currency TEXT;
BEGIN
  SELECT upper(c.base_currency), upper(s.payroll_currency)
    INTO _base_currency, _payroll_currency
  FROM public.companies c
  LEFT JOIN public.payroll_settings s ON s.company_id = c.id
  WHERE c.id = NEW.company_id;

  IF _base_currency IS NULL OR _payroll_currency IS NULL THEN
    RAISE EXCEPTION 'Company and payroll settings must exist before settlement'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.currency IS NULL
     OR NEW.currency <> _base_currency
     OR NEW.currency <> _payroll_currency THEN
    RAISE EXCEPTION
      'Payroll payment currency must match payroll settings and organisation base currency'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- The function is invoked by a trigger, not directly by PostgREST.
REVOKE ALL ON FUNCTION public.payroll_payment_currency_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_payment_currency_guard_trg ON public.payroll_payments;
CREATE TRIGGER payroll_payment_currency_guard_trg
  BEFORE INSERT OR UPDATE OF currency, company_id
  ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.payroll_payment_currency_guard();

-- Require each payment allocation to reference a payslip and run in the
-- same organisation and currency as the recorded payment. This prevents
-- bypassing the RPC by inserting allocations with foreign run references.
CREATE OR REPLACE FUNCTION public.payroll_allocation_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _payment_company UUID;
  _payment_currency TEXT;
  _slip_company UUID;
  _slip_run_id UUID;
  _slip_run_employee_id UUID;
  _run_currency TEXT;
BEGIN
  SELECT p.company_id, p.currency
    INTO _payment_company, _payment_currency
  FROM public.payroll_payments p
  WHERE p.id = NEW.payment_id;

  SELECT ps.company_id, ps.run_id, ps.run_employee_id, r.currency
    INTO _slip_company, _slip_run_id, _slip_run_employee_id, _run_currency
  FROM public.payroll_payslips ps
  JOIN public.payroll_runs r ON r.id = ps.run_id
  WHERE ps.id = NEW.payslip_id;

  IF _payment_company IS NULL OR _slip_company IS NULL THEN
    RAISE EXCEPTION 'Payment and payslip must exist for payroll allocation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.company_id IS DISTINCT FROM _payment_company
     OR NEW.company_id IS DISTINCT FROM _slip_company
     OR NEW.run_id IS DISTINCT FROM _slip_run_id
     OR NEW.run_employee_id IS DISTINCT FROM _slip_run_employee_id
     OR _payment_currency IS DISTINCT FROM _run_currency THEN
    RAISE EXCEPTION 'Payroll allocation company, run, employee or currency mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_allocation_currency_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_allocation_currency_guard_trg
  ON public.payroll_payment_allocations;
CREATE TRIGGER payroll_allocation_currency_guard_trg
  BEFORE INSERT OR UPDATE OF company_id, payment_id, payslip_id, run_id, run_employee_id
  ON public.payroll_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.payroll_allocation_currency_guard();

-- Existing RLS, table GRANTs and record_payroll_payment(JSONB) permissions
-- are preserved; only invalid settlement writes are newly rejected.
