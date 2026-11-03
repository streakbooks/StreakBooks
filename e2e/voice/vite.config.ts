import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Isolated browser fixture: no app authentication, credentials, or financial APIs.
export default defineConfig({
  root: import.meta.dirname,
  server: { hmr: false, watch: null },
  plugins: [
    {
      name: "voice-fixture-domain-apis",
      enforce: "pre",
      resolveId(source, importer) {
        if (!/\.functions(?:\.ts)?$/.test(source)) return;
        if (source.includes("settings-centre.functions")) return;
        const file = source.startsWith("@/")
          ? path.resolve(import.meta.dirname, "../../src", source.slice(2))
          : path.resolve(path.dirname(importer ?? ""), source);
        return `\0voice-api:${file.endsWith(".ts") ? file : `${file}.ts`}`;
      },
      load(id) {
        if (!id.startsWith("\0voice-api:")) return;
        const source = readFileSync(id.slice("\0voice-api:".length), "utf8");
        const names = [...source.matchAll(/export\s+(?:const|(?:async\s+)?function)\s+(\w+)/g)].map(
          (match) => match[1]!,
        );
        return (
          `import { call, defaults } from ${JSON.stringify(path.resolve(import.meta.dirname, "server-fixture.ts"))};\n` +
          names
            .map((name) =>
              name === "DEFAULT_BILL_WORKSPACE_PREFS"
                ? `export const ${name} = defaults;`
                : `export const ${name} = (...args) => call(${JSON.stringify(name)}, args);`,
            )
            .join("\n")
        );
      },
    },
    react(),
    tailwindcss(),
  ],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://voice-fixture.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sb_publishable_voice_fixture"),
  },
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
