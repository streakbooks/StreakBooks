import { describe, expect, it } from "vitest";
import { auditRowHash, verifyAuditChain, type AuditChainRow } from "./audit-chain";

function row(prevHash: string | null, action: string): AuditChainRow {
  const base = {
    prevHash,
    actorUserId: "actor-1",
    action,
    entityType: "company",
    entityId: "company-1",
    reason: "Checked",
    beforeState: null,
    afterState: '{"status":"active"}',
  };
  return { ...base, rowHash: auditRowHash(base) };
}

describe("audit chain", () => {
  it("accepts a chain and rejects one edited row", () => {
    const first = row(null, "opened");
    const second = row(first.rowHash, "closed");
    expect(verifyAuditChain([first, second])).toEqual({ ok: true, index: null });
    const edited = { ...first, reason: "Changed" };
    expect(verifyAuditChain([edited, second]).ok).toBe(false);
    expect(verifyAuditChain([edited, second]).index).toBe(0);
  });
});
