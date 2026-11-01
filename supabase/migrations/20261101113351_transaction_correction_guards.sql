-- Keep the seeded rounding account outside ordinary P&L corrections.
CREATE OR REPLACE FUNCTION private.correction_account_ok(a public.accounts) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT a.account_type IN ('income','expense') AND a.is_active AND a.is_postable AND NOT a.is_control AND NOT a.is_header
 AND a.archived_at IS NULL AND a.system_key IS NULL AND coalesce(a.subtype,'') NOT IN ('rounding','fx_gain','fx_loss','depreciation')
 AND coalesce(a.account_kind,'')<>'depreciation' AND NOT(a.is_system AND a.code='6900');
$$;
CREATE FUNCTION public.transaction_correction_setup(_company_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base text; decimals integer; accounts jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'accounting.view') THEN RAISE EXCEPTION 'Accounting access required' USING ERRCODE='42501'; END IF;
 SELECT c.base_currency::text,d.decimal_places INTO base,decimals FROM public.companies c JOIN public.currency_decimals d ON d.code=c.base_currency WHERE c.id=_company_id;
 IF base IS NULL THEN RAISE EXCEPTION 'Company currency is not configured'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'type',a.account_type,'eligible',private.correction_account_ok(a) AND (a.currency_code IS NULL OR a.currency_code::text=base)) ORDER BY a.code),'[]') INTO accounts
 FROM public.accounts a WHERE a.company_id=_company_id AND a.account_type IN ('income','expense');
 RETURN jsonb_build_object('currency',base,'decimals',decimals,'accounts',accounts,'can_apply',public.has_company_permission(_company_id,'accounting.post') AND public.has_company_permission(_company_id,'journals.manual'));
END $$;
REVOKE ALL ON FUNCTION public.transaction_correction_setup(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_correction_setup(uuid) TO authenticated;
