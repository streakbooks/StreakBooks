import { readUiSource } from "./lib/ui-route-source.mjs";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const files = [];
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) scan(file);
    else if (file.endsWith(".tsx")) files.push(file);
  }
}
scan("src");
const violations = [];
const inventory = [];
for (const file of files.sort()) {
  const source = fs.readFileSync(file, "utf8");
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const icons = new Set();
  let actions = 0;
  for (const item of root.statements) {
    if (ts.isImportDeclaration(item) && item.moduleSpecifier.text === "lucide-react")
      item.importClause?.namedBindings?.elements?.forEach((entry) => icons.add(entry.name.text));
  }
  function fail(node, reason) {
    violations.push(
      `${file}:${root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1} ${reason}`,
    );
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText(root);
      if (["Button", "button", "a", "Link"].includes(name)) {
        actions++;
        for (const attribute of opening.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          const key = attribute.name.getText(root);
          const value = attribute.initializer;
          if (
            ["href", "to"].includes(key) &&
            value &&
            ts.isStringLiteral(value) &&
            ["#", "", "javascript:void(0)"].includes(value.text)
          )
            fail(node, "Navigation must have a real destination.");
          if (
            key === "onClick" &&
            value &&
            ts.isJsxExpression(value) &&
            value.expression &&
            ts.isArrowFunction(value.expression) &&
            ts.isBlock(value.expression.body) &&
            value.expression.body.statements.length === 0
          )
            fail(node, "Empty click handler advertises a nonfunctional action.");
        }
        if (ts.isJsxElement(node) && ["Button", "button"].includes(name)) {
          const children = node.children.filter(
            (child) => !ts.isJsxText(child) || child.text.trim(),
          );
          const iconOnly =
            children.length > 0 &&
            children.every(
              (child) =>
                (ts.isJsxSelfClosingElement(child) && icons.has(child.tagName.getText(root))) ||
                (ts.isJsxElement(child) && icons.has(child.openingElement.tagName.getText(root))),
            );
          if (
            iconOnly &&
            !/aria-label|aria-labelledby|title=/.test(opening.attributes.getText(root))
          )
            fail(node, "Icon-only action needs an accessible name.");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  if (file.startsWith("src/routes/")) {
    if (source.includes("createFileRoute(")) {
      for (const node of root.statements) {
        const exported = node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        );
        if (exported && !ts.isTypeAliasDeclaration(node) && !ts.isInterfaceDeclaration(node)) {
          const valid =
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.every(
              (declaration) => declaration.name.getText(root) === "Route",
            );
          if (!valid)
            fail(
              node,
              "Export reusable screens from src/screens so route components can be code-split.",
            );
        }
        if (
          ts.isExportDeclaration(node) &&
          !node.isTypeOnly &&
          (!node.exportClause || !ts.isNamedExports(node.exportClause))
        )
          fail(node, "Route modules may not re-export runtime screen modules.");
        if (
          ts.isExportDeclaration(node) &&
          !node.isTypeOnly &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        ) {
          if (
            node.exportClause.elements.some(
              (entry) => !entry.isTypeOnly && entry.name.text !== "Route",
            )
          )
            fail(node, "Route modules may only re-export the Route value.");
        }
      }
    }
    const delegated = readUiSource(file);
    const delegatedRoot = ts.createSourceFile(
      file,
      delegated.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let delegatedActions = 0;
    function countActions(node) {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        if (["Button", "button", "a", "Link"].includes(opening.tagName.getText(delegatedRoot)))
          delegatedActions++;
      }
      ts.forEachChild(node, countActions);
    }
    countActions(delegatedRoot);
    const route = source.match(/createFileRoute\("([^"]+)"\)/)?.[1] ?? "__root";
    inventory.push({
      file,
      route,
      actions: delegatedActions,
      screens: delegated.screens,
      queries: (delegated.source.match(/\buseQuery\s*\(/g) ?? []).length,
      state: /ErrorState|QueryErrorState/.test(delegated.source)
        ? "Explicit error UI"
        : "Shared/delegated state handling",
      theme: "Shared semantic tokens and responsive primitives",
    });
  }
}
if (process.argv.includes("--write-audit")) {
  const lines = [
    "# StreakBooks page coverage inventory",
    "",
    "Generated by `npm run audit:ui` from production routes and their directly imported screens. This is source coverage, not a claim that every route has been verified against live Supabase or by a screen reader.",
    "",
    "All route families receive the shared typography, palette, focus, table, dialog, lookup and navigation refinements. Required-query failures are handled explicitly on financial entry screens. Fixture and local SQL evidence is recorded separately in PREMIUM-INTERFACE.md. Live authenticated staging remains a separate gate.",
    "",
    "| Route definition | Source | Action declarations | Queries | State evidence |",
    "| --- | --- | ---: | ---: | --- |",
    ...inventory.map(
      (item) =>
        `| \`${item.route}\` | [${path.basename(item.file)}](../../${item.file})${item.screens.map((screen) => ` / [screen](../../${screen})`).join("")} | ${item.actions} | ${item.queries} | ${item.state} |`,
    ),
    "",
    `Route files: ${inventory.length}. Component/route files scanned: ${files.length}.`,
    "",
    "The checks reject literal placeholder destinations, empty click handlers, unnamed direct icon-only actions and runtime screen exports that prevent route splitting. They cannot establish that arbitrary dynamic callbacks, integrations, permissions or remote services work. Browser fixtures and authorized staging journeys must test those boundaries.",
    "",
  ];
  fs.writeFileSync("docs/ui/PAGE-COVERAGE.md", lines.join("\n"));
}
for (const violation of violations) console.error(violation);
console.log(
  `UI contracts: ${files.length} TSX files, ${inventory.length} route definitions, ${violations.length} violations`,
);
if (violations.length) process.exitCode = 1;
