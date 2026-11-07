import { describe, expect, it } from "vitest";
import { emptyDraftLine, splitDraftLine, toClaimLineInputs } from "./draft-lines";

describe("draft line helpers", () => {
  it("builds claim line payloads from form rows", () => {
    const line = emptyDraftLine("2026-11-07");
    line.description = "Taxi";
    line.accountId = "acc-1";
    line.netInput = "10.00";
    line.taxInput = "1.00";
    expect(
      toClaimLineInputs([line], "USD", (value) => {
        if (value === "10.00") return 1000;
        if (value === "1.00") return 100;
        throw new Error(`unexpected ${value}`);
      }),
    ).toEqual([
      expect.objectContaining({
        description: "Taxi",
        accountId: "acc-1",
        netMinor: 1000,
        taxMinor: 100,
        grossMinor: 1100,
        reimbursableMinor: 1100,
      }),
    ]);
  });

  it("splits one draft line into equal account legs", () => {
    const line = emptyDraftLine("2026-11-07");
    line.description = "Hotel";
    line.accountId = "acc-old";
    line.netInput = "100";
    line.taxInput = "10";
    const result = splitDraftLine(
      line,
      "equal",
      [
        { accountId: "acc-a", label: "Dept A" },
        { accountId: "acc-b", label: "Dept B" },
      ],
      "USD",
      (value) => Number(value) * 100,
      (minor) => String(minor / 100),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((row) => row.accountId)).toEqual(["acc-a", "acc-b"]);
    expect(result.lines.map((row) => row.netInput)).toEqual(["50", "50"]);
    expect(result.lines.map((row) => row.taxInput)).toEqual(["5", "5"]);
  });
});
