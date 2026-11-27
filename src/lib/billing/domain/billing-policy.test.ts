import { describe, expect, it } from "vitest";
import {
  classifyPlanChange,
  planChangePaymentCopy,
} from "@/lib/billing/domain/billing-policy";

describe("billing policy (industry standard)", () => {
  it("classifies upgrade, downgrade and same by amount", () => {
    expect(classifyPlanChange(2900, 5900)).toBe("upgrade");
    expect(classifyPlanChange(9900, 5900)).toBe("downgrade");
    expect(classifyPlanChange(5900, 5900)).toBe("same");
  });

  it("states upgrade charges now and downgrade waits for renewal", () => {
    const upgrade = planChangePaymentCopy("upgrade");
    const downgrade = planChangePaymentCopy("downgrade");
    expect(upgrade.paymentNow.toLowerCase()).toContain("prorated");
    expect(upgrade.whenStarts.toLowerCase()).toContain("payment");
    expect(downgrade.paymentNow.toLowerCase()).toContain("no charge");
    expect(downgrade.whenStarts.toLowerCase()).toContain("renewal");
  });
});
