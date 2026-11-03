CREATE OR REPLACE FUNCTION private.validate_document_theme(_company uuid,cfg jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;v jsonb;s text;
BEGIN
 IF jsonb_typeof(cfg) IS DISTINCT FROM 'object' OR octet_length(cfg::text)>16000 THEN RAISE EXCEPTION 'Invalid theme configuration'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(cfg) LOOP
  s:=v#>>'{}';
  IF k IN ('trading_name','letterhead_line','invoice_email','invoice_phone','address_text','tax_number','bank_details','payment_instructions','default_notes','footer_text','logo_path') THEN
   IF jsonb_typeof(v) NOT IN ('string','null') OR length(coalesce(s,''))>2000 THEN RAISE EXCEPTION 'Invalid theme text: %',k; END IF;
   IF k='logo_path' AND nullif(s,'') IS NOT NULL AND (s NOT LIKE _company::text||'/%' OR position('..' IN s)>0 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='org-logos' AND name=s)) THEN RAISE EXCEPTION 'Logo must be an existing image in this organisation'; END IF;
   IF k='invoice_email' AND nullif(s,'') IS NOT NULL AND s!~'^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'Invalid invoice email'; END IF;
  ELSIF k IN ('accent_color','secondary_color','heading_color','table_header_color','text_color','background_color') THEN IF s IS NULL OR s!~'^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid accent colour'; END IF;
  ELSIF k='font_family' THEN IF s IS NULL OR s NOT IN ('sans','serif','mono') THEN RAISE EXCEPTION 'Invalid font'; END IF;
  ELSIF k='font_size' THEN IF jsonb_typeof(v)<>'number' OR s::numeric NOT BETWEEN 11 AND 18 THEN RAISE EXCEPTION 'Font size must be 11 to 18'; END IF;
  ELSIF k='margin_mm' THEN IF jsonb_typeof(v)<>'number' OR s::numeric NOT BETWEEN 8 AND 25 THEN RAISE EXCEPTION 'Margins must be 8 to 25 mm'; END IF;
  ELSIF k IN ('heading_size','logo_width','logo_height','description_width','cell_padding','line_height') THEN
   IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'Layout values must be numeric'; END IF;
   IF (k='heading_size' AND s::numeric NOT BETWEEN 16 AND 36) OR (k='logo_width' AND s::numeric NOT BETWEEN 40 AND 260) OR (k='logo_height' AND s::numeric NOT BETWEEN 24 AND 120) OR (k='description_width' AND s::numeric NOT BETWEEN 25 AND 70) OR (k='cell_padding' AND s::numeric NOT BETWEEN 3 AND 12) OR (k='line_height' AND s::numeric NOT BETWEEN 1.2 AND 2) THEN RAISE EXCEPTION 'Layout value out of range'; END IF;
  ELSIF k='orientation' THEN IF s IS NULL OR s NOT IN ('portrait','landscape') THEN RAISE EXCEPTION 'Invalid orientation'; END IF;
  ELSIF k IN ('heading_weight','body_weight') THEN IF s IS NULL OR (k='heading_weight' AND s NOT IN ('400','600','700')) OR (k='body_weight' AND s NOT IN ('400','500','600')) THEN RAISE EXCEPTION 'Invalid font weight'; END IF;
  ELSIF k='title_position' THEN IF s IS NULL OR s NOT IN ('left','center','right') THEN RAISE EXCEPTION 'Invalid title position'; END IF;
  ELSIF k='table_style' THEN IF s IS NULL OR s NOT IN ('lined','striped','minimal') THEN RAISE EXCEPTION 'Invalid table style'; END IF;
  ELSIF k='page_size' THEN IF s IS NULL OR s NOT IN ('A4','Letter') THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  ELSIF k='logo_position' THEN IF s IS NULL OR s NOT IN ('left','center','right') THEN RAISE EXCEPTION 'Invalid logo position'; END IF;
  ELSIF k='header_layout' THEN IF s IS NULL OR s NOT IN ('split','stacked') THEN RAISE EXCEPTION 'Invalid header layout'; END IF;
  ELSIF k='footer_alignment' THEN IF s IS NULL OR s NOT IN ('left','center','right') THEN RAISE EXCEPTION 'Invalid footer alignment'; END IF;
  ELSIF k IN ('show_bank_details','show_number','show_date','show_due_date','show_customer','show_billing_address','show_shipping_address','show_description','show_subtotal','show_total','show_contact_details','show_quantity','show_unit_price','show_discount','show_tax_rates','show_tax_summary','show_payment_details','show_notes') THEN
   IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Invalid visibility option'; END IF;
  ELSE RAISE EXCEPTION 'Unknown theme setting: %',k;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.validate_document_theme(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_document_theme_default(_company_id uuid,_kind text,_theme_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'company.settings.edit') THEN RAISE EXCEPTION 'Settings permission required' USING ERRCODE='42501'; END IF;
 IF _kind IS NULL OR _kind NOT IN ('customer_statement','sales_invoice','sales_credit_note','sales_quote','sales_receipt','purchase_bill','purchase_order','purchase_credit_note','supplier_remittance') THEN RAISE EXCEPTION 'Unknown document type'; END IF;
 PERFORM 1 FROM public.companies WHERE id=_company_id FOR UPDATE;
 IF _theme_id IS NULL THEN DELETE FROM public.document_theme_defaults WHERE company_id=_company_id AND kind=_kind;
 ELSE INSERT INTO public.document_theme_defaults(company_id,kind,theme_id) VALUES(_company_id,_kind,_theme_id) ON CONFLICT(company_id,kind) DO UPDATE SET theme_id=EXCLUDED.theme_id; END IF;
 PERFORM public.record_audit_event(_company_id,'document_theme.default','company',_company_id,jsonb_build_object('kind',_kind,'theme_id',_theme_id));
END $$;

ALTER TABLE public.document_theme_defaults DROP CONSTRAINT document_theme_defaults_kind_check;
ALTER TABLE public.document_theme_defaults ADD CONSTRAINT document_theme_defaults_kind_check CHECK(kind IN ('customer_statement','sales_invoice','sales_quote','sales_credit_note','sales_receipt','purchase_bill','purchase_order','purchase_credit_note','supplier_remittance'));
CREATE FUNCTION public.get_document_theme_context(_company_id uuid,_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF _kind IS NULL OR _kind NOT IN ('customer_statement','sales_invoice','sales_quote','sales_credit_note','sales_receipt','purchase_bill','purchase_order','purchase_credit_note','supplier_remittance') THEN RAISE EXCEPTION 'Unknown document type'; END IF;
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT (public.has_company_permission(_company_id,'company.settings.edit') OR public.has_company_permission(_company_id,CASE WHEN _kind LIKE 'purchase_%' OR _kind='supplier_remittance' THEN 'purchases.view' ELSE 'sales.view' END)) THEN RAISE EXCEPTION 'Document access required' USING ERRCODE='42501'; END IF;
 RETURN private.resolve_document_appearance(_company_id,_kind,NULL);
END $$;
REVOKE ALL ON FUNCTION public.get_document_theme_context(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_document_theme_context(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION private.logo_is_retained(path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.issued_document_appearances WHERE appearance#>>'{branding,logo_path}'=path)
 OR EXISTS(SELECT 1 FROM public.document_themes WHERE config->>'logo_path'=path)
 OR EXISTS(SELECT 1 FROM public.company_branding WHERE logo_path=path);
$$;
CREATE INDEX document_theme_logo ON public.document_themes((config->>'logo_path')) WHERE config->>'logo_path' IS NOT NULL;
