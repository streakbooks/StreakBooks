/**
 * Fail closed if a commit tracks a local environment file or generated build output.
 * File-name protection only: run a separate secret scanner for arbitrary file contents.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const forbiddenParts = new Set([
  "node_modules",
  ".output",
  ".vercel",
  ".wrangler",
  "coverage",
  "dist",
  "build",
  "playwright-report",
  "test-results",
]);

export function isForbiddenTrackedPath(path) {
  if (typeof path !== "string" || !path) return false;
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => forbiddenParts.has(part))) return true;
  if (normalized.endsWith(".tsbuildinfo")) return true;
  return parts.some((part) => /^\.env(?:\.[^/]*)?$/.test(part) && part !== ".env.example");
}

export function inspectRepository(repoRoot = process.cwd()) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tracked = output.split("\0").filter(Boolean);
  const forbidden = tracked.filter(isForbiddenTrackedPath);
  const required = [".env", ".env.local", ".vercel/output.json", "node_modules/example/index.js"];
  const notIgnored = required.filter((path) => {
    const result = spawnSync("git", ["check-ignore", "--no-index", "-q", path], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    return result.status !== 0;
  });
  const sample = tracked.includes(".env.example");
  return { forbidden, notIgnored, sample };
}

export function assertRepositoryHygiene(root = process.cwd()) {
  const result = inspectRepository(root);
  const problems = [
    ...(result.forbidden.length
      ? ["Tracked sensitive/generated paths: " + result.forbidden.join(", ")]
      : []),
    ...(result.notIgnored.length
      ? ["Required ignore rules missing for: " + result.notIgnored.join(", ")]
      : []),
    ...(!result.sample ? [".env.example must remain tracked"] : []),
  ];
  if (problems.length) throw new Error(problems.join("\n"));
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertRepositoryHygiene();
    process.stdout.write("Repository hygiene passed: no tracked .env or generated build files.\n");
  } catch (error) {
    process.stderr.write(
      "Repository hygiene failed: " +
        (error instanceof Error ? error.message : String(error)) +
        "\n",
    );
    process.exitCode = 1;
  }
}
