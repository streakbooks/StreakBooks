-- Use the same tenant/maintenance/subscription write guard as existing branding settings.
CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_themes FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard('accounting');
CREATE TRIGGER platform_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_theme_defaults FOR EACH ROW EXECUTE FUNCTION private.platform_write_guard('accounting');
CREATE OR REPLACE FUNCTION private.resolve_document_appearance(_company_id uuid,_kind text,_contact_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE co jsonb;br jsonb;cfg jsonb;party jsonb;th public.document_themes;
BEGIN
 SELECT jsonb_build_object('name',name,'legal_name',legal_name,'base_currency',base_currency,'timezone',timezone,'locale',locale,'date_format',date_format,'document_theme_color',document_theme_color,'invoice_footer',invoice_footer) INTO co FROM public.companies WHERE id=_company_id FOR SHARE;
 SELECT to_jsonb(b)-'company_id'-'updated_at' INTO br FROM public.company_branding b WHERE company_id=_company_id FOR SHARE;
 SELECT t.* INTO th FROM public.document_themes t JOIN public.document_theme_defaults d ON d.company_id=t.company_id AND d.theme_id=t.id WHERE d.company_id=_company_id AND d.kind=_kind FOR SHARE OF t;
 cfg:=coalesce(th.config,'{}');br:=coalesce(br,'{}')||cfg;
 IF cfg?'logo_path' THEN br:=br||jsonb_build_object('logo_url',NULL); END IF;
 IF cfg?'accent_color' THEN co:=co||jsonb_build_object('document_theme_color',cfg->'accent_color'); END IF;
 IF cfg?'footer_text' THEN co:=co||jsonb_build_object('invoice_footer',cfg->'footer_text'); END IF;
 SELECT jsonb_build_object('name',name,'billing_address_line1',billing_address_line1,'billing_address_line2',billing_address_line2,'billing_city',billing_city,'billing_region',billing_region,'billing_postal',billing_postal,'billing_country',billing_country,'tax_number',tax_number,'email',email,'phone',phone) INTO party FROM public.contacts WHERE company_id=_company_id AND id=_contact_id;
 RETURN jsonb_build_object('company',co,'branding',br,'party',party,'theme_id',th.id,'theme_revision',th.revision);
END $$;
CREATE OR REPLACE FUNCTION public.save_document_branding(_company_id uuid,_values jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.company_branding;previous_path text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'company.settings.edit') THEN RAISE EXCEPTION 'Settings permission required' USING ERRCODE='42501'; END IF;
 PERFORM private.validate_document_theme(_company_id,_values);
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_values)k WHERE k NOT IN ('trading_name','letterhead_line','invoice_email','invoice_phone','address_text','tax_number','bank_details','payment_instructions','default_notes','logo_path','accent_color','footer_text')) THEN RAISE EXCEPTION 'Unsupported global branding setting'; END IF;
 PERFORM 1 FROM public.companies WHERE id=_company_id FOR UPDATE;
 SELECT logo_path INTO previous_path FROM public.company_branding WHERE company_id=_company_id FOR UPDATE;
 b:=jsonb_populate_record(NULL::public.company_branding,_values||jsonb_build_object('company_id',_company_id));
 IF NOT(_values?'logo_path') THEN b.logo_path:=previous_path; END IF;
 INSERT INTO public.company_branding(company_id,trading_name,letterhead_line,invoice_email,invoice_phone,address_text,tax_number,bank_details,payment_instructions,default_notes,logo_path,updated_at)
 VALUES(_company_id,b.trading_name,b.letterhead_line,b.invoice_email,b.invoice_phone,b.address_text,b.tax_number,b.bank_details,b.payment_instructions,b.default_notes,b.logo_path,now())
 ON CONFLICT(company_id) DO UPDATE SET trading_name=EXCLUDED.trading_name,letterhead_line=EXCLUDED.letterhead_line,invoice_email=EXCLUDED.invoice_email,invoice_phone=EXCLUDED.invoice_phone,address_text=EXCLUDED.address_text,tax_number=EXCLUDED.tax_number,bank_details=EXCLUDED.bank_details,payment_instructions=EXCLUDED.payment_instructions,default_notes=EXCLUDED.default_notes,logo_path=EXCLUDED.logo_path,logo_url=CASE WHEN _values?'logo_path' THEN NULL ELSE public.company_branding.logo_url END,updated_at=now();
 UPDATE public.companies SET document_theme_color=coalesce(_values->>'accent_color','#0F766E'),invoice_footer=coalesce(_values->>'footer_text','') WHERE id=_company_id;
 PERFORM public.record_audit_event(_company_id,'settings.branding','company',_company_id,'{}');
END $$;
REVOKE ALL ON FUNCTION public.save_document_branding(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_document_branding(uuid,jsonb) TO authenticated;

-- Public token view retains the same issued appearance and existing customer privacy boundary.
