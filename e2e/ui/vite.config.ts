import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.resolve(import.meta.dirname, "../../node_modules/.vite-ui"),
  plugins: [react(), tailwind()],
  // Public fixture-only configuration. The browser test supplies an in-memory widget API.
  define: {
    "import.meta.env.VITE_CAPTCHA_PROVIDER": JSON.stringify("turnstile"),
    "import.meta.env.VITE_CAPTCHA_SITE_KEY": JSON.stringify("fixture-public-site-key"),
  },
  resolve: {
    alias: [
      {
        find: /^@tanstack\/react-start\/server$/,
        replacement: path.resolve(import.meta.dirname, "server.ts"),
      },
      ...[
        "@tanstack/react-start",
        "@/hooks/use-active-company",
        "@/hooks/use-can",
        "@/lib/contacts/contacts.functions",
        "@/lib/accounting/chart.functions",
        "@/lib/accounting/accounting.functions",
        "@/lib/tax/tax.functions",
        "@/components/portals/use-portal",
        "@/integrations/supabase/client",
        "@/lib/purchases/purchases.functions",
        "@/lib/portals/portals.functions",
        "@/lib/messaging/messaging.functions",
        "@/lib/firm/firm-assignments.functions",
      ].map((find) => ({ find, replacement: path.resolve(import.meta.dirname, "functions.ts") })),
      ...[
        "@/components/accounting/CashClassificationPanel",
        "@/components/accounting/DeferralsPanel",
        "@/components/accounting/ConversionBalancesPanel",
        "@/components/accounting/FxPanel",
        "@/components/accounting/FinancialYearsPanel",
        "@/components/accounting/IndustryCoaPanel",
        "@/components/accounting/LedgerHealthPanel",
        "@/components/accounting/ReconciliationExceptionCentre",
        "@/components/accounting/JournalsPanel",
        "@/components/accounting/PeriodClosePanel",
        "@/components/accounting/corrections/TransactionCorrections",
      ].map((find) => ({
        find,
        replacement: path.resolve(import.meta.dirname, "accounting-stubs.tsx"),
      })),
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 8100, strictPort: true },
});
