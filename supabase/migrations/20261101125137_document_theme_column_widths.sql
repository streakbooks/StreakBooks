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
  ELSIF k IN ('quantity_width','unit_price_width','discount_width','tax_width','amount_width','heading_size','logo_width','logo_height','description_width','cell_padding','line_height') THEN
   IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'Layout values must be numeric'; END IF;
   IF (k IN ('quantity_width','unit_price_width','discount_width','tax_width') AND s::numeric NOT BETWEEN 5 AND 35) OR (k='amount_width' AND s::numeric NOT BETWEEN 10 AND 40) OR (k='heading_size' AND s::numeric NOT BETWEEN 16 AND 36) OR (k='logo_width' AND s::numeric NOT BETWEEN 40 AND 260) OR (k='logo_height' AND s::numeric NOT BETWEEN 24 AND 120) OR (k='description_width' AND s::numeric NOT BETWEEN 25 AND 70) OR (k='cell_padding' AND s::numeric NOT BETWEEN 3 AND 12) OR (k='line_height' AND s::numeric NOT BETWEEN 1.2 AND 2) THEN RAISE EXCEPTION 'Layout value out of range'; END IF;
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

