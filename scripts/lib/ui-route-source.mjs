import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Resolve delegated screens like TypeScript: file first, then directory index. */
export function resolveScreenSource(specifier, rootDir = process.cwd()) {
  const base = `src/${specifier.slice(2)}`;
  const candidates = /\.[cm]?[jt]sx?$/.test(base)
    ? [base]
    : [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
  const resolved = candidates.find((candidate) => existsSync(path.resolve(rootDir, candidate)));
  if (!resolved) throw new Error(`Delegated screen does not exist: ${specifier}`);
  return resolved;
}

/** Include runtime-delegated screens in source audits without loading application code. */
export function readUiSource(file, { rootDir = process.cwd() } = {}) {
  const source = readFileSync(path.resolve(rootDir, file), "utf8");
  const screens = new Set();
  if (file.startsWith("src/routes/")) {
    const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const node of root.statements) {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.startsWith("@/screens/") &&
        !node.importClause?.isTypeOnly
      ) {
        screens.add(resolveScreenSource(node.moduleSpecifier.text, rootDir));
      }
    }
  }
  return {
    source: [source, ...[...screens].map((screen) => readFileSync(path.resolve(rootDir, screen), "utf8"))].join("\n"),
    screens: [...screens],
  };
}
