#!/usr/bin/env node
/**
 * Fail closed: ErrorState load failures must expose onRetry (or opt out with
 * data-error-static). Brace-aware so `onRetry={() => ...}` does not truncate.
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

function openingTags(source, tag) {
  const needle = `<${tag}`;
  const opens = [];
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start < 0) break;
    const next = source[start + needle.length];
    if (next && /[A-Za-z0-9_]/.test(next)) {
      from = start + needle.length;
      continue;
    }
    let depth = 0;
    let j = start + needle.length;
    while (j < source.length) {
      const c = source[j];
      if (c === "{") depth += 1;
      else if (c === "}") depth = Math.max(0, depth - 1);
      else if (c === ">" && depth === 0) {
        opens.push(source.slice(start, j + 1));
        break;
      }
      j += 1;
    }
    from = j + 1;
  }
  return opens;
}

function scan(file) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("ErrorState")) return;
  scanned += 1;
  const rel = path.relative(root, file).replaceAll("\\", "/");
  for (const attrs of openingTags(source, "ErrorState")) {
    if (attrs.includes("data-error-static")) continue;
    if (attrs.includes("onRetry") || /(^|[\s{])retry[=:]/.test(attrs)) continue;
    failures.push(
      `${rel}: ErrorState without onRetry/retry (add recovery or data-error-static)`,
    );
  }
}

for (const dir of roots) walk(path.join(root, dir));

if (failures.length) {
  for (const reason of failures) process.stderr.write(`FAIL ${reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Error-state retry honesty passed: ${scanned} files with ErrorState pair correctly.\n`,
  );
}
