import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
const files = [];
function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
}
scan("src");
const violations = [];
const inventory = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8"),
    root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(root);
      const line = root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1;
      if (
        [
          "LookupSelect",
          "RecordLookupSelect",
          "MultiLookupSelect",
          "AccountLookup",
          "ContactLookup",
          "ProductLookup",
          "TaxLookup",
          "TrackingLookup",
          "BankLookup",
        ].includes(tag)
      )
        inventory.push({
          file,
          line,
          component: tag,
          attributes: opening.attributes.getText(root).slice(0, 250),
        });
      if (ts.isJsxElement(node) && ["select", "Select"].includes(tag)) {
        const children = node.children.map((c) => c.getText(root)).join("");
        if (/\.map\s*\(/.test(children) && !children.includes("lookup-fixed-enum:"))
          violations.push({
            file,
            line,
            message:
              "Mapped option data must use the shared lookup, or document the short fixed enumeration with lookup-fixed-enum:",
          });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
}
if (process.argv.includes("--inventory"))
  console.log(JSON.stringify({ inventory, violations }, null, 2));
else {
  for (const v of violations) console.error(`${v.file}:${v.line} ${v.message}`);
  console.log(
    `Lookup architecture: ${inventory.length} shared lookup declarations; ${violations.length} violations`,
  );
}
if (violations.length) process.exitCode = 1;
