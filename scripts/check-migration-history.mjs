import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditMigrationIdentities } from "./check-migration-identities.mjs";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const consolidation = new URL(
  "../docs/engineering/reviews/20261119-all-pending-consolidation.json",
  import.meta.url,
);
const correctedVersion = "20261106064353";

export function compareMigrationHistory(files, rows, renames) {
  const identityAudit = auditMigrationIdentities(files);
  if (identityAudit.errors.length) throw new Error(identityAudit.errors.join("\n"));
  if (!Array.isArray(rows)) throw new Error("Expected a JSON array of migration history rows.");

  const local = new Map(
    files
      .filter((file) => file.endsWith(".sql"))
      .map((file) => [file.slice(0, 14), file.slice(15, -4)]),
  );
  const applied = new Map();
  for (const row of rows) {
    if (
      typeof row?.version !== "string" ||
      !/^\d{14}$/.test(row.version) ||
      (row.name !== null && (typeof row.name !== "string" || !/^[\w.-]+$/.test(row.name)))
    ) {
      throw new Error("Each history row needs a 14-digit version and a migration name or null.");
    }
    if (applied.has(row.version)) throw new Error(`Repeated history version ${row.version}.`);
    applied.set(row.version, row.name);
  }

  const blockers = [];
  const latest = [...applied.keys()].sort().at(-1);
  const pending = [...local.keys()].filter((version) => !applied.has(version));
  for (const [version, remoteName] of applied) {
    const localName = local.get(version);
    if (!localName) blockers.push(`Applied version ${version} is absent from this checkout.`);
    else if (remoteName === null) blockers.push(`Applied version ${version} has no recorded name.`);
    else if (remoteName !== localName) {
      blockers.push(`Version ${version} records ${remoteName}; this checkout has ${localName}.`);
    }
  }
  for (const { original, replacement } of renames) {
    if (applied.get(original.slice(0, 14)) === original.slice(15, -4)) {
      blockers.push(
        `${original} is already recorded under its old version. Review ${replacement} before applying it.`,
      );
    }
  }
  for (const version of pending) {
    if (latest && version < latest)
      blockers.push(`Unapplied version ${version} precedes applied version ${latest}.`);
  }
  if (applied.has(correctedVersion)) {
    blockers.push(
      `Version ${correctedVersion} has a historical SQL correction. Verify the recorded SQL or schema before upgrading.`,
    );
  }
  return { applied: applied.size, pending: pending.length, blockers };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) {
      throw new Error("Usage: npm run check:migration-history -- <history.json>");
    }
    const rows = JSON.parse(readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""));
    const { migrationRenames } = JSON.parse(readFileSync(consolidation, "utf8"));
    const { applied, pending, blockers } = compareMigrationHistory(
      readdirSync(migrationDirectory),
      rows,
      migrationRenames,
    );
    console.log(`Applied versions: ${applied}. Local versions absent from history: ${pending}.`);
    if (blockers.length) {
      console.error(blockers.join("\n"));
      process.exitCode = 1;
    } else
      console.log("Migration history identity check passed. SQL equivalence was not verified.");
  } catch (error) {
    console.error(
      error instanceof SyntaxError ? "Could not parse the migration history JSON." : error.message,
    );
    process.exitCode = 1;
  }
}
