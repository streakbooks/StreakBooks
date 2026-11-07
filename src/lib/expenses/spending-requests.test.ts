import { describe, expect, it } from "vitest";
import {
  mapExpenseSpendingRequest,
  spendingRequestRequiredForClaim,
  toExpenseSpendingRequestPayload,
} from "./spending-requests";

describe("expense spending requests", () => {
  it("maps RPC rows", () => {
    expect(
      mapExpenseSpendingRequest({
        id: "1",
        request_number: "SR-0001",
        title: "Conference",
        amount_minor: 50000,
        currency_code: "USD",
        status: "draft",
        version: 1,
        updated_at: "2026-11-07T00:00:00Z",
      }),
    ).toMatchObject({
      requestNumber: "SR-0001",
      amountMinor: 50000,
      status: "draft",
    });
  });

  it("builds save payloads", () => {
    expect(
      toExpenseSpendingRequestPayload({
        title: " Trip ",
        currencyCode: "aud",
        amountMinor: 1200,
      }),
    ).toEqual({
      id: null,
      version: 1,
      title: "Trip",
      description: null,
      needed_by: null,
      currency_code: "AUD",
      amount_minor: 1200,
    });
  });

  it("enforces the pre-spend threshold policy", () => {
    expect(
      spendingRequestRequiredForClaim({
        thresholdMinor: 10000,
        claimTotalMinor: 9999,
      }).ok,
    ).toBe(true);
    expect(
      spendingRequestRequiredForClaim({
        thresholdMinor: 10000,
        claimTotalMinor: 10000,
      }).ok,
    ).toBe(false);
    expect(
      spendingRequestRequiredForClaim({
        thresholdMinor: 10000,
        claimTotalMinor: 10000,
        linkedRequestStatus: "approved",
        linkedRequestAmountMinor: 10000,
      }).ok,
    ).toBe(true);
  });
});
