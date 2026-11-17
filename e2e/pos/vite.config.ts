import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      ...[
        "@tanstack/react-start",
        "@/hooks/use-active-company",
        "@/hooks/use-can",
        "@/lib/pos/catalogue-quote.functions",
      ].map((find) => ({ find, replacement: path.resolve(import.meta.dirname, "fixtures.ts") })),
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 8105, strictPort: true },
});
