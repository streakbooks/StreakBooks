// Isolated real editor/renderer UI. Persistence/upload adapters are fixtures; DB authorization is tested separately.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DocumentThemeEditor } from "../../src/components/documents/DocumentThemeEditor";
import { DocumentSheet } from "../../src/components/documents/DocumentSheet";
import type { DocumentTheme, ThemeKind } from "../../src/lib/documents/themes/contracts";
import type { DocumentBranding } from "../../src/lib/documents/types";
import { previewBranding, themePreview } from "../../src/lib/documents/themes/preview";
import "../../src/styles.css";
const company = "00000000-0000-4000-8000-000000000001";
const base: DocumentBranding = {
  displayName: "Example organisation",
  legalName: null,
  addressLines: ["1 Test Road"],
  taxNumber: "GB123",
  email: null,
  phone: null,
  logoUrl: null,
  accentColor: "#0F766E",
  footerText: "Organisation footer",
  bankDetails: "Example bank details",
  paymentInstructions: "Use invoice reference",
  defaultNotes: null,
  letterheadLine: null,
};
type State = {
  themes: DocumentTheme[];
  defaults: Array<{ kind: ThemeKind; theme_id: string }>;
  logoUrls: Record<string, string>;
};
export function Fixture() {
  const [state, setState] = useState<State>(() =>
    JSON.parse(
      localStorage.getItem("theme-fixture") ?? '{"themes":[],"defaults":[],"logoUrls":{}}',
    ),
  );
  const store = (next: State) => {
    setState(next);
    localStorage.setItem("theme-fixture", JSON.stringify(next));
  };
  const search = new URLSearchParams(location.search);
  if (search.has("print")) {
    const theme =
      state.themes.find(
        (t) => t.id === state.defaults.find((d) => d.kind === "sales_invoice")?.theme_id,
      ) ?? state.themes[0];
    const branding = theme ? previewBranding(base, theme.config, state.logoUrls[theme.id]) : base;
    return (
      <DocumentSheet
        document={themePreview(branding, "sales_invoice", search.has("long"))}
        branding={branding}
        locale="en-GB"
        dateFormat={null}
      />
    );
  }
  return (
    <main className="p-5">
      <DocumentThemeEditor
        themes={state.themes}
        defaults={state.defaults}
        base={base}
        canEdit={!search.has("readonly")}
        busy={false}
        logoUrls={state.logoUrls}
        onSave={async (input) => {
          const previous = state.themes.find((t) => t.id === input.id);
          if (previous && input.revision !== previous.revision) throw new Error("Stale theme");
          const t: DocumentTheme = {
            id: input.id ?? crypto.randomUUID(),
            company_id: company,
            name: input.name,
            config: input.config,
            revision: previous ? previous.revision + 1 : 1,
          };
          const logoUrls = { ...state.logoUrls };
          if (input.config.logo_path)
            logoUrls[t.id] = localStorage.getItem(input.config.logo_path) ?? "";
          store({
            ...state,
            logoUrls,
            themes: [...state.themes.filter((item) => item.id !== t.id), t],
          });
          return t;
        }}
        onDelete={async (t) => {
          if (state.defaults.some((d) => d.theme_id === t.id))
            throw new Error("Used themes cannot be deleted");
          store({ ...state, themes: state.themes.filter((row) => row.id !== t.id) });
        }}
        onDefault={async (kind, themeId) =>
          store({
            ...state,
            defaults: [
              ...state.defaults.filter((d) => d.kind !== kind),
              ...(themeId ? [{ kind, theme_id: themeId }] : []),
            ],
          })
        }
        onUpload={async (file) => {
          const url = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          const path = `${company}/theme-fixture.png`;
          localStorage.setItem(path, url);
          return { path, url };
        }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
