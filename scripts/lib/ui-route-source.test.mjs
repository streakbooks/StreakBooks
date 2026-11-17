import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readUiSource, resolveScreenSource } from "./ui-route-source.mjs";
const rootDir = mkdtempSync(path.join(os.tmpdir(), "linkbooks-ui-source-"));
after(() => rmSync(rootDir, { recursive: true, force: true }));
function write(file, text) {
  mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
  writeFileSync(path.join(rootDir, file), text);
}
write("src/screens/folder/index.tsx", "export const Screen = () => <Button>Save</Button>;");
write("src/screens/plain.tsx", "export const Plain = () => <EmptyState />;");
write("src/screens/helper/index.ts", "export const helper = 1;");
write(
  "src/routes/_authenticated/example.tsx",
  'import { Screen } from "@/screens/folder";\nimport { Screen as Again } from "@/screens/folder";\nexport const Route = Screen;',
);
test("directory index screens participate in UI audits once", () => {
  const result = readUiSource("src/routes/_authenticated/example.tsx", { rootDir });
  assert.deepEqual(result.screens, ["src/screens/folder/index.tsx"]);
  assert.match(result.source, /<Button>Save/);
});
test("plain screens retain resolution and file wins over index", () => {
  write("src/screens/plain/index.tsx", "incorrect");
  assert.equal(resolveScreenSource("@/screens/plain", rootDir), "src/screens/plain.tsx");
});
test("explicit extension and TypeScript index resolve", () => {
  assert.equal(resolveScreenSource("@/screens/plain.tsx", rootDir), "src/screens/plain.tsx");
  assert.equal(resolveScreenSource("@/screens/helper", rootDir), "src/screens/helper/index.ts");
});
test("unresolved runtime screen fails closed", () => {
  assert.throws(() => resolveScreenSource("@/screens/missing", rootDir), /does not exist/);
});
test("type-only screen imports do not load runtime source", () => {
  write("src/routes/_authenticated/types.tsx", 'import type { Props } from "@/screens/missing";');
  assert.deepEqual(readUiSource("src/routes/_authenticated/types.tsx", { rootDir }).screens, []);
});
test("non-route files are not followed", () => {
  write("src/screens/nested.tsx", 'import { Missing } from "@/screens/missing";');
  assert.deepEqual(readUiSource("src/screens/nested.tsx", { rootDir }).screens, []);
});
