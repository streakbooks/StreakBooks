import { describe, expect, it } from "vitest";
import { ACTION_POLICY, matchOptions, parseFormAction, spokenDate, spokenMoney } from "./actions";

describe("structured voice form actions", () => {
  it.each([
    ["Select ABC Limited.", "contact.select"],
    ["choose customer ABC", "contact.select"],
    ["Set the invoice date to October 31, 2026.", "date.set"],
    ["make the due date next Friday", "date.set"],
    ["add consulting services for 1,500.00", "line.add"],
    ["change that to 1800", "line.amount"],
    ["set line 2 price to 12.55", "line.amount"],
    ["remove the second line item", "line.remove"],
    ["add another item", "line.add"],
    ["use account Consulting income", "account.select"],
    ["set tax code to Standard VAT", "tax.select"],
    ["set quantity to 2", "field.set"],
    ["set discount to 15", "field.set"],
    ["use the previous customer", "contact.previous"],
    ["save the invoice", "draft.save"],
  ])("recognises %s", (input, id) => expect(parseFormAction(input)?.id).toBe(id));
  it.each([
    "post invoice",
    "approve bill",
    "pay supplier",
    "refund 200",
    "delete invoice",
    "send invoice",
    "save then approve",
    "save;pay supplier",
  ])("does not expose high-risk or chained execution: %s", (input) =>
    expect(parseFormAction(input)).toBeNull(),
  );
  it("requires an on-screen save and keeps high risk actions in manual workflows", () => {
    expect(ACTION_POLICY["draft.save"].confirmation).toBe("screen");
    expect(ACTION_POLICY["financial.execute"].available).toBe(false);
  });
  it("matches duplicates without silently selecting one", () => {
    const options = [
      { id: "a", name: "ABC Limited" },
      { id: "b", name: "ABC Services" },
    ];
    expect(matchOptions("ABC", options)).toHaveLength(2);
    expect(matchOptions("ABC Limited", options)).toEqual([options[0]]);
    expect(matchOptions("", options)).toEqual([]);
  });
});

describe("accounting values", () => {
  it.each([
    ["October 31, 2026", "2026-10-31"],
    ["April 14 2026", "2026-04-14"],
    ["14 April 2026", "2026-04-14"],
    ["the 14th of April 2026", "2026-04-14"],
    ["Apr 14, 2026", "2026-04-14"],
    ["14 Apr 2026", "2026-04-14"],
    ["Sept 3rd 2026", "2026-09-03"],
    ["2026/04/14", "2026-04-14"],
    ["2026.04.14", "2026-04-14"],
    ["15th November 2026", "2026-11-15"],
    ["2028-02-29", "2028-02-29"],
    ["today", "2026-10-31"],
    ["tomorrow", "2026-11-01"],
    ["next Friday", "2026-11-06"],
  ])("interprets %s with an explicit reference date", (input, expected) =>
    expect(spokenDate(input, "2026-10-31")).toBe(expected),
  );
  it.each([
    "31/10/26",
    "03/04/2026",
    "February 30 2026",
    "31 Apr 2026",
    "14 April",
    "2026-02-29",
    "2026-13-01",
    "October 31",
    "unknown",
  ])("rejects invalid or ambiguous dates %s", (input) =>
    expect(spokenDate(input, "2026-10-31")).toBeNull(),
  );
  it.each(["$1,500", "1500 dollars", "USD 15", "1,50", "15.001", "-150", "0", "1e6"])(
    "rejects ambiguous, mismatched, negative or imprecise amounts %s",
    (input) => expect(spokenMoney(input, "GBP")).toHaveProperty("error"),
  );
  it("keeps exact decimals and respects currency precision", () => {
    expect(spokenMoney("GBP 1,500.25", "GBP")).toEqual({ value: "1500.25", currency: "GBP" });
    expect(spokenMoney("12.5", "JPY")).toHaveProperty("error");
    expect(spokenMoney("KWD 12.123", "KWD")).toEqual({ value: "12.123", currency: "KWD" });
  });
});

describe("company-configured numeric dates", () => {
  it("uses the exact configured order and validates the calendar", () => {
    expect(spokenDate("October15,2026", "2026-10-31")).toBe("2026-10-15");
    expect(spokenDate("15/10/2026", "2026-10-31", "DD/MM/YYYY")).toBe("2026-10-15");
    expect(spokenDate("10/15/2026", "2026-10-31", "MM/DD/YYYY")).toBe("2026-10-15");
    expect(spokenDate("10/11/2026", "2026-10-31", "DD/MM/YYYY")).toBe("2026-11-10");
    expect(spokenDate("10/11/2026", "2026-10-31", "MM/DD/YYYY")).toBe("2026-10-11");
    expect(spokenDate("15/10/2026", "2026-10-31", "MM/DD/YYYY")).toBeNull();
    expect(spokenDate("31/02/2026", "2026-10-31", "DD/MM/YYYY")).toBeNull();
    expect(spokenDate("10/11/26", "2026-10-31", "DD/MM/YYYY")).toBeNull();
  });
});
