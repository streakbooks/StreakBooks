import { describe, expect, it } from "vitest";
import { reconciliationFindingFingerprint } from "./reconciliation-review";
import type { ExceptionFinding } from "./reconciliation-exceptions";

const finding: ExceptionFinding = {
  key: "fixed_assets:depreciation:run-1:issue:0",
  source: "fixed_assets",
  severity: "error",
  title: "Fixed Assets depreciation posting exception",
  detail: "Debit expense does not match the posted source entry.",
  journalId: "11111111-1111-4111-8111-111111111111",
  reference: "22222222-2222-4222-8222-222222222222",
  findingCount: 1,
  href: "/fixed-assets",
};
describe("persistent reconciliation review identity", () => {
  it("produces a fixed 32-hex operational identity from the source evidence", () => {
    expect(reconciliationFindingFingerprint(finding)).toMatch(/^f[0-9a-f]{32}$/);
  });
  it("is stable across ephemeral finding key/index changes and input order", () => {
    expect(reconciliationFindingFingerprint(finding)).toBe(
      reconciliationFindingFingerprint({
        ...finding,
        key: "fixed_assets:depreciation:run-1:issue:99",
      }),
    );
  });
  it("keeps identical audit evidence associated with the same case across refreshes", () => {
    expect(reconciliationFindingFingerprint({ ...finding })).toBe(
      reconciliationFindingFingerprint(finding),
    );
  });
  it("does not silently carry old investigation status onto a changed issue description", () => {
    expect(
      reconciliationFindingFingerprint({ ...finding, detail: "Debit expense has changed." }),
    ).not.toBe(reconciliationFindingFingerprint(finding));
  });
  it("binds case identity to its source reference, GL journal, source and severity", () => {
    const fp = reconciliationFindingFingerprint(finding);
    expect(reconciliationFindingFingerprint({ ...finding, reference: "another-run" })).not.toBe(fp);
    expect(reconciliationFindingFingerprint({ ...finding, journalId: null })).not.toBe(fp);
    expect(reconciliationFindingFingerprint({ ...finding, source: "payroll" })).not.toBe(fp);
    expect(reconciliationFindingFingerprint({ ...finding, severity: "warning" })).not.toBe(fp);
  });
  it("does not collide on simple delimiter ambiguity", () => {
    const a = { ...finding, title: "a|b", detail: "c" };
    const b = { ...finding, title: "a", detail: "b|c" };
    expect(reconciliationFindingFingerprint(a)).not.toBe(reconciliationFindingFingerprint(b));
  });
  it("handles non-ASCII diagnostic text without truncation", () => {
    expect(
      reconciliationFindingFingerprint({ ...finding, detail: "₹50.00 – boîte dépensée" }),
    ).toMatch(/^f[0-9a-f]{32}$/);
  });
});
