import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.resolve(import.meta.dirname, "../../node_modules/.vite-billing"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      {
        find: "@/lib/billing/partner-program.functions",
        replacement: path.resolve(import.meta.dirname, "partner-functions.ts"),
      },
      {
        find: "@/lib/billing/legal-documents.functions",
        replacement: path.resolve(import.meta.dirname, "legal-functions.ts"),
      },
      {
        find: "@/lib/billing/billing-analytics.functions",
        replacement: path.resolve(import.meta.dirname, "analytics-functions.ts"),
      },
      {
        find: /^@\/components\/lookup$/,
        replacement: path.resolve(import.meta.dirname, "lookup.ts"),
      },
      { find: "@tanstack/react-start", replacement: path.resolve(import.meta.dirname, "start.ts") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 8098, strictPort: true },
});
