import { describe, expect, it } from "vitest";
import { advanceDraft, beginDraft } from "./draft-workflow";

describe("guided accounting draft preview", () => {
  it.each(["sales_invoice", "supplier_bill"] as const)("collects a %s without posting", (kind) => {
    let result = beginDraft(kind);
    for (const answer of ["Example Customer", "INV-42", "1250.50", "2026-11-30"]) {
      result = advanceDraft(result.state, answer);
    }
    expect(result.state.status).toBe("review");
    expect(result.state.values.amount_minor).toBe(125050);
    expect(result.response).toContain("NOT saved or posted");
  });
  it("does not accept ambiguous money", () => {
    let result = beginDraft("supplier_bill");
    result = advanceDraft(result.state, "ABC Supplies");
    result = advanceDraft(result.state, "B-1");
    const ambiguous = advanceDraft(result.state, "one thousand dollars");
    expect(ambiguous.state.step).toBe("amount_minor");
    expect(ambiguous.response).toMatch(/unambiguous/);
  });
  it("can cancel without persistence", () => {
    const result = advanceDraft(beginDraft("sales_invoice").state, "cancel");
    expect(result.state.status).toBe("cancelled");
    expect(result.response).toContain("No accounting record was saved");
  });
  it("rejects out-of-range dates without crashing", () => {
    let result = beginDraft("sales_invoice");
    for (const value of ["Customer", "INV-1", "25.00"]) result = advanceDraft(result.state, value);
    for (const date of ["9999-99-99", "2026-02-30", "0000-00-00"]) {
      const invalid = advanceDraft(result.state, date);
      expect(invalid.state.status).toBe("collecting");
      expect(invalid.response).toMatch(/valid YYYY-MM-DD/);
    }
  });
  it("rejects invalid dates and amounts", () => {
    let result = beginDraft("sales_invoice");
    for (const value of ["A", "INV-1"]) result = advanceDraft(result.state, value);
    expect(advanceDraft(result.state, "-5").state.step).toBe("amount_minor");
    result = advanceDraft(result.state, "5.00");
    expect(advanceDraft(result.state, "2026-02-30").state.status).toBe("collecting");
  });
});
