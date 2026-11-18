import { describe, expect, it } from "vitest";
import { mapCreditNoteLinesForCopy } from "@/lib/purchases/copy-credit-note";

describe("mapCreditNoteLinesForCopy", () => {
  it("orders by line_no and maps fields for a new draft", () => {
    const lines = mapCreditNoteLinesForCopy([
      {
        description: "B",
        account_id: "a2",
        net_minor: 200,
        tax_minor: 40,
        line_no: 2,
      },
      {
        description: "A",
        account_id: "a1",
        net_minor: 100,
        tax_minor: 20,
        line_no: 1,
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.description).toBe("A");
    expect(lines[0]?.netMinor).toBe(100);
    expect(lines[0]?.taxMinor).toBe(20);
    expect(lines[1]?.accountId).toBe("a2");
  });

  it("rejects lines without an account", () => {
    expect(() =>
      mapCreditNoteLinesForCopy([
        {
          description: "x",
          account_id: null,
          net_minor: 1,
        },
      ]),
    ).toThrow(/account/i);
  });

  it("rejects blank descriptions", () => {
    expect(() =>
      mapCreditNoteLinesForCopy([
        {
          description: "  ",
          account_id: "a1",
          net_minor: 1,
        },
      ]),
    ).toThrow(/description/i);
  });
});
