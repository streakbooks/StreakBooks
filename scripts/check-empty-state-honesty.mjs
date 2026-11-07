#!/usr/bin/env node
/**
 * Fail closed: EmptyState actionLabel must pair with onActionClick or action
 * in the same JSX opening tag block. Prevents advertising dead empty CTAs.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roots = ["src"];
const failures = [];
let scanned = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) scan(full);
  }
}

function scan(file) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("EmptyState") || !source.includes("actionLabel")) return;
  scanned += 1;
  const rel = path.relative(root, file).replaceAll("\\", "/");
  // Match <EmptyState ...> blocks (single-tag open through first `>`).
  const re = /<EmptyState\b([^>]*)>/g;
  let match;
  while ((match = re.exec(source))) {
    const attrs = match[1] ?? "";
    if (!attrs.includes("actionLabel")) continue;
    const hasClick = attrs.includes("onActionClick");
    const hasAction = /(^|\s)action=/.test(attrs);
    if (!hasClick && !hasAction) {
      failures.push(
        `${rel}: EmptyState actionLabel without onActionClick or action (dead CTA)`,
      );
    }
  }
}

for (const dir of roots) walk(path.join(root, dir));

if (failures.length) {
  for (const reason of failures) process.stderr.write(`FAIL ${reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Empty-state honesty passed: ${scanned} files with EmptyState actionLabel pair correctly.\n`,
  );
}
