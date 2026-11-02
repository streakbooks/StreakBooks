import { build } from "esbuild";
import path from "node:path";
const outfile = process.argv[2] ?? "work/reporting-worker/index.js";
await build({
  entryPoints: ["supabase/functions/reporting-worker/index.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["module", "main"],
  external: ["npm:*"],
  tsconfig: path.resolve("tsconfig.json"),
  minify: true,
});
console.log(`Reporting worker bundle: ${outfile}`);
