import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Isolated browser fixture: no app authentication, credentials, or financial APIs.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Use the real client hook without the Start server entrypoints. The fixture
      // supplies a plain async feature lookup instead of a server-function RPC.
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(
          new URL("./useServerFn.js", import.meta.resolve("@tanstack/react-start")),
        ),
      },
      {
        find: "@/hooks/use-active-company",
        replacement: path.resolve(import.meta.dirname, "fixture-state.ts"),
      },
      {
        find: "@/lib/settings/settings-centre.functions",
        replacement: path.resolve(import.meta.dirname, "fixture-state.ts"),
      },
      { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
    ],
  },
});
