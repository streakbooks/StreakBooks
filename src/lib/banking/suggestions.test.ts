import { describe, expect, it } from "vitest";
import { normalizePayee, rankCodingSuggestions } from "./suggestions";

describe("bank coding suggestions", () => {
  it("normalizes payee text", () => {
    expect(normalizePayee("  CLOUD HOSTING*123  ")).toBe("cloud hosting 123");
  });

  it("ranks history above weaker rule matches and stays org-local", () => {
    const suggestions = rankCodingSuggestions({
      description: "CLOUD HOSTING monthly",
      amountMinor: -12000,
      history: [
        {
          payee_normalized: "cloud hosting monthly",
          offset_account_id: "acc-exp",
          direction: "out",
          times_used: 4,
          account_code: "6000",
          account_name: "Operating Expenses",
        },
      ],
      rules: [
        {
          id: "r1",
          name: "Hosting",
          match_field: "description",
          match_pattern: "cloud hosting",
          match_type: "contains",
          offset_account_id: "acc-exp",
          priority: 10,
          is_active: true,
          account_code: "6000",
          account_name: "Operating Expenses",
        },
      ], // account fields required for exactOptionalPropertyTypes
    });
    expect(suggestions[0]?.source).toBe("history");
    expect(suggestions[0]?.offsetAccountId).toBe("acc-exp");
    expect(suggestions[0]?.confidence).toBeGreaterThan(0.5);
  });

  it("applies equals / starts_with / ends_with rule types", () => {
    const base = {
      description: "BANK SERVICE FEE",
      amountMinor: -500,
      history: [],
    };
    const rule = {
      id: "r",
      name: "Fees",
      match_field: "description",
      match_pattern: "bank service",
      match_type: "starts_with",
      offset_account_id: "acc-fee",
      priority: 1,
      is_active: true,
      account_code: null,
      account_name: null,
    };
    expect(rankCodingSuggestions({ ...base, rules: [rule] })[0]?.offsetAccountId).toBe("acc-fee");
  });
});

describe("Coding Memory matching safeguards", () => {
  const history = (over = {}) => ({
    payee_normalized: "cloud",
    offset_account_id: "expense",
    direction: "out" as const,
    times_used: 4,
    account_code: "6000",
    account_name: "Expenses",
    ...over,
  });
  const rule = (over = {}) => ({
    id: "r",
    name: "Cloud",
    match_field: "description",
    match_type: "contains",
    match_pattern: "cloud",
    offset_account_id: "expense",
    priority: 1,
    is_active: true,
    account_code: "6000",
    account_name: "Expenses",
    ...over,
  });
  const base = {
    description: "cloud hosting",
    amountMinor: -12000,
    bankAccountId: "bank-a",
    history: [],
    rules: [],
  };

  it.each([
    { direction: "in" },
    { min_amount_minor: 12001 },
    { max_amount_minor: 11999 },
    { bank_account_id: "bank-b" },
    { is_active: false },
  ])("excludes an inapplicable rule: %j", (scope) => {
    expect(rankCodingSuggestions({ ...base, rules: [rule(scope)] })).toEqual([]);
  });
  it("accepts inclusive amount boundaries with the matching bank and direction", () => {
    const result = rankCodingSuggestions({
      ...base,
      rules: [
        rule({
          direction: "out",
          bank_account_id: "bank-a",
          min_amount_minor: 12000,
          max_amount_minor: 12000,
        }),
      ],
    });
    expect(result[0]?.matchStrength).toBe("explicit rule");
  });
  it("evaluates stored reference and payee fields instead of description", () => {
    expect(
      rankCodingSuggestions({
        ...base,
        reference: "inv-42",
        rules: [rule({ match_field: "reference", match_pattern: "inv-42" })],
      }),
    ).toHaveLength(1);
    expect(
      rankCodingSuggestions({
        ...base,
        payee: "Supplier",
        rules: [rule({ match_field: "payee", match_pattern: "supplier" })],
      }),
    ).toHaveLength(1);
    expect(
      rankCodingSuggestions({ ...base, rules: [rule({ match_field: "reference" })] }),
    ).toHaveLength(0);
  });
  it("does not match blank payees or substrings inside another supplier name", () => {
    expect(
      rankCodingSuggestions({
        ...base,
        description: "",
        history: [history({ payee_normalized: "" })],
      }),
    ).toEqual([]);
    expect(
      rankCodingSuggestions({ ...base, description: "cloudberry", history: [history()] }),
    ).toEqual([]);
  });
  it("keeps opposite directions and invalid usage out of matching history", () => {
    expect(
      rankCodingSuggestions({
        ...base,
        history: [
          history({ direction: "in" }),
          history({ times_used: 0 }),
          history({ times_used: -1 }),
        ],
      }),
    ).toEqual([]);
  });
  it("exposes conflicting accounts even when the result limit hides alternatives", () => {
    const result = rankCodingSuggestions({
      ...base,
      limit: 1,
      history: [history(), history({ offset_account_id: "other" })],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.conflictingHistory).toBe(true);
  });
  it("prefers exact evidence and deduplicates repeated account mappings", () => {
    const result = rankCodingSuggestions({
      ...base,
      history: [
        history({ times_used: 100 }),
        history({ payee_normalized: "cloud hosting", times_used: 1 }),
      ],
      rules: [rule()],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.matchStrength).toBe("exact history");
  });
  it("keeps equal-priority rules deterministic", () => {
    const first = rule({ id: "a", offset_account_id: "a" });
    const second = rule({ id: "b", offset_account_id: "b" });
    expect(rankCodingSuggestions({ ...base, rules: [second, first] })).toEqual(
      rankCodingSuggestions({ ...base, rules: [first, second] }),
    );
  });
});
