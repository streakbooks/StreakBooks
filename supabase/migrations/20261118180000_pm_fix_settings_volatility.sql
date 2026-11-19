-- Hotfix: get_pm_* helpers call private.pm_ensure_settings (INSERT ON CONFLICT).
-- Declaring them STABLE forces a read-only transaction and raises:
--   "cannot execute INSERT in a read-only transaction"
-- Recreate as VOLATILE (default) so first-load settings bootstrap works.

CREATE OR REPLACE FUNCTION public.get_pm_settings(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.pm_settings%ROWTYPE;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');
  PERFORM private.pm_ensure_settings(_company_id);
  SELECT * INTO _row FROM public.pm_settings WHERE company_id = _company_id;
  RETURN jsonb_build_object(
    'companyId', _row.company_id,
    'enabled', _row.enabled,
    'defaultRentalMode', _row.default_rental_mode,
    'defaultBusinessModel', _row.default_business_model,
    'propertyNumberPrefix', _row.property_number_prefix,
    'requireOwnershipHundredPct', _row.require_ownership_hundred_pct,
    'version', _row.version,
    'updatedAt', _row.updated_at
  ) || private.pm_settings_accounts_to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pm_dashboard_kpis(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _enabled BOOLEAN := false;
BEGIN
  PERFORM private.pm_require_permission(_company_id, 'property.view');
  PERFORM private.pm_ensure_settings(_company_id);

  SELECT enabled INTO _enabled FROM public.pm_settings WHERE company_id = _company_id;

  RETURN jsonb_build_object(
    'propertyCount', (
      SELECT count(*) FROM public.pm_properties p
      WHERE p.company_id = _company_id AND p.status <> 'archived'
    ),
    'unitCount', (
      SELECT count(*) FROM public.pm_units u
      WHERE u.company_id = _company_id AND u.status <> 'archived'
    ),
    'ownerCount', (
      SELECT count(*) FROM public.pm_owners o
      WHERE o.company_id = _company_id AND o.status = 'active'
    ),
    'activeAgreementCount', (
      SELECT count(*) FROM public.pm_management_agreements a
      WHERE a.company_id = _company_id AND a.status = 'active'
    ),
    'enabled', COALESCE(_enabled, false),
    'currencyNote', 'Count KPIs only — monetary totals use period, basis and currency after posting.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pm_trust_summary(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _settings public.pm_settings%ROWTYPE;
  _can BOOLEAN := false;
BEGIN
  PERFORM private.pm_ensure_settings(_company_id);
  SELECT * INTO _settings FROM public.pm_settings WHERE company_id = _company_id;

  _can := public.is_company_member(_company_id)
    AND (
      public.has_company_permission(_company_id, 'property.trust.reconcile')
      OR public.has_company_permission(_company_id, 'property.view')
    );
  IF NOT _can THEN
    RAISE EXCEPTION 'Missing permission' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'trustBankAccountId', _settings.trust_bank_account_id,
    'trustBankMapped', _settings.trust_bank_account_id IS NOT NULL,
    'operatingBankMapped', _settings.operating_bank_account_id IS NOT NULL,
    'coaReady', (
      _settings.rent_income_account_id IS NOT NULL
      AND _settings.rent_receivable_account_id IS NOT NULL
      AND _settings.owner_payable_account_id IS NOT NULL
      AND _settings.commission_income_account_id IS NOT NULL
      AND _settings.operating_bank_account_id IS NOT NULL
    ),
    'openDistributionDraftCount', (
      SELECT count(*)::int FROM public.pm_owner_distributions d
      WHERE d.company_id = _company_id AND d.status = 'draft'
    ),
    'postedDistributionTotalMinor', COALESCE((
      SELECT sum(d.amount_minor) FROM public.pm_owner_distributions d
      WHERE d.company_id = _company_id AND d.status = 'posted'
    ), 0),
    'activePortalCount', (
      SELECT count(*)::int FROM public.pm_portal_access p
      WHERE p.company_id = _company_id AND p.status = 'active'
    ),
    'reserveTotalMinor', COALESCE((
      SELECT sum(r.amount_minor) FROM public.pm_owner_reserves r
      WHERE r.company_id = _company_id
        AND r.effective_from <= CURRENT_DATE
        AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
    ), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pm_settings(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pm_dashboard_kpis(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pm_trust_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pm_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pm_dashboard_kpis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pm_trust_summary(UUID) TO authenticated;
