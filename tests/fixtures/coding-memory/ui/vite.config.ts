import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../../..");
const stub = path.resolve(import.meta.dirname, "stubs.tsx");
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@tanstack/react-start", replacement: stub },
      { find: "@tanstack/react-router", replacement: stub },
      { find: "@/hooks/use-can", replacement: stub },
      { find: "@/lib/auth-helpers", replacement: stub },
      { find: "@/lib/banking/memory.functions", replacement: stub },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
  server: { fs: { allow: [root] } },
});
