import { describe, expect, it } from "vitest";
import {
  isDelegationActive,
  mapExpenseApprovalDelegation,
  userHasActiveIncomingDelegation,
} from "./delegation";

describe("expense approval delegation helpers", () => {
  it("maps RPC rows", () => {
    const row = mapExpenseApprovalDelegation({
      id: "d1",
      company_id: "c1",
      from_user_id: "a",
      to_user_id: "b",
      starts_on: "2026-11-01",
      ends_on: "2026-11-10",
      note: "Holiday cover",
      created_at: "2026-11-01T00:00:00Z",
      revoked_at: null,
    });
    expect(row.toUserId).toBe("b");
    expect(isDelegationActive(row, "2026-11-07")).toBe(true);
    expect(isDelegationActive(row, "2026-11-11")).toBe(false);
  });

  it("detects active incoming cover", () => {
    const rows = [
      mapExpenseApprovalDelegation({
        id: "d1",
        company_id: "c1",
        from_user_id: "a",
        to_user_id: "b",
        starts_on: "2026-11-01",
        ends_on: "2026-11-10",
        note: null,
        created_at: "2026-11-01T00:00:00Z",
        revoked_at: null,
      }),
    ];
    expect(userHasActiveIncomingDelegation(rows, "b", "2026-11-07")).toBe(true);
    expect(userHasActiveIncomingDelegation(rows, "a", "2026-11-07")).toBe(false);
  });
});
