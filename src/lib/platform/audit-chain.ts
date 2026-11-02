import { createHash } from "node:crypto";

export type AuditChainRow = {
  prevHash: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  beforeState: string | null;
  afterState: string | null;
  rowHash: string;
};

/** Same payload as private.platform_audit_hash. Rewriting every later row still verifies. */
export function auditPayload(row: Omit<AuditChainRow, "rowHash">): string {
  return [
    row.prevHash ?? "",
    row.actorUserId ?? "",
    row.action,
    row.entityType,
    row.entityId,
    row.reason ?? "",
    row.beforeState ?? "",
    row.afterState ?? "",
  ].join("|");
}

export function auditRowHash(row: Omit<AuditChainRow, "rowHash">): string {
  return createHash("md5").update(auditPayload(row), "utf8").digest("hex");
}

export function verifyAuditChain(rows: readonly AuditChainRow[]): {
  ok: boolean;
  index: number | null;
} {
  let previous: string | null = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if ((row.prevHash ?? null) !== previous || row.rowHash !== auditRowHash(row)) {
      return { ok: false, index };
    }
    previous = row.rowHash;
  }
  return { ok: true, index: null };
}
