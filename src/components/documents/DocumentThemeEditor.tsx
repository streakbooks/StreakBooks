import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useRef, useState } from "react";
import { CustomerStatementSheet } from "./CustomerStatementSheet";
import { statementPreview } from "@/lib/documents/themes/statement-preview";
import { DocumentSheet } from "./DocumentSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  themeConfig,
  normalizeTheme,
  THEME_KINDS,
  type ThemeConfig,
  type DocumentTheme,
  type ThemeKind,
} from "@/lib/documents/themes/contracts";
import { DOCUMENT_KIND_LABEL, type DocumentBranding } from "@/lib/documents/types";
import { previewBranding, themePreview } from "@/lib/documents/themes/preview";
import { printThemePreview } from "@/lib/documents/themes/print-preview";
import { friendlyAuthError } from "@/lib/auth-helpers";
export type ThemeEditorProps = {
  themes: DocumentTheme[];
  defaults: Array<{ kind: ThemeKind; theme_id: string }>;
  base: DocumentBranding;
  canEdit: boolean;
  busy: boolean;
  onSave: (input: {
    id: string | null;
    revision: number | null;
    name: string;
    config: ThemeConfig;
  }) => Promise<DocumentTheme>;
  onDelete: (theme: DocumentTheme) => Promise<unknown>;
  onDefault: (kind: ThemeKind, themeId: string | null) => Promise<unknown>;
  onUpload: (file: File) => Promise<{ path: string; url: string }>;
  logoUrls: Record<string, string>;
};
const textFields: Partial<Record<keyof ThemeConfig, string>> = {
  trading_name: "Company display name",
  letterhead_line: "Registration / letterhead line",
  address_text: "Registered address",
  tax_number: "Tax registration number",
  invoice_email: "Contact email",
  invoice_phone: "Contact phone",
  bank_details: "Bank details",
  payment_instructions: "Payment instructions",
  default_notes: "Notes and terms",
  footer_text: "Footer text",
};
const colours: Partial<Record<keyof ThemeConfig, string>> = {
  accent_color: "Primary / accent colour",
  secondary_color: "Secondary colour",
  heading_color: "Heading colour",
  table_header_color: "Table header colour",
  text_color: "Body text colour",
  background_color: "Page background colour",
};
const toggles: Partial<Record<keyof ThemeConfig, string>> = {
  show_number: "Document number",
  show_date: "Issue date",
  show_due_date: "Due date",
  show_customer: "Customer / supplier information",
  show_billing_address: "Billing address",
  show_contact_details: "Contact details",
  show_description: "Item descriptions",
  show_quantity: "Quantity",
  show_unit_price: "Unit price",
  show_discount: "Discounts",
  show_tax_rates: "Tax column",
  show_tax_summary: "Tax summary",
  show_subtotal: "Subtotal",
  show_total: "Grand total",
  show_payment_details: "Payment instructions",
  show_bank_details: "Bank details",
  show_notes: "Notes and terms",
};
const selects: Partial<Record<keyof ThemeConfig, { label: string; options: string[] }>> = {
  font_family: { label: "Font family", options: ["sans", "serif", "mono"] },
  heading_weight: { label: "Heading weight", options: ["400", "600", "700"] },
  body_weight: { label: "Body weight", options: ["400", "500", "600"] },
  page_size: { label: "Paper size", options: ["A4", "Letter"] },
  orientation: { label: "Orientation", options: ["portrait", "landscape"] },
  logo_position: { label: "Logo position", options: ["left", "center", "right"] },
  header_layout: { label: "Header layout", options: ["split", "stacked"] },
  title_position: { label: "Title alignment", options: ["left", "center", "right"] },
  footer_alignment: { label: "Footer alignment", options: ["left", "center", "right"] },
  table_style: { label: "Table appearance", options: ["lined", "striped", "minimal"] },
};
const numbers: Partial<
  Record<keyof ThemeConfig, { label: string; min: number; max: number; step?: number }>
> = {
  font_size: { label: "Body font size (px)", min: 11, max: 18 },
  heading_size: { label: "Heading size (px)", min: 16, max: 36 },
  margin_mm: { label: "Page margins (mm)", min: 8, max: 25 },
  logo_width: { label: "Logo width (px)", min: 40, max: 260 },
  logo_height: { label: "Logo height (px)", min: 24, max: 120 },
  description_width: { label: "Description column weight", min: 25, max: 70 },
  quantity_width: { label: "Quantity column weight", min: 5, max: 35 },
  unit_price_width: { label: "Unit price column weight", min: 5, max: 35 },
  discount_width: { label: "Discount column weight", min: 5, max: 35 },
  tax_width: { label: "Tax column weight", min: 5, max: 35 },
  amount_width: { label: "Amount column weight", min: 10, max: 40 },
  cell_padding: { label: "Table cell spacing (px)", min: 3, max: 12 },
  line_height: { label: "Line spacing", min: 1.2, max: 2, step: 0.05 },
};
export function DocumentThemeEditor({
  themes,
  defaults,
  base,
  canEdit,
  busy,
  onSave,
  onDelete,
  onDefault,
  onUpload,
  logoUrls,
}: ThemeEditorProps) {
  const [selected, setSelected] = useState<DocumentTheme | null>(null),
    [name, setName] = useState(""),
    [config, setConfig] = useState<ThemeConfig>(normalizeTheme({}));
  const [logo, setLogo] = useState<string | null | undefined>(undefined),
    [kind, setKind] = useState<ThemeKind>("sales_invoice"),
    [long, setLong] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [working, setWorking] = useState(false),
    [dirty, setDirty] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const disabled = busy || working;
  const update = (key: keyof ThemeConfig, value: unknown) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setMessage("");
  };
  const start = (t: DocumentTheme | null, duplicate = false) => {
    if (dirty && !window.confirm("Discard unsaved theme changes?")) return;
    setSelected(duplicate ? null : t);
    setName(t ? (duplicate ? `${t.name} copy` : t.name) : "");
    setConfig(normalizeTheme(t?.config ?? {}));
    setLogo(t?.config.logo_path ? logoUrls[t.id] : undefined);
    setDirty(duplicate);
    setError("");
    setMessage("");
  };
  async function run(action: () => Promise<unknown>, success: string) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setWorking(false);
    }
  }
  const parsed = themeConfig.safeParse(config);
  const branding = previewBranding(base, parsed.success ? parsed.data : normalizeTheme({}), logo);
  const document = themePreview(branding, kind, long);
  const labelFor = (k: ThemeKind) =>
    k === "customer_statement" ? "Customer statement" : DOCUMENT_KIND_LABEL[k];
  return (
    <section aria-label="Document theme studio" className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Theme studio</h2>
        <p className="text-sm text-muted-foreground">
          Create reusable designs. Defaults apply to drafts and future documents; issued copies
          retain their saved appearance.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded border p-3 text-sm">
          {message}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[210px_350px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Branding themes</h3>
          <Button variant="outline" disabled={disabled || !canEdit} onClick={() => start(null)}>
            New theme
          </Button>
          {themes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No saved themes. Organisation branding remains the default.
            </p>
          )}
          {themes.map((t) => (
            <button
              key={t.id}
              disabled={disabled}
              className={`block w-full rounded border p-3 text-left text-sm ${selected?.id === t.id ? "border-primary bg-accent" : ""}`}
              onClick={() => start(t)}
            >
              <strong>{t.name}</strong>
              <span className="block text-xs text-muted-foreground">Revision {t.revision}</span>
            </button>
          ))}
        </aside>
        <form
          className="space-y-4 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const saved = await onSave({
                id: selected?.id ?? null,
                revision: selected?.revision ?? null,
                name,
                config: themeConfig.parse(config),
              });
              setSelected(saved);
              setConfig(normalizeTheme(saved.config));
              setDirty(false);
            }, "Theme saved");
          }}
        >
          <fieldset disabled={disabled || !canEdit} className="space-y-4">
            <label className="block text-sm">
              Theme name
              <Input
                aria-label="Theme name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <details open>
              <summary className="cursor-pointer font-medium">Company branding</summary>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  Theme logo
                  <input
                    aria-label="Theme logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file)
                        void run(async () => {
                          const uploaded = await onUpload(file);
                          update("logo_path", uploaded.path);
                          setLogo(uploaded.url);
                        }, "Logo uploaded; save the theme to apply it");
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      update("logo_path", null);
                      setLogo(null);
                    }}
                  >
                    Remove logo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const next = { ...config };
                      delete next.logo_path;
                      setConfig(next);
                      setLogo(undefined);
                      setDirty(true);
                    }}
                  >
                    Use organisation logo
                  </Button>
                </div>
                {Object.entries(textFields).map(([key, label]) => (
                  <label className="block text-sm" key={key}>
                    {label}
                    <Textarea
                      aria-label={`Theme ${label}`}
                      rows={key === "address_text" ? 3 : 2}
                      value={String(config[key as keyof ThemeConfig] ?? "")}
                      maxLength={
                        key === "footer_text"
                          ? 2000
                          : key === "address_text"
                            ? 500
                            : key === "invoice_email"
                              ? 160
                              : 1000
                      }
                      onChange={(e) => update(key as keyof ThemeConfig, e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">
                      Unchanged fields inherit organisation branding.
                    </span>
                  </label>
                ))}
              </div>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Colours and typography</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(colours).map(([key, label]) => (
                  <label className="text-sm" key={key}>
                    {label}
                    <input
                      className="block h-9 w-full"
                      aria-label={`Theme ${label}`}
                      type="color"
                      value={String(
                        config[key as keyof ThemeConfig] ??
                          (key === "accent_color" || key === "table_header_color"
                            ? base.accentColor
                            : key === "background_color"
                              ? "#ffffff"
                              : key === "secondary_color"
                                ? "#f3f4f6"
                                : "#111827"),
                      )}
                      onChange={(e) => update(key as keyof ThemeConfig, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </details>
            <details open>
              <summary className="cursor-pointer font-medium">Typography and page layout</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(selects).map(([key, f]) => (
                  <label className="text-sm" key={key}>
                    {f.label}
                    <select
                      aria-label={`Theme ${f.label}`}
                      className="block w-full rounded border bg-background p-2"
                      value={String(config[key as keyof ThemeConfig])}
                      onChange={(e) => update(key as keyof ThemeConfig, e.target.value)}
                    >
                      {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {Object.entries(numbers).map(([key, f]) => (
                  <label className="text-sm" key={key}>
                    {f.label}
                    <Input
                      aria-label={`Theme ${f.label}`}
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={f.step ?? 1}
                      value={Number(config[key as keyof ThemeConfig])}
                      onChange={(e) => update(key as keyof ThemeConfig, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
            </details>
            <details>
              <summary className="cursor-pointer font-medium">Document fields</summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Visibility changes only the printed copy. Financial records and calculations remain
                unchanged. Shipping-address fields are not available in current source documents.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(toggles).map(([key, label]) => (
                  <label className="flex gap-2 text-sm" key={key}>
                    <input
                      aria-label={`Show ${label}`}
                      type="checkbox"
                      checked={Boolean(config[key as keyof ThemeConfig])}
                      onChange={(e) => update(key as keyof ThemeConfig, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save theme</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfig(normalizeTheme(selected?.config ?? {}));
                  setName(selected?.name ?? "");
                  setLogo(selected?.config.logo_path ? logoUrls[selected.id] : undefined);
                  setDirty(false);
                  setError("");
                }}
              >
                Cancel changes
              </Button>
              {selected && (
                <>
                  <Button type="button" variant="outline" onClick={() => start(selected, true)}>
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete theme “${selected.name}”? Used themes are preserved.`,
                        )
                      )
                        void run(async () => {
                          await onDelete(selected);
                          setSelected(null);
                          setName("");
                          setConfig(normalizeTheme({}));
                          setDirty(false);
                        }, "Unused theme deleted");
                    }}
                  >
                    Delete theme
                  </Button>
                </>
              )}
            </div>
          </fieldset>
        </form>
        <div className="min-w-0 space-y-3 xl:sticky xl:top-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Preview document
              <select
                aria-label="Theme preview document"
                className="ml-2 rounded border bg-background p-2"
                value={kind}
                onChange={(e) => setKind(e.target.value as ThemeKind)}
              >
                {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                {THEME_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {labelFor(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex gap-2 text-sm">
              <input
                aria-label="Multi-page preview"
                type="checkbox"
                checked={long}
                onChange={(e) => setLong(e.target.checked)}
              />
              Multi-page sample
            </label>
            <Button
              variant="outline"
              disabled={disabled || !parsed.success}
              onClick={() =>
                void run(async () => {
                  const el = previewRef.current?.querySelector<HTMLElement>(".doc-sheet");
                  if (el) await printThemePreview(el);
                  else throw new Error("Preview is unavailable");
                }, "Print preview opened; choose Save as PDF to download")
              }
            >
              Print / Save as PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Illustrative data only. The preview and printed PDF use the same renderer. Save before
            applying a theme.
          </p>
          <div className="max-h-[80vh] overflow-auto rounded-xl bg-muted p-3" ref={previewRef}>
            {kind === "customer_statement" ? (
              <CustomerStatementSheet
                interactive={false}
                statement={statementPreview(long)}
                customerName="Example customer"
                branding={branding}
              />
            ) : (
              <DocumentSheet
                document={document}
                branding={branding}
                locale="en-GB"
                dateFormat={null}
              />
            )}
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Defaults by document type</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Invoices also use this default while in draft. Statements are regenerated reports and use
          the current statement design.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {THEME_KINDS.map((k) => (
            <label key={k} className="text-sm">
              {labelFor(k)}
              <RecordLookupSelect
                aria-label={`Default theme for ${labelFor(k)}`}
                className="block w-full rounded border bg-background p-2"
                disabled={disabled || !canEdit}
                value={defaults.find((d) => d.kind === k)?.theme_id ?? ""}
                onValueChange={(e) =>
                  void run(() => onDefault(k, e || null), "Document default saved")
                }
              >
                <option value="">Organisation branding</option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </RecordLookupSelect>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
