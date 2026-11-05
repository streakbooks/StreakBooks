-- Basic Global Payroll Batch 1: journal source type for payroll postings.
--
-- Kept in its own file because a new enum value cannot be used in the transaction that adds it.
-- Later payroll posting migrations only reference 'payroll' at run time, after this commits.
-- Idempotent (IF NOT EXISTS). No data is touched.

ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'payroll';
