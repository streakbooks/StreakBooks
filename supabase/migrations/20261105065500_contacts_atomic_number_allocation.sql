-- Allocate Contact account numbers inside the SAME transaction as the contact INSERT.
-- Prevents the prior read/update race and rolls the allocation back if INSERT fails.
-- Existing manually supplied account numbers are preserved. No backfill is performed.
-- Apply database migration before deploying code that removes the legacy allocator.

CREATE OR REPLACE FUNCTION private.assign_contact_account_number_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _prefix text;
  _next integer;
  _candidate text;
  _attempts integer := 0;
BEGIN
  IF NEW.account_number IS NOT NULL
     AND pg_catalog.btrim(NEW.account_number) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'A company is required to allocate a contact number'
      USING ERRCODE = '23502';
  END IF;

  -- Match the existing contacts INSERT RLS permissions. Draft sales/purchase
  -- creators can add contacts but cannot edit the organisation's settings.
  -- A DEFINER trigger is necessary to update the settings counter without
  -- granting those users direct write access to all settings.
  IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT (
         public.has_company_permission(NEW.company_id, 'contacts.manage')
         OR public.has_company_permission(NEW.company_id, 'sales.draft')
         OR public.has_company_permission(NEW.company_id, 'purchases.draft')
       )
     ) THEN
    RAISE EXCEPTION 'Permission denied for automatic contact numbering'
      USING ERRCODE = '42501';
  END IF;

  -- Concurrent first inserts are serialised by the organisation primary key.
  INSERT INTO public.company_contact_settings (company_id)
  VALUES (NEW.company_id)
  ON CONFLICT (company_id) DO NOTHING;

  -- FOR UPDATE serialises all automatic allocations per organisation and also
  -- serialises settings edits that lock/update the same row.
  SELECT s.account_number_prefix, s.next_account_number
  INTO _prefix, _next
  FROM public.company_contact_settings s
  WHERE s.company_id = NEW.company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact numbering settings are unavailable'
      USING ERRCODE = 'P0002';
  END IF;
  _prefix := COALESCE(NULLIF(pg_catalog.btrim(_prefix), ''), 'C');

  LOOP
    IF _next IS NULL OR _next < 1 OR _next > 2147483646 THEN
      RAISE EXCEPTION 'Contact numbering limit reached. Review the next account number.'
        USING ERRCODE = '22003';
    END IF;
    _candidate := _prefix || _next::text;
    IF pg_catalog.length(_candidate) > 40 THEN
      RAISE EXCEPTION 'Automatic contact number exceeds the 40-character limit'
        USING ERRCODE = '22001';
    END IF;

    -- Earlier manually numbered contacts may use numbers in this sequence.
    -- The database unique index still blocks simultaneous manual collisions.
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.contacts c
      WHERE c.company_id = NEW.company_id
        AND c.account_number = _candidate
    );

    _next := _next + 1;
    _attempts := _attempts + 1;
    IF _attempts >= 100000 THEN
      RAISE EXCEPTION 'Too many existing contact numbers. Advance the sequence in Contacts settings.'
        USING ERRCODE = '54000';
    END IF;
  END LOOP;

  UPDATE public.company_contact_settings s
  SET next_account_number = _next + 1,
      updated_at = GREATEST(
        pg_catalog.clock_timestamp(),
        s.updated_at + INTERVAL '1 microsecond'
      )
  WHERE s.company_id = NEW.company_id;

  NEW.account_number := _candidate;
  RETURN NEW;
END;
$$;

-- This helper is trigger-only, never a caller-facing RPC.
REVOKE ALL ON FUNCTION private.assign_contact_account_number_before_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contacts_allocate_account_number_before_insert
  ON public.contacts;
CREATE TRIGGER contacts_allocate_account_number_before_insert
BEFORE INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION private.assign_contact_account_number_before_insert();
