import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import ts from "typescript";

// Sum the static JS import graph of the emitted client and router/bootstrap chunks.
// Lazy screens are intentionally outside this graph. This is a build budget, not a page-load benchmark.
const assets = path.resolve(".vercel/output/static/assets");
if (!fs.existsSync(assets)) throw new Error("Run npm run build before checking the client budget.");
const roots = fs.readdirSync(assets).filter((name) => /^(client|index)-[^.]+\.js$/.test(name));
if (
  !roots.some((name) => name.startsWith("client-")) ||
  !roots.some((name) => name.startsWith("index-"))
) {
  throw new Error("Client/bootstrap output names changed. Review the budget entry points.");
}
const visited = new Set();
function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = fs.readFileSync(file, "utf8");
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const node of root.statements) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      const dependency = path.resolve(path.dirname(file), node.moduleSpecifier.text);
      if (/\.m?js$/.test(dependency)) visit(dependency);
    }
  }
}
for (const root of roots) visit(path.join(assets, root));
let bytes = 0;
let gzip = 0;
for (const file of visited) {
  const source = fs.readFileSync(file);
  bytes += source.length;
  gzip += gzipSync(source).length;
}
console.log(`Client bootstrap: ${visited.size} modules, ${bytes} bytes, ${gzip} gzip bytes.`);
if (bytes > 1_050_000 || gzip > 320_000) {
  throw new Error(
    "Client bootstrap exceeds the reviewed JS budget (1,050,000 raw / 320,000 gzip bytes). Review eager imports before changing the budget.",
  );
}
