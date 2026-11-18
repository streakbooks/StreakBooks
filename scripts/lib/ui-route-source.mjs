import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

/** Include a route's directly delegated screen in source audits, without loading application code. */
export function readUiSource(file) {
  const source = readFileSync(file, "utf8");
  const screens = [];
  if (file.startsWith("src/routes/")) {
    const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const node of root.statements) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.startsWith("@/screens/")) {
        const base = `src/${node.moduleSpecifier.text.slice(2)}`;
        const screen = [`${base}.tsx`, `${base}/index.tsx`].find((candidate) =>
          existsSync(candidate),
        );
        if (!screen)
          throw new Error(`Cannot resolve screen ${node.moduleSpecifier.text} from ${file}`);
        screens.push(screen);
      }
    }
  }
  return {
    source: [source, ...screens.map((screen) => readFileSync(screen, "utf8"))].join("\n"),
    screens,
  };
}
