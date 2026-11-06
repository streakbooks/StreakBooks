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
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
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

-- VOLATILE is intentional: after blocking on concurrent posting row locks, a
-- fresh snapshot must include the committed posted source. STABLE would retain
-- the calling UPDATE's earlier snapshot and could permit retroactive edits.
-- Used for rate effective-date checks. Void documents still have historical
-- posting evidence and are counted; a void does not permit rewriting history.
CREATE OR REPLACE FUNCTION public.tax_rate_last_posted_date(
  _company_id uuid, _rate_id uuid
) RETURNS date
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
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

-- Transaction-level coordination between posting and tax-master edits.
-- Posting locks the referenced tax code and rate rows until commit. Concurrent
-- master updates must serialize against these locks and re-evaluate posted history.
-- These locks do NOT apply to uncoded historical document lines.
CREATE OR REPLACE FUNCTION public.lock_tax_masters_when_document_posted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Cannot change organisation during tax-source posting';
  END IF;
  IF OLD.posted_journal_id IS NOT NULL THEN
    IF NEW.posted_journal_id IS DISTINCT FROM OLD.posted_journal_id THEN
      RAISE EXCEPTION 'Cannot replace or remove posting evidence';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.posted_journal_id IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'sales_invoices' THEN
    IF EXISTS (
      SELECT 1 FROM public.sales_invoice_lines l
      LEFT JOIN public.tax_codes c
        ON c.id=l.tax_code_id AND c.company_id=l.company_id
      LEFT JOIN public.tax_rates r
        ON r.id=c.tax_rate_id AND r.company_id=c.company_id
      WHERE l.company_id=NEW.company_id AND l.invoice_id=NEW.id
        AND l.tax_code_id IS NOT NULL
        AND (c.id IS NULL OR r.id IS NULL)
    ) THEN
      RAISE EXCEPTION 'Invoice has tax references outside this organisation';
    END IF;
    PERFORM c.id
      FROM public.sales_invoice_lines l
      JOIN public.tax_codes c
        ON c.id=l.tax_code_id AND c.company_id=l.company_id
      JOIN public.tax_rates r
        ON r.id=c.tax_rate_id AND r.company_id=c.company_id
      WHERE l.company_id=NEW.company_id AND l.invoice_id=NEW.id
      ORDER BY c.id, r.id FOR SHARE OF c, r;
  ELSIF TG_TABLE_NAME = 'purchase_bills' THEN
    IF EXISTS (
      SELECT 1 FROM public.purchase_bill_lines l
      LEFT JOIN public.tax_codes c
        ON c.id=l.tax_code_id AND c.company_id=l.company_id
      LEFT JOIN public.tax_rates r
        ON r.id=c.tax_rate_id AND r.company_id=c.company_id
      WHERE l.company_id=NEW.company_id AND l.bill_id=NEW.id
        AND l.tax_code_id IS NOT NULL
        AND (c.id IS NULL OR r.id IS NULL)
    ) THEN
      RAISE EXCEPTION 'Bill has tax references outside this organisation';
    END IF;
    PERFORM c.id
      FROM public.purchase_bill_lines l
      JOIN public.tax_codes c
        ON c.id=l.tax_code_id AND c.company_id=l.company_id
      JOIN public.tax_rates r
        ON r.id=c.tax_rate_id AND r.company_id=c.company_id
      WHERE l.company_id=NEW.company_id AND l.bill_id=NEW.id
      ORDER BY c.id, r.id FOR SHARE OF c, r;
  ELSE
    RAISE EXCEPTION 'Unsupported tax source table';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_invoice_tax_master_post_lock ON public.sales_invoices;
CREATE TRIGGER sales_invoice_tax_master_post_lock
BEFORE UPDATE OF posted_journal_id ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.lock_tax_masters_when_document_posted();

DROP TRIGGER IF EXISTS purchase_bill_tax_master_post_lock ON public.purchase_bills;
CREATE TRIGGER purchase_bill_tax_master_post_lock
BEFORE UPDATE OF posted_journal_id ON public.purchase_bills
FOR EACH ROW EXECUTE FUNCTION public.lock_tax_masters_when_document_posted();

-- Lock the parent document for line inserts/updates/deletes. It serializes
-- adding lines versus linking the posted journal and prevents retroactive
-- changes to the document tax code, amounts or effective tax rate snapshot.
CREATE OR REPLACE FUNCTION public.guard_tax_source_line_after_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  document_id uuid;
  company_id_arg uuid;
  source_company uuid;
  posted_id uuid;
  tax_code_id_arg uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    company_id_arg := OLD.company_id;
    tax_code_id_arg := OLD.tax_code_id;
  ELSE
    company_id_arg := NEW.company_id;
    tax_code_id_arg := NEW.tax_code_id;
  END IF;

  IF TG_TABLE_NAME='sales_invoice_lines' THEN
    document_id := CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
    IF TG_OP='UPDATE' AND
      (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR
       NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
      RAISE EXCEPTION 'Cannot move tax source lines between documents';
    END IF;
    SELECT h.company_id,h.posted_journal_id INTO source_company,posted_id
      FROM public.sales_invoices h WHERE h.id=document_id FOR SHARE;
  ELSIF TG_TABLE_NAME='purchase_bill_lines' THEN
    document_id := CASE WHEN TG_OP='DELETE' THEN OLD.bill_id ELSE NEW.bill_id END;
    IF TG_OP='UPDATE' AND
      (NEW.bill_id IS DISTINCT FROM OLD.bill_id OR
       NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
      RAISE EXCEPTION 'Cannot move tax source lines between documents';
    END IF;
    SELECT h.company_id,h.posted_journal_id INTO source_company,posted_id
      FROM public.purchase_bills h WHERE h.id=document_id FOR SHARE;
  ELSE
    RAISE EXCEPTION 'Unsupported tax source line table';
  END IF;

  IF source_company IS NULL OR source_company IS DISTINCT FROM company_id_arg THEN
    RAISE EXCEPTION 'Tax source line belongs to another organisation';
  END IF;
  IF posted_id IS NOT NULL THEN
    RAISE EXCEPTION 'Posted tax source lines are immutable; reverse the document instead';
  END IF;
  IF tax_code_id_arg IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tax_codes c
    JOIN public.tax_rates r ON r.id=c.tax_rate_id AND r.company_id=c.company_id
    WHERE c.id=tax_code_id_arg AND c.company_id=company_id_arg
  ) THEN
    RAISE EXCEPTION 'Tax code and rate must belong to the source organisation';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_invoice_lines_tax_post_guard ON public.sales_invoice_lines;
CREATE TRIGGER sales_invoice_lines_tax_post_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.sales_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_tax_source_line_after_posting();

DROP TRIGGER IF EXISTS purchase_bill_lines_tax_post_guard ON public.purchase_bill_lines;
CREATE TRIGGER purchase_bill_lines_tax_post_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_bill_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_tax_source_line_after_posting();

REVOKE ALL ON FUNCTION public.lock_tax_masters_when_document_posted()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tax_source_line_after_posting()
  FROM PUBLIC, anon, authenticated;


-- Batch 08: other posted tax sources (credit notes and direct expenses).
-- Credit-note lines carry tax_minor/rate snapshots, but have NO tax_code_id
-- in the currently shipped schema. This guard protects posted source values,
-- not any unrecorded historical tax-code classification.

CREATE OR REPLACE FUNCTION public.guard_posted_tax_source_header()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Cannot move a tax source to another organisation';
  END IF;

  IF OLD.posted_journal_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.posted_journal_id IS DISTINCT FROM OLD.posted_journal_id THEN
    RAISE EXCEPTION 'Cannot replace or remove posted tax source journal evidence';
  END IF;

  IF TG_TABLE_NAME = 'purchase_expenses' THEN
    IF NEW.expense_date IS DISTINCT FROM OLD.expense_date
      OR NEW.expense_account_id IS DISTINCT FROM OLD.expense_account_id
      OR NEW.payment_account_id IS DISTINCT FROM OLD.payment_account_id
      OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
      OR NEW.net_minor IS DISTINCT FROM OLD.net_minor
      OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
      OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
    THEN
      RAISE EXCEPTION 'Posted tax source amounts and accounts are immutable; use a correction';
    END IF;
  ELSIF TG_TABLE_NAME IN ('sales_credit_notes', 'purchase_credit_notes') THEN
    IF NEW.credit_date IS DISTINCT FROM OLD.credit_date
      OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
      OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor
      OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
      OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
    THEN
      RAISE EXCEPTION 'Posted credit-note tax amounts and dates are immutable; reverse instead';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported tax source header table';
  END IF;

  -- Status and allocation bookkeeping may legitimately change after posting.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_credit_tax_posted_header_guard ON public.sales_credit_notes;
CREATE TRIGGER sales_credit_tax_posted_header_guard
BEFORE UPDATE ON public.sales_credit_notes
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_tax_source_header();

DROP TRIGGER IF EXISTS purchase_credit_tax_posted_header_guard ON public.purchase_credit_notes;
CREATE TRIGGER purchase_credit_tax_posted_header_guard
BEFORE UPDATE ON public.purchase_credit_notes
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_tax_source_header();

DROP TRIGGER IF EXISTS purchase_expense_tax_posted_header_guard ON public.purchase_expenses;
CREATE TRIGGER purchase_expense_tax_posted_header_guard
BEFORE UPDATE ON public.purchase_expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_tax_source_header();

-- Lock the parent credit header on any line mutation so that edits cannot
-- race the header update that records a posting journal.
CREATE OR REPLACE FUNCTION public.guard_posted_credit_note_tax_lines()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  parent_id uuid;
  requested_company uuid;
  parent_company uuid;
  posted_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := OLD.credit_note_id;
    requested_company := OLD.company_id;
  ELSE
    parent_id := NEW.credit_note_id;
    requested_company := NEW.company_id;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.credit_note_id IS DISTINCT FROM OLD.credit_note_id OR
    NEW.company_id IS DISTINCT FROM OLD.company_id
  ) THEN
    RAISE EXCEPTION 'Cannot move credit-note tax lines between sources';
  END IF;

  IF TG_TABLE_NAME = 'sales_credit_note_lines' THEN
    SELECT h.company_id, h.posted_journal_id INTO parent_company, posted_id
      FROM public.sales_credit_notes h WHERE h.id = parent_id FOR SHARE;
  ELSIF TG_TABLE_NAME = 'purchase_credit_note_lines' THEN
    SELECT h.company_id, h.posted_journal_id INTO parent_company, posted_id
      FROM public.purchase_credit_notes h WHERE h.id = parent_id FOR SHARE;
  ELSE
    RAISE EXCEPTION 'Unsupported credit-note line table';
  END IF;

  IF parent_company IS NULL OR parent_company IS DISTINCT FROM requested_company THEN
    RAISE EXCEPTION 'Credit-note tax line must belong to its source organisation';
  END IF;

  IF posted_id IS NOT NULL THEN
    RAISE EXCEPTION 'Posted credit-note tax lines are immutable; reverse instead';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_credit_tax_posted_lines_guard ON public.sales_credit_note_lines;
CREATE TRIGGER sales_credit_tax_posted_lines_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.sales_credit_note_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_credit_note_tax_lines();

DROP TRIGGER IF EXISTS purchase_credit_tax_posted_lines_guard ON public.purchase_credit_note_lines;
CREATE TRIGGER purchase_credit_tax_posted_lines_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_credit_note_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_credit_note_tax_lines();

REVOKE ALL ON FUNCTION public.guard_posted_tax_source_header()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_posted_credit_note_tax_lines()
  FROM PUBLIC, anon, authenticated;
