import { describe, expect, it } from "vitest";
import {
  isPostingJournalEntityType,
  postingJournalSourceTypes,
} from "@/lib/documents/posting-journal-sources";

describe("document posting journal source mapping", () => {
  it("maps the major sales, purchase, bank and money documents", () => {
    expect(postingJournalSourceTypes("sales_invoice")).toEqual(["sales_invoice"]);
    expect(postingJournalSourceTypes("purchase_bill")).toEqual(["purchase_bill"]);
    expect(postingJournalSourceTypes("purchase_expense")).toEqual(["expense"]);
    expect(postingJournalSourceTypes("supplier_payment")).toEqual(["supplier_payment"]);
    expect(postingJournalSourceTypes("bank_transfer")).toEqual(["bank_transfer"]);
    expect(postingJournalSourceTypes("money_receive")).toEqual(["other"]);
  });

  it("does not pretend that quotes and purchase orders have GL entries", () => {
    expect(postingJournalSourceTypes("sales_quote")).toEqual([]);
    expect(postingJournalSourceTypes("purchase_order")).toEqual([]);
    expect(postingJournalSourceTypes("contact")).toEqual([]);
  });

  it("rejects unknown record types rather than querying unrelated journals", () => {
    expect(isPostingJournalEntityType("sales_invoice")).toBe(true);
    expect(isPostingJournalEntityType("not_a_document")).toBe(false);
    expect(isPostingJournalEntityType(null)).toBe(false);
  });
});
