import { describe, expect, it } from "vitest";
import {
  acceptanceStartsPaidBilling,
  classifyAdvisorsRpc,
  requireCheckoutIdForAttach,
} from "@/lib/advisors/security-surface";

describe("advisors security surface", () => {
  it("classifies public, platform, portal and worker RPCs", () => {
    expect(classifyAdvisorsRpc("advisors_book_appointment")).toBe("public");
    expect(classifyAdvisorsRpc("platform_advisors_attach_checkout")).toBe("platform");
    expect(classifyAdvisorsRpc("advisors_portal_home")).toBe("portal");
    expect(classifyAdvisorsRpc("advisors_claim_due_reminders")).toBe("worker");
  });

  it("keeps proposal/agreement acceptance off the paid billing path", () => {
    expect(acceptanceStartsPaidBilling()).toBe(false);
  });

  it("refuses null checkout attach ids", () => {
    expect(() => requireCheckoutIdForAttach(null)).toThrow(/Checkout id is required/);
    expect(requireCheckoutIdForAttach("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
  });
});
