import { describe, expect, it } from "vitest";
import { assertRefundPayment } from "./refund-policy";
const customer = { provider_customer_id: "cus_expected", currency: "GBP" };
const payment = {
  customer: "cus_expected",
  currency: "gbp",
  status: "succeeded",
  amount_received: 5000,
};
describe("provider refund authorization", () => {
  it("accepts a captured payment for this billing customer and currency", () =>
    expect(() => assertRefundPayment(payment, customer, 1200)).not.toThrow());
  it("rejects a payment from a different tenant", () =>
    expect(() =>
      assertRefundPayment({ ...payment, customer: "cus_other" }, customer, 1200),
    ).toThrow());
  it("rejects mismatched currency and uncaptured payments", () => {
    expect(() => assertRefundPayment({ ...payment, currency: "usd" }, customer, 1200)).toThrow();
    expect(() =>
      assertRefundPayment({ ...payment, status: "requires_capture" }, customer, 1200),
    ).toThrow();
  });
  it("rejects missing provider evidence, excess and fractional amounts", () => {
    for (const amount of [5001, 1.2, 0, NaN])
      expect(() => assertRefundPayment(payment, customer, amount)).toThrow();
    expect(() => assertRefundPayment({}, customer, 1200)).toThrow();
  });
});
