-- Record void_date on purchase bills for historical AP as-at honesty (parity with sales invoices).

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS void_date DATE;

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

COMMENT ON COLUMN public.purchase_bills.void_date IS
  'Calendar date the bill left the AP subledger. Required for dated Aged Payables; null on non-void bills.';
COMMENT ON COLUMN public.purchase_bills.void_reason IS
  'Mandatory human reason captured when voiding a bill.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_bills_void_date_gte_bill_date'
  ) THEN
    ALTER TABLE public.purchase_bills
      ADD CONSTRAINT purchase_bills_void_date_gte_bill_date
      CHECK (void_date IS NULL OR void_date >= bill_date);
  END IF;
END $$;
