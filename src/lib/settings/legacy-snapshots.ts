/** Keep CAS snapshots limited to fields owned by each legacy settings editor. */
export type LocalisationSnapshot = {
  locale: string;
  date_format: string;
  invoice_footer: string;
  document_theme_color: string;
};

export type BrandingSnapshot = {
  trading_name: string | null;
  letterhead_line: string | null;
  invoice_email: string | null;
  invoice_phone: string | null;
  logo_url: string | null;
};

export type SequenceSnapshot = {
  prefix: string;
  next_number: number;
  padding: number;
};

export function localisationSnapshot(value: LocalisationSnapshot): LocalisationSnapshot {
  return {
    locale: value.locale,
    date_format: value.date_format,
    invoice_footer: value.invoice_footer,
    document_theme_color: value.document_theme_color,
  };
}

export function brandingSnapshot(value: BrandingSnapshot): BrandingSnapshot {
  return {
    trading_name: value.trading_name,
    letterhead_line: value.letterhead_line,
    invoice_email: value.invoice_email,
    invoice_phone: value.invoice_phone,
    logo_url: value.logo_url,
  };
}

export function sequenceSnapshot(value: SequenceSnapshot): SequenceSnapshot {
  return {
    prefix: value.prefix,
    next_number: value.next_number,
    padding: value.padding,
  };
}
