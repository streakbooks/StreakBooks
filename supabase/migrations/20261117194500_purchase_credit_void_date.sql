-- Record void_date on supplier credit notes for historical AP as-at honesty (parity with sales credits / B5 bills).

ALTER TABLE public.purchase_credit_notes
  ADD COLUMN IF NOT EXISTS void_date DATE;

ALTER TABLE public.purchase_credit_notes
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

COMMENT ON COLUMN public.purchase_credit_notes.void_date IS
  'Calendar date the credit left the AP subledger. Required for dated Aged Payables; null on non-void credits.';
COMMENT ON COLUMN public.purchase_credit_notes.void_reason IS
  'Mandatory human reason captured when voiding a supplier credit note.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_credit_notes_void_date_gte_credit_date'
  ) THEN
    ALTER TABLE public.purchase_credit_notes
      ADD CONSTRAINT purchase_credit_notes_void_date_gte_credit_date
      CHECK (void_date IS NULL OR void_date >= credit_date);
  END IF;
END $$;
