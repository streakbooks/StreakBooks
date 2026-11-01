-- Document appearance is separate from the immutable accounting ledger.
CREATE TABLE public.document_themes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), config jsonb NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,name)
);
CREATE TABLE public.document_theme_defaults (
 company_id uuid NOT NULL REFERENCES public.companies(id),kind text NOT NULL CHECK(kind IN ('sales_invoice','sales_credit_note','sales_quote','sales_receipt','purchase_bill','purchase_order','purchase_credit_note','supplier_remittance')),
 theme_id uuid NOT NULL, PRIMARY KEY(company_id,kind), FOREIGN KEY(company_id,theme_id) REFERENCES public.document_themes(company_id,id)
);
CREATE INDEX document_theme_defaults_theme ON public.document_theme_defaults(company_id,theme_id);
CREATE TABLE public.issued_document_appearances (
 company_id uuid NOT NULL REFERENCES public.companies(id),kind text NOT NULL,document_id uuid NOT NULL,
 appearance jsonb NOT NULL,theme_id uuid,theme_revision integer,captured_at timestamptz NOT NULL DEFAULT now(),
 provenance text NOT NULL CHECK(provenance IN ('issued','legacy_baseline')),
 PRIMARY KEY(company_id,kind,document_id),FOREIGN KEY(company_id,theme_id) REFERENCES public.document_themes(company_id,id)
);
CREATE INDEX issued_appearance_theme ON public.issued_document_appearances(company_id,theme_id) WHERE theme_id IS NOT NULL;
DO $$DECLARE tbl text;BEGIN
 FOREACH tbl IN ARRAY ARRAY['document_themes','document_theme_defaults','issued_document_appearances'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY document_appearance_read ON public.%I FOR SELECT TO authenticated USING(public.has_company_permission(company_id,''sales.view'') OR public.has_company_permission(company_id,''purchases.view'') OR public.has_company_permission(company_id,''company.settings.edit''))',tbl);
  EXECUTE format('CREATE POLICY mfa_aal2_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.mfa_requirement_met())) WITH CHECK((SELECT private.mfa_requirement_met()))',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);
 END LOOP;
END $$;
-- Issued snapshots are available only through the source permission-checked RPC, not broad SELECT.
REVOKE SELECT ON public.issued_document_appearances FROM authenticated;

CREATE FUNCTION private.validate_document_theme(_company uuid,cfg jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;v jsonb;s text;
BEGIN
 IF jsonb_typeof(cfg) IS DISTINCT FROM 'object' OR octet_length(cfg::text)>16000 THEN RAISE EXCEPTION 'Invalid theme configuration'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(cfg) LOOP
  s:=v#>>'{}';
  IF k IN ('trading_name','letterhead_line','invoice_email','invoice_phone','address_text','tax_number','bank_details','payment_instructions','default_notes','footer_text','logo_path') THEN
   IF jsonb_typeof(v) NOT IN ('string','null') OR length(coalesce(s,''))>2000 THEN RAISE EXCEPTION 'Invalid theme text: %',k; END IF;
   IF k='logo_path' AND nullif(s,'') IS NOT NULL AND (s NOT LIKE _company::text||'/%' OR position('..' IN s)>0 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='org-logos' AND name=s)) THEN RAISE EXCEPTION 'Logo must be an existing image in this organisation'; END IF;
   IF k='invoice_email' AND nullif(s,'') IS NOT NULL AND s!~'^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'Invalid invoice email'; END IF;
  ELSIF k='accent_color' THEN IF s IS NULL OR s!~'^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid accent colour'; END IF;
  ELSIF k='font_family' THEN IF s IS NULL OR s NOT IN ('sans','serif','mono') THEN RAISE EXCEPTION 'Invalid font'; END IF;
  ELSIF k='font_size' THEN IF jsonb_typeof(v)<>'number' OR s::numeric NOT BETWEEN 11 AND 18 THEN RAISE EXCEPTION 'Font size must be 11 to 18'; END IF;
  ELSIF k='margin_mm' THEN IF jsonb_typeof(v)<>'number' OR s::numeric NOT BETWEEN 8 AND 25 THEN RAISE EXCEPTION 'Margins must be 8 to 25 mm'; END IF;
  ELSIF k='page_size' THEN IF s IS NULL OR s NOT IN ('A4','Letter') THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  ELSIF k='logo_position' THEN IF s IS NULL OR s NOT IN ('left','center','right') THEN RAISE EXCEPTION 'Invalid logo position'; END IF;
  ELSIF k='header_layout' THEN IF s IS NULL OR s NOT IN ('split','stacked') THEN RAISE EXCEPTION 'Invalid header layout'; END IF;
  ELSIF k='footer_alignment' THEN IF s IS NULL OR s NOT IN ('left','center','right') THEN RAISE EXCEPTION 'Invalid footer alignment'; END IF;
  ELSIF k IN ('show_contact_details','show_quantity','show_unit_price','show_discount','show_tax_rates','show_tax_summary','show_payment_details','show_notes') THEN
   IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Invalid visibility option'; END IF;
  ELSE RAISE EXCEPTION 'Unknown theme setting: %',k;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.validate_document_theme(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_document_theme(_company_id uuid,_id uuid,_revision integer,_name text,_config jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.document_themes;
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'company.settings.edit') THEN RAISE EXCEPTION 'Settings permission required' USING ERRCODE='42501'; END IF;
 IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Theme name required (maximum 100 characters)'; END IF;
 PERFORM private.validate_document_theme(_company_id,_config);
 PERFORM 1 FROM public.companies WHERE id=_company_id FOR UPDATE;
 IF _id IS NULL THEN INSERT INTO public.document_themes(company_id,name,config) VALUES(_company_id,trim(_name),_config) RETURNING * INTO r;
 ELSE
  UPDATE public.document_themes SET name=trim(_name),config=_config,revision=revision+1,updated_at=now() WHERE id=_id AND company_id=_company_id AND revision=_revision RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Theme changed or is inaccessible. Reload before saving' USING ERRCODE='40001'; END IF;
 END IF;
 PERFORM public.record_audit_event(_company_id,'document_theme.saved','document_theme',r.id,jsonb_build_object('revision',r.revision,'name',r.name));
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.set_document_theme_default(_company_id uuid,_kind text,_theme_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'company.settings.edit') THEN RAISE EXCEPTION 'Settings permission required' USING ERRCODE='42501'; END IF;
 IF _kind IS NULL OR _kind NOT IN ('sales_invoice','sales_credit_note','sales_quote','sales_receipt','purchase_bill','purchase_order','purchase_credit_note','supplier_remittance') THEN RAISE EXCEPTION 'Unknown document type'; END IF;
 PERFORM 1 FROM public.companies WHERE id=_company_id FOR UPDATE;
 IF _theme_id IS NULL THEN DELETE FROM public.document_theme_defaults WHERE company_id=_company_id AND kind=_kind;
 ELSE INSERT INTO public.document_theme_defaults(company_id,kind,theme_id) VALUES(_company_id,_kind,_theme_id) ON CONFLICT(company_id,kind) DO UPDATE SET theme_id=EXCLUDED.theme_id; END IF;
 PERFORM public.record_audit_event(_company_id,'document_theme.default','company',_company_id,jsonb_build_object('kind',_kind,'theme_id',_theme_id));
END $$;
CREATE FUNCTION public.delete_document_theme(_company_id uuid,_id uuid,_revision integer) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,'company.settings.edit') THEN RAISE EXCEPTION 'Settings permission required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.companies WHERE id=_company_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.document_theme_defaults WHERE company_id=_company_id AND theme_id=_id) OR EXISTS(SELECT 1 FROM public.issued_document_appearances WHERE company_id=_company_id AND theme_id=_id) THEN RAISE EXCEPTION 'Used themes cannot be deleted; change defaults or keep the historical theme'; END IF;
 DELETE FROM public.document_themes WHERE company_id=_company_id AND id=_id AND revision=_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Theme changed or is inaccessible. Reload before deleting' USING ERRCODE='40001'; END IF;
 PERFORM public.record_audit_event(_company_id,'document_theme.deleted','document_theme',_id,'{}');
END $$;
REVOKE ALL ON FUNCTION public.save_document_theme(uuid,uuid,integer,text,jsonb),public.set_document_theme_default(uuid,text,uuid),public.delete_document_theme(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_document_theme(uuid,uuid,integer,text,jsonb),public.set_document_theme_default(uuid,text,uuid),public.delete_document_theme(uuid,uuid,integer) TO authenticated;

CREATE FUNCTION private.resolve_document_appearance(_company_id uuid,_kind text,_contact_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE co jsonb;br jsonb;cfg jsonb;party jsonb;th public.document_themes;
BEGIN
 SELECT jsonb_build_object('name',name,'legal_name',legal_name,'base_currency',base_currency,'timezone',timezone,'locale',locale,'date_format',date_format,'document_theme_color',document_theme_color,'invoice_footer',invoice_footer) INTO co FROM public.companies WHERE id=_company_id FOR SHARE;
 SELECT to_jsonb(b)-'company_id'-'updated_at' INTO br FROM public.company_branding b WHERE company_id=_company_id FOR SHARE;
 SELECT t.* INTO th FROM public.document_themes t JOIN public.document_theme_defaults d ON d.company_id=t.company_id AND d.theme_id=t.id WHERE d.company_id=_company_id AND d.kind=_kind FOR SHARE OF t;
 cfg:=coalesce(th.config,'{}');br:=coalesce(br,'{}')||cfg;
 IF cfg?'accent_color' THEN co:=co||jsonb_build_object('document_theme_color',cfg->'accent_color'); END IF;
 IF cfg?'footer_text' THEN co:=co||jsonb_build_object('invoice_footer',cfg->'footer_text'); END IF;
 SELECT jsonb_build_object('name',name,'billing_address_line1',billing_address_line1,'billing_address_line2',billing_address_line2,'billing_city',billing_city,'billing_region',billing_region,'billing_postal',billing_postal,'billing_country',billing_country,'tax_number',tax_number,'email',email,'phone',phone) INTO party FROM public.contacts WHERE company_id=_company_id AND id=_contact_id;
 RETURN jsonb_build_object('company',co,'branding',br,'party',party,'theme_id',th.id,'theme_revision',th.revision);
END $$;
CREATE FUNCTION private.capture_issued_appearance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb;
BEGIN
 IF NEW.status::text='draft' OR EXISTS(SELECT 1 FROM public.issued_document_appearances WHERE company_id=NEW.company_id AND kind=TG_ARGV[0] AND document_id=NEW.id) THEN RETURN NEW; END IF;
 a:=private.resolve_document_appearance(NEW.company_id,TG_ARGV[0],NEW.contact_id);
 INSERT INTO public.issued_document_appearances(company_id,kind,document_id,appearance,theme_id,theme_revision,provenance)
 VALUES(NEW.company_id,TG_ARGV[0],NEW.id,a,(a->>'theme_id')::uuid,(a->>'theme_revision')::integer,'issued') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.resolve_document_appearance(uuid,text,uuid),private.capture_issued_appearance() FROM PUBLIC,anon,authenticated;
DO $$DECLARE tbl text;kind text; r record;a jsonb;BEGIN
 FOR tbl,kind IN SELECT * FROM (VALUES('sales_invoices','sales_invoice'),('sales_credit_notes','sales_credit_note'),('sales_quotes','sales_quote'),('sales_receipts','sales_receipt'),('purchase_bills','purchase_bill'),('purchase_orders','purchase_order'),('purchase_credit_notes','purchase_credit_note'),('supplier_payments','supplier_remittance'))t(tbl,kind) LOOP
  EXECUTE format('CREATE TRIGGER capture_issued_appearance AFTER INSERT OR UPDATE OF status ON public.%I FOR EACH ROW EXECUTE FUNCTION private.capture_issued_appearance(%L)',tbl,kind);
  -- Old historical branding cannot be reconstructed; preserve an explicitly identified rollout baseline.
  FOR r IN EXECUTE format('SELECT id,company_id,contact_id FROM public.%I WHERE status::text<>''draft''',tbl) LOOP
   a:=private.resolve_document_appearance(r.company_id,kind,r.contact_id);
   INSERT INTO public.issued_document_appearances(company_id,kind,document_id,appearance,theme_id,theme_revision,provenance) VALUES(r.company_id,kind,r.id,a,NULL,NULL,'legacy_baseline');
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.get_document_appearance(_company_id uuid,_kind text,_document_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tbl text;doc jsonb;a jsonb;
BEGIN
 tbl:=CASE _kind WHEN 'sales_invoice' THEN 'sales_invoices' WHEN 'sales_credit_note' THEN 'sales_credit_notes' WHEN 'sales_quote' THEN 'sales_quotes' WHEN 'sales_receipt' THEN 'sales_receipts' WHEN 'purchase_bill' THEN 'purchase_bills' WHEN 'purchase_order' THEN 'purchase_orders' WHEN 'purchase_credit_note' THEN 'purchase_credit_notes' WHEN 'supplier_remittance' THEN 'supplier_payments' ELSE NULL END;
 IF tbl IS NULL THEN RAISE EXCEPTION 'Unknown document type'; END IF;
 IF auth.uid() IS NULL OR NOT private.mfa_requirement_met() OR NOT public.has_company_permission(_company_id,CASE WHEN _kind LIKE 'purchase_%' OR _kind='supplier_remittance' THEN 'purchases.view' ELSE 'sales.view' END) THEN RAISE EXCEPTION 'Document access required' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE company_id=$1 AND id=$2',tbl) INTO doc USING _company_id,_document_id;
 IF doc IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
 SELECT appearance||jsonb_build_object('provenance',provenance,'captured_at',captured_at) INTO a FROM public.issued_document_appearances WHERE company_id=_company_id AND kind=_kind AND document_id=_document_id;
 IF a IS NOT NULL THEN RETURN a; END IF;
 IF doc->>'status'<>'draft' THEN RAISE EXCEPTION 'Issued document appearance is missing'; END IF;
 RETURN private.resolve_document_appearance(_company_id,_kind,(doc->>'contact_id')::uuid)||jsonb_build_object('provenance','draft');
END $$;
REVOKE ALL ON FUNCTION public.get_document_appearance(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_document_appearance(uuid,text,uuid) TO authenticated;

-- Never permit replacement/deletion of a logo retained by an issued document.
CREATE FUNCTION private.logo_is_retained(path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.issued_document_appearances WHERE appearance#>>'{branding,logo_path}'=path);
$$;
REVOKE ALL ON FUNCTION private.logo_is_retained(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.logo_is_retained(text) TO authenticated;
CREATE POLICY preserve_issued_logo_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'org-logos' OR NOT private.logo_is_retained(name));
CREATE POLICY preserve_issued_logo_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'org-logos' OR NOT private.logo_is_retained(name)) WITH CHECK(bucket_id<>'org-logos' OR NOT private.logo_is_retained(name));
CREATE INDEX issued_appearance_logo ON public.issued_document_appearances((appearance#>>'{branding,logo_path}')) WHERE appearance#>>'{branding,logo_path}' IS NOT NULL;

CREATE FUNCTION public.save_document_branding(_company_id uuid,_values jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 ON CONFLICT(company_id) DO UPDATE SET trading_name=EXCLUDED.trading_name,letterhead_line=EXCLUDED.letterhead_line,invoice_email=EXCLUDED.invoice_email,invoice_phone=EXCLUDED.invoice_phone,address_text=EXCLUDED.address_text,tax_number=EXCLUDED.tax_number,bank_details=EXCLUDED.bank_details,payment_instructions=EXCLUDED.payment_instructions,default_notes=EXCLUDED.default_notes,logo_path=EXCLUDED.logo_path,updated_at=now();
 UPDATE public.companies SET document_theme_color=coalesce(_values->>'accent_color','#0F766E'),invoice_footer=coalesce(_values->>'footer_text','') WHERE id=_company_id;
 PERFORM public.record_audit_event(_company_id,'settings.branding','company',_company_id,'{}');
END $$;
REVOKE ALL ON FUNCTION public.save_document_branding(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_document_branding(uuid,jsonb) TO authenticated;

-- Public token view retains the same issued appearance and existing customer privacy boundary.
CREATE OR REPLACE FUNCTION public.get_shared_invoice(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _link public.document_share_links%ROWTYPE;
  _inv public.sales_invoices%ROWTYPE;
  _co RECORD;
  _br RECORD;
  _ct RECORD;
  _lines JSONB;
  _appearance jsonb;
  _result jsonb;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;

  SELECT * INTO _link FROM public.document_share_links
  WHERE token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
    AND entity_type = 'sales_invoice'
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO _inv FROM public.sales_invoices
  WHERE id = _link.entity_id AND company_id = _link.company_id AND status::TEXT <> 'draft';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT name, legal_name, document_theme_color, invoice_footer, locale, date_format, base_currency
    INTO _co FROM public.companies WHERE id = _inv.company_id;
  SELECT trading_name, letterhead_line, invoice_email, invoice_phone, logo_url, logo_path,
         address_text, tax_number, bank_details, payment_instructions
    INTO _br FROM public.company_branding WHERE company_id = _inv.company_id;
  SELECT name, billing_address_line1, billing_address_line2, billing_city, billing_region,
         billing_postal, billing_country, tax_number
    INTO _ct FROM public.contacts WHERE id = _inv.contact_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', l.description,
    'quantity', l.quantity,
    'unit_price_minor', l.unit_price_minor,
    'discount_minor', l.discount_minor,
    'tax_rate_bps', l.tax_rate_bps,
    'net_minor', l.net_minor,
    'tax_minor', l.tax_minor,
    'gross_minor', l.gross_minor
  ) ORDER BY l.line_order), '[]'::JSONB)
  INTO _lines
  FROM public.sales_invoice_lines l WHERE l.invoice_id = _inv.id;

  UPDATE public.document_share_links
  SET last_viewed_at = now(), view_count = view_count + 1
  WHERE id = _link.id;

  _result := jsonb_build_object(
    'invoice', jsonb_build_object(
      'invoice_number', _inv.invoice_number,
      'invoice_date', _inv.invoice_date,
      'due_date', _inv.due_date,
      'currency_code', _inv.currency_code,
      'status', _inv.status::TEXT,
      'subtotal_minor', _inv.subtotal_minor,
      'tax_minor', _inv.tax_minor,
      'total_minor', _inv.total_minor,
      'amount_paid_minor', _inv.amount_paid_minor,
      'amount_credited_minor', _inv.amount_credited_minor,
      'memo', _inv.memo
    ),
    'lines', _lines,
    'customer', jsonb_build_object(
      'name', _ct.name,
      'billing_address_line1', _ct.billing_address_line1,
      'billing_address_line2', _ct.billing_address_line2,
      'billing_city', _ct.billing_city,
      'billing_region', _ct.billing_region,
      'billing_postal', _ct.billing_postal,
      'billing_country', _ct.billing_country,
      'tax_number', _ct.tax_number
    ),
    'company', jsonb_build_object(
      'name', _co.name,
      'legal_name', _co.legal_name,
      'document_theme_color', _co.document_theme_color,
      'invoice_footer', _co.invoice_footer,
      'locale', _co.locale,
      'date_format', _co.date_format,
      'base_currency', _co.base_currency
    ),
    'branding', jsonb_build_object(
      'trading_name', _br.trading_name,
      'letterhead_line', _br.letterhead_line,
      'invoice_email', _br.invoice_email,
      'invoice_phone', _br.invoice_phone,
      'logo_url', _br.logo_url,
      'logo_path', _br.logo_path,
      'address_text', _br.address_text,
      'tax_number', _br.tax_number,
      'bank_details', _br.bank_details,
      'payment_instructions', _br.payment_instructions
    )
  );
  SELECT appearance INTO _appearance FROM public.issued_document_appearances WHERE company_id=_inv.company_id AND kind='sales_invoice' AND document_id=_inv.id;
  IF _appearance IS NULL THEN RAISE EXCEPTION 'Issued document appearance is missing'; END IF;
  RETURN _result || jsonb_build_object('company',_appearance->'company','branding',_appearance->'branding','customer',coalesce(_appearance->'party','{}')-'email'-'phone');
END;
$$;

