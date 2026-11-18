import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
const file = (name: string) => path.resolve(import.meta.dirname, name);
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: file("../../node_modules/.vite-purchase-orders"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      ...["@/lib/purchases/purchases.functions", "@/lib/purchases/po-controls.functions"].map(
        (find) => ({ find, replacement: file("functions.ts") }),
      ),
      { find: "@/hooks/use-can", replacement: file("context.ts") },
      { find: "@/hooks/use-active-company", replacement: file("context.ts") },
      { find: "@/lib/auth-helpers", replacement: file("context.ts") },
      ...[
        "@/components/documents/DocumentActions",
        "@/components/documents/DocumentRecordPanel",
        "@/components/messaging/RecordDiscussButton",
      ].map((find) => ({ find, replacement: file("external.tsx") })),
      { find: "@tanstack/react-router", replacement: file("router.tsx") },
      { find: "@tanstack/react-start", replacement: file("start.ts") },
      { find: "@", replacement: file("../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 8097, strictPort: true },
});
