-- Add the optional delivery address line 2 used by the Contacts editor.
-- Safe and additive: no existing rows are modified or removed.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS delivery_address_line2 text;
