import { describe, expect, it } from "vitest";
import { purchaseOrderPreferenceNotice } from "./purchase-order-preference";

describe("purchase order preference notice", () => {
  it("guides bill entry when the organisation prefers purchase orders", () => {
    expect(purchaseOrderPreferenceNotice(true)).toMatch(/prefers a purchase order/i);
    expect(purchaseOrderPreferenceNotice(true)).toMatch(/continue if this bill is independent/i);
  });

  it("does not show policy guidance when the preference is disabled", () => {
    expect(purchaseOrderPreferenceNotice(false)).toBeNull();
  });
});
