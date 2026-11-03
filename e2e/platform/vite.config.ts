import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.resolve(import.meta.dirname, "../../node_modules/.vite-platform"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      {
        find: "@/lib/platform/automation.functions",
        replacement: path.resolve(import.meta.dirname, "automation-functions.ts"),
      },
      {
        find: "@/lib/platform/operations.functions",
        replacement: path.resolve(import.meta.dirname, "operations-functions.ts"),
      },
      {
        find: "@/lib/platform/platform.functions",
        replacement: path.resolve(import.meta.dirname, "functions.ts"),
      },
      { find: "@tanstack/react-start", replacement: path.resolve(import.meta.dirname, "start.ts") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 8097, strictPort: true },
});
