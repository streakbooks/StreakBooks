-- The nonprofit fixture's contact table is narrower than production.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
