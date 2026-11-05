import { describe, expect, it } from "vitest";
import {
  cashPolicyInput,
  cashOpeningInput,
  cashInventoryInput,
  cashExceptionInput,
} from "./cash-classification-contracts";
const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const evidence = {
  evidence_reference: "Original verified records",
  policy_note: "Reviewed original posting and independent accounting evidence",
  user_confirmed: true as const,
};
const policy = {
  companyId,
  payload: {
    ...evidence,
    kind: "prepaid",
    source_account_id: id(1),
    recognition_account_id: id(2),
    effective_from: "2026-01-01",
    evidence_journal_ids: [id(3)],
  },
};
const opening = {
  companyId,
  payload: {
    ...evidence,
    source_kind: "sales_invoice",
    document_id: id(4),
    posted_journal_id: id(3),
    control_account_id: id(1),
    equity_account_id: id(5),
    currency_code: "GBP",
    gross_minor: "12000",
    components: [
      { account_id: id(2), amount_minor: "10000" },
      { account_id: id(6), amount_minor: "2000" },
    ],
    tax_lines: [{ id: "line", net_minor: "10000", tax_minor: "2000", tax_code_id: id(7) }],
    mode: "recognize_on_settlement",
    effective_from: "2026-01-01",
  },
};
describe("cash classification approval boundaries", () => {
  it("requires affirmative confirmation and supporting source journals", () => {
    expect(cashPolicyInput.safeParse(policy).success).toBe(true);
    expect(
      cashPolicyInput.safeParse({
        ...policy,
        payload: { ...policy.payload, user_confirmed: false },
      }).success,
    ).toBe(false);
    expect(
      cashPolicyInput.safeParse({
        ...policy,
        payload: { ...policy.payload, evidence_journal_ids: [] },
      }).success,
    ).toBe(false);
  });
  it("accepts an explicit balance-sheet identity policy only", () => {
    expect(
      cashPolicyInput.safeParse({
        ...policy,
        payload: { ...policy.payload, kind: "balance_sheet", recognition_account_id: id(1) },
      }).success,
    ).toBe(true);
    expect(
      cashPolicyInput.safeParse({
        ...policy,
        payload: { ...policy.payload, recognition_account_id: id(1) },
      }).success,
    ).toBe(false);
  });
  it("requires valid recognition dates", () => {
    expect(
      cashPolicyInput.safeParse({
        ...policy,
        payload: { ...policy.payload, effective_from: "2026-02-30" },
      }).success,
    ).toBe(false);
  });
  it("requires opening components and tax details to reconcile exactly", () => {
    expect(cashOpeningInput.safeParse(opening).success).toBe(true);
    expect(
      cashOpeningInput.safeParse({
        ...opening,
        payload: { ...opening.payload, gross_minor: "11999" },
      }).success,
    ).toBe(false);
    expect(
      cashOpeningInput.safeParse({
        ...opening,
        payload: {
          ...opening.payload,
          tax_lines: [{ ...opening.payload.tax_lines[0], tax_minor: "1999" }],
        },
      }).success,
    ).toBe(false);
  });
  it("preserves bigint amounts without lossy JavaScript numbers", () => {
    const amount = "9007199254740993";
    const p = {
      ...opening,
      payload: {
        ...opening.payload,
        gross_minor: amount,
        components: [{ account_id: id(2), amount_minor: amount }],
        tax_lines: [],
      },
    };
    expect(cashOpeningInput.parse(p).payload.gross_minor).toBe(amount);
    expect(
      cashOpeningInput.safeParse({
        ...p,
        payload: { ...p.payload, gross_minor: Number("9007199254740993") },
      }).success,
    ).toBe(false);
  });
  it("requires a customer return to identify its original approved sale", () => {
    const p = {
      companyId,
      payload: {
        ...evidence,
        purchase_document_id: id(1),
        purchase_journal_id: id(2),
        inventory_account_id: id(3),
        movement_journal_id: id(4),
        movement_kind: "customer_return",
        cost_minor: "50",
      },
    };
    expect(cashInventoryInput.safeParse(p).success).toBe(false);
    expect(
      cashInventoryInput.safeParse({ ...p, payload: { ...p.payload, reverses_evidence_id: id(5) } })
        .success,
    ).toBe(true);
  });
  it("rejects cross-company exception records", () => {
    expect(
      cashExceptionInput.safeParse({
        companyId,
        exception: {
          companyId: id(9),
          code: "missing_source",
          message: "Missing verified record",
          sourceAccountId: id(1),
          journalId: id(2),
          documentId: null,
          amountMinor: "100",
          currency: "GBP",
          date: "2026-11-01",
          period: { from: "2026-11-01", to: "2026-11-30" },
          missingEvidence: ["Original document"],
        },
      }).success,
    ).toBe(false);
  });
});
