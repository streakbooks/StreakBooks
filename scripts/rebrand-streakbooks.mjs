#!/usr/bin/env node
/**
 * One-off rebrand: LinkBooks → StreakBooks, remove Lovable copy (not the vite package).
 * Skips SQL migrations and lockfiles.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  ".output",
  "playwright-report",
  "test-results",
]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".pdf"]);
const SKIP_PATH_PARTS = ["supabase/migrations/"];

const REPLACEMENTS = [
  [
    "https://github.com/linkbusinessadvisory/LinkBooks",
    "https://github.com/streakbooks/StreakBooks",
  ],
  ["https://github.com/rohitmehra86/LinkBooks", "https://github.com/streakbooks/StreakBooks"],
  ["linkbusinessadvisory/LinkBooks", "streakbooks/StreakBooks"],
  ["rohitmehra86/LinkBooks", "streakbooks/StreakBooks"],
  ["https://link-books.vercel.app", "https://streakbooks.com"],
  ["link-books.vercel.app", "streakbooks.com"],
  ["LOVABLE_CRON_SECRET_PREVIOUS", "STREAKBOOKS_CRON_SECRET_PREVIOUS"],
  ["LOVABLE_CRON_SECRET", "STREAKBOOKS_CRON_SECRET"],
  ["LinkBooks", "StreakBooks"],
  ["linkbooks", "streakbooks"],
  ["LINKBOOKS", "STREAKBOOKS"],
];

function shouldSkip(absPath) {
  const rel = relative(ROOT, absPath).replaceAll("\\", "/");
  if (SKIP_PATH_PARTS.some((p) => rel.includes(p))) return true;
  if (rel === "scripts/rebrand-streakbooks.mjs") return true;
  if (rel.endsWith("bun.lock") || rel.endsWith("package-lock.json")) return true;
  const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
  if (SKIP_EXT.has(ext)) return true;
  return false;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(abs, files);
    } else if (!shouldSkip(abs)) {
      files.push(abs);
    }
  }
  return files;
}

let changed = 0;
for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!text.includes("LinkBooks") && !text.includes("linkbooks") && !text.includes("LINKBOOKS")) {
    if (
      !text.includes("linkbusinessadvisory") &&
      !text.includes("link-books") &&
      !text.includes("LOVABLE_CRON")
    ) {
      continue;
    }
  }
  let next = text;
  for (const [from, to] of REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  // Strip Lovable marketing blocks from markdown
  next = next.replace(/<!-- LOVABLE:BEGIN -->[\s\S]*?<!-- LOVABLE:END -->\n*/g, "");
  next = next.replace(
    /This repo also syncs with Lovable[^\n]*\n/g,
    "Production app: https://streakbooks.com/\n",
  );
  if (next !== text) {
    writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`rebrand-streakbooks: updated ${changed} files`);
