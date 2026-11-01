import { z } from "zod";
export const THEME_KINDS = [
  "sales_invoice",
  "sales_quote",
  "sales_credit_note",
  "customer_statement",
  "purchase_order",
  "sales_receipt",
  "supplier_remittance",
  "purchase_bill",
  "purchase_credit_note",
] as const;
export type ThemeKind = (typeof THEME_KINDS)[number];
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeConfig = z
  .object({
    trading_name: z.string().max(160).optional(),
    letterhead_line: z.string().max(200).optional(),
    invoice_email: z.union([z.literal(""), z.string().email().max(160)]).optional(),
    invoice_phone: z.string().max(40).optional(),
    address_text: z.string().max(500).optional(),
    tax_number: z.string().max(60).optional(),
    bank_details: z.string().max(800).optional(),
    payment_instructions: z.string().max(800).optional(),
    default_notes: z.string().max(1000).optional(),
    footer_text: z.string().max(2000).optional(),
    logo_path: z.string().max(300).nullable().optional(),
    accent_color: colour.optional(),
    secondary_color: colour.optional(),
    heading_color: colour.optional(),
    table_header_color: colour.optional(),
    text_color: colour.optional(),
    background_color: colour.optional(),
    font_family: z.enum(["sans", "serif", "mono"]).default("sans"),
    font_size: z.number().min(11).max(18).default(13),
    heading_size: z.number().min(16).max(36).default(20),
    heading_weight: z.enum(["400", "600", "700"]).default("600"),
    body_weight: z.enum(["400", "500", "600"]).default("400"),
    line_height: z.number().min(1.2).max(2).default(1.45),
    page_size: z.enum(["A4", "Letter"]).default("A4"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    margin_mm: z.number().min(8).max(25).default(14),
    logo_position: z.enum(["left", "center", "right"]).default("left"),
    logo_width: z.number().min(40).max(260).default(180),
    logo_height: z.number().min(24).max(120).default(64),
    header_layout: z.enum(["split", "stacked"]).default("split"),
    title_position: z.enum(["left", "center", "right"]).default("right"),
    footer_alignment: z.enum(["left", "center", "right"]).default("left"),
    table_style: z.enum(["lined", "striped", "minimal"]).default("lined"),
    description_width: z.number().min(25).max(70).default(40),
    quantity_width: z.number().min(5).max(35).default(8),
    unit_price_width: z.number().min(5).max(35).default(14),
    discount_width: z.number().min(5).max(35).default(12),
    tax_width: z.number().min(5).max(35).default(10),
    amount_width: z.number().min(10).max(40).default(16),
    cell_padding: z.number().min(3).max(12).default(6),
    show_contact_details: z.boolean().default(true),
    show_quantity: z.boolean().default(true),
    show_unit_price: z.boolean().default(true),
    show_discount: z.boolean().default(true),
    show_tax_rates: z.boolean().default(true),
    show_tax_summary: z.boolean().default(true),
    show_payment_details: z.boolean().default(true),
    show_bank_details: z.boolean().default(true),
    show_notes: z.boolean().default(true),
    show_number: z.boolean().default(true),
    show_date: z.boolean().default(true),
    show_due_date: z.boolean().default(true),
    show_customer: z.boolean().default(true),
    show_billing_address: z.boolean().default(true),
    show_shipping_address: z.boolean().default(false),
    show_description: z.boolean().default(true),
    show_subtotal: z.boolean().default(true),
    show_total: z.boolean().default(true),
  })
  .strict();
export type ThemeConfig = z.infer<typeof themeConfig>;
export type DocumentTheme = {
  id: string;
  company_id: string;
  name: string;
  config: ThemeConfig;
  revision: number;
};
export const themeInput = z
  .object({
    companyId: z.string().uuid(),
    id: z.string().uuid().nullable(),
    revision: z.number().int().positive().nullable(),
    name: z.string().trim().min(1).max(100),
    config: themeConfig,
  })
  .strict();
export function normalizeTheme(input: unknown): ThemeConfig {
  return themeConfig.parse(input ?? {});
}

export const layoutConfig = themeConfig.omit({
  trading_name: true,
  letterhead_line: true,
  invoice_email: true,
  invoice_phone: true,
  address_text: true,
  tax_number: true,
  bank_details: true,
  payment_instructions: true,
  default_notes: true,
  footer_text: true,
  logo_path: true,
  accent_color: true,
});
export function layoutFromBranding(row: Record<string, unknown> | null | undefined): ThemeConfig {
  const allowed = Object.keys(layoutConfig.shape);
  return normalizeTheme(
    Object.fromEntries(Object.entries(row ?? {}).filter(([key]) => allowed.includes(key))),
  );
}
