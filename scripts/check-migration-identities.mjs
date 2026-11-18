import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Supabase records the numeric prefix as its primary key, not the full filename. */
export function auditMigrationIdentities(names) {
  const versions = new Map();
  const errors = [];
  for (const name of names) {
    if (!name.endsWith(".sql")) continue;
    const match = /^(\d{14})_.+\.sql$/.exec(name);
    if (!match) {
      errors.push(`Invalid migration filename: ${name}`);
      continue;
    }
    const version = match[1];
    const previous = versions.get(version);
    if (previous) errors.push(`Duplicate migration version ${version}: ${previous}, ${name}`);
    else versions.set(version, name);
  }
  return { versions: versions.size, errors };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditMigrationIdentities(readdirSync(path.join(root, "supabase/migrations")));
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else console.log(`Migration identity check passed: ${result.versions} unique versions.`);
}
