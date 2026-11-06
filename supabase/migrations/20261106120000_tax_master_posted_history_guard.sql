-- Preserve tax masters used by posted sales invoices and purchase bills.
-- This is a fail-closed integrity guard. It does not rewrite documents, journals
-- or filed returns, and does not grant additional privileges.
-- Apply in a reviewed migration and verify against staging data before production.

CREATE INDEX IF NOT EXISTS sales_invoice_lines_tax_code_history_idx
  ON public.sales_invoice_lines (company_id, tax_code_id)
  WHERE tax_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_bill_lines_tax_code_history_idx
  ON public.purchase_bill_lines (company_id, tax_code_id)
  WHERE tax_code_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tax_code_has_posted_history(
  _company_id uuid, _code_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_invoice_lines l
    JOIN public.sales_invoices h
      ON h.id = l.invoice_id AND h.company_id = _company_id
    WHERE l.company_id = _company_id
      AND l.tax_code_id = _code_id
      AND h.posted_journal_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.purchase_bill_lines l
    JOIN public.purchase_bills h
      ON h.id = l.bill_id AND h.company_id = _company_id
    WHERE l.company_id = _company_id
      AND l.tax_code_id = _code_id
      AND h.posted_journal_id IS NOT NULL
  );
$$;

-- Used for rate effective-date checks. Void documents still have historical
-- posting evidence and are counted; a void does not permit rewriting history.
CREATE OR REPLACE FUNCTION public.tax_rate_last_posted_date(
  _company_id uuid, _rate_id uuid
) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT max(doc_date)
  FROM (
    SELECT h.invoice_date AS doc_date
    FROM public.tax_codes c
    JOIN public.sales_invoice_lines l
      ON l.company_id = c.company_id AND l.tax_code_id = c.id
    JOIN public.sales_invoices h
      ON h.id = l.invoice_id AND h.company_id = c.company_id
    WHERE c.company_id = _company_id
      AND c.tax_rate_id = _rate_id
      AND h.posted_journal_id IS NOT NULL
    UNION ALL
    SELECT h.bill_date AS doc_date
    FROM public.tax_codes c
    JOIN public.purchase_bill_lines l
      ON l.company_id = c.company_id AND l.tax_code_id = c.id
    JOIN public.purchase_bills h
      ON h.id = l.bill_id AND h.company_id = c.company_id
    WHERE c.company_id = _company_id
      AND c.tax_rate_id = _rate_id
      AND h.posted_journal_id IS NOT NULL
  ) AS used_dates;
$$;

CREATE OR REPLACE FUNCTION public.guard_tax_code_posted_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- A foreign key alone does not enforce tenant equivalence.
  IF NOT EXISTS (
    SELECT 1 FROM public.tax_rates r
    WHERE r.id = NEW.tax_rate_id AND r.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Tax code rate must belong to this organisation';
  END IF;

  IF NEW.tax_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = NEW.tax_account_id AND a.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Tax code account must belong to this organisation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Cannot move a tax code to another organisation';
    END IF;
    IF (
      NEW.code IS DISTINCT FROM OLD.code
      OR NEW.tax_rate_id IS DISTINCT FROM OLD.tax_rate_id
      OR NEW.tax_account_id IS DISTINCT FROM OLD.tax_account_id
      OR NEW.applies_to IS DISTINCT FROM OLD.applies_to
      OR NEW.is_recoverable IS DISTINCT FROM OLD.is_recoverable
      OR NEW.treatment IS DISTINCT FROM OLD.treatment
      OR NEW.reporting_class IS DISTINCT FROM OLD.reporting_class
    ) AND public.tax_code_has_posted_history(OLD.company_id, OLD.id) THEN
      RAISE EXCEPTION
        'Tax code has posted documents. Create a replacement code; you may rename or deactivate the existing code.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tax_codes_guard_posted_history ON public.tax_codes;
CREATE TRIGGER tax_codes_guard_posted_history
BEFORE INSERT OR UPDATE ON public.tax_codes
FOR EACH ROW EXECUTE FUNCTION public.guard_tax_code_posted_history();

CREATE OR REPLACE FUNCTION public.guard_tax_rate_posted_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  last_posted date;
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Cannot move a tax rate to another organisation';
  END IF;

  IF NEW.rate_bps IS DISTINCT FROM OLD.rate_bps
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
    OR NEW.code IS DISTINCT FROM OLD.code
    OR NEW.treatment IS DISTINCT FROM OLD.treatment
    OR NEW.applies_to IS DISTINCT FROM OLD.applies_to
    OR NEW.jurisdiction_code IS DISTINCT FROM OLD.jurisdiction_code
  THEN
    SELECT public.tax_rate_last_posted_date(OLD.company_id, OLD.id)
      INTO last_posted;
    IF last_posted IS NOT NULL THEN
      IF NEW.rate_bps IS DISTINCT FROM OLD.rate_bps
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.treatment IS DISTINCT FROM OLD.treatment
        OR NEW.applies_to IS DISTINCT FROM OLD.applies_to
        OR NEW.jurisdiction_code IS DISTINCT FROM OLD.jurisdiction_code
      THEN
        RAISE EXCEPTION
          'Tax rate has posted documents. End-date the old rate and create a replacement.';
      END IF;
      IF NEW.effective_to IS NOT NULL AND NEW.effective_to < last_posted THEN
        RAISE EXCEPTION
          'Rate cannot end before its last posted document date (%)', last_posted;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tax_rates_guard_posted_history ON public.tax_rates;
CREATE TRIGGER tax_rates_guard_posted_history
BEFORE UPDATE ON public.tax_rates
FOR EACH ROW EXECUTE FUNCTION public.guard_tax_rate_posted_history();

REVOKE ALL ON FUNCTION public.tax_code_has_posted_history(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tax_rate_last_posted_date(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tax_code_posted_history()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tax_rate_posted_history()
  FROM PUBLIC, anon, authenticated;
