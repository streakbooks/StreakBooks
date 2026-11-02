import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.resolve(import.meta.dirname, "../../node_modules/.vite-navigation"),
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 8099, strictPort: true },
});
