-- Isolated contacts test schema: the normal workflow baseline already creates
-- companies, contacts, auth.uid, permissions, and authenticated/anon/service_role.
ALTER TABLE public.contacts
  ADD COLUMN account_number text;
ALTER TABLE public.contacts
  ALTER COLUMN id SET DEFAULT pg_catalog.gen_random_uuid();

CREATE UNIQUE INDEX contacts_company_account_number_uidx
  ON public.contacts (company_id, account_number)
  WHERE account_number IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(account_number)) > 0;
CREATE UNIQUE INDEX contacts_company_name_active_uidx
  ON public.contacts (company_id, pg_catalog.lower(pg_catalog.btrim(name)))
  WHERE is_active = true;

CREATE TABLE public.company_contact_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id),
  default_kind text NOT NULL DEFAULT 'customer',
  account_number_prefix text NOT NULL DEFAULT 'C',
  next_account_number integer NOT NULL DEFAULT 1001,
  default_payment_terms_days integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_contact_settings TO authenticated;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contact_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_insert_test ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_company_permission(company_id, 'contacts.manage')
    OR public.has_company_permission(company_id, 'sales.draft')
    OR public.has_company_permission(company_id, 'purchases.draft')
  );
CREATE POLICY contacts_read_test ON public.contacts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY contact_settings_manage_test ON public.company_contact_settings FOR ALL TO authenticated
  USING (public.has_company_permission(company_id, 'contacts.manage'))
  WITH CHECK (public.has_company_permission(company_id, 'contacts.manage'));
CREATE POLICY contact_settings_read_test ON public.company_contact_settings FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

INSERT INTO public.test_permissions(company_id,user_id,permission) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','contacts.manage'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','sales.draft');

-- Test rollback of the counter if a later insert trigger or constraint fails.
CREATE FUNCTION public.test_contact_insert_failure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name = 'Numbering Forced Rollback' THEN
    RAISE EXCEPTION 'Injected contact insertion failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_contact_insert_failure
AFTER INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.test_contact_insert_failure();
