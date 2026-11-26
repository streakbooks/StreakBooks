ALTER TABLE public.companies
  ADD COLUMN legal_name text,
  ADD COLUMN country_code text NOT NULL DEFAULT 'GB',
  ADD COLUMN fiscal_year_end_month smallint NOT NULL DEFAULT 3,
  ADD COLUMN fiscal_year_end_day smallint NOT NULL DEFAULT 31,
  ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/London';

ALTER TABLE public.company_tax_settings
  ADD COLUMN tax_regime text NOT NULL DEFAULT 'none',
  ADD COLUMN registration_number text;
UPDATE public.company_tax_settings SET prices_include_tax = false
WHERE prices_include_tax IS NULL;
ALTER TABLE public.company_tax_settings
  ALTER COLUMN prices_include_tax SET DEFAULT false,
  ALTER COLUMN prices_include_tax SET NOT NULL;
GRANT UPDATE ON public.companies, public.company_tax_settings TO authenticated;

INSERT INTO public.companies (
  id, name, base_currency, timezone, legal_name, country_code,
  fiscal_year_end_month, fiscal_year_end_day
) VALUES
  ('10000000-0000-4000-8000-000000000011','Company Identity Fixture','GBP','Europe/London',
   'Fixture Legal Entity','GB',3,31),
  ('10000000-0000-4000-8000-000000000012','Unauthorised Fixture','GBP','Europe/London',
   NULL,'GB',3,31);
INSERT INTO public.company_tax_settings (company_id, tax_regime, registration_number, prices_include_tax)
VALUES
  ('10000000-0000-4000-8000-000000000011','vat','GB123456789',false),
  ('10000000-0000-4000-8000-000000000012','none',NULL,false);
INSERT INTO public.test_permissions(company_id, user_id, permission)
VALUES ('10000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000001','company.settings.edit');
