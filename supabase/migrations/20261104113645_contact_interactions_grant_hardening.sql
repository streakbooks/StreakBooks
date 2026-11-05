-- Remove default authenticated table privileges not needed for append-only contact history.
-- RLS still enforces organisation membership and contacts.manage.
REVOKE ALL ON public.contact_interactions FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contact_interactions TO authenticated;
