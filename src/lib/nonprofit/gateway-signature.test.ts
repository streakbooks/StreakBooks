import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeStyleSignature } from "./gateway-signature";

const secret = "whsec_test_secret";
const payload = '{"id":"evt_donation_1","type":"payment.succeeded"}';
const timestamp = 1_700_000_000;

function header() {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

describe("nonprofit gateway signatures", () => {
  it("accepts a current signed webhook and rejects tampering, age and a wrong secret", () => {
    expect(verifyStripeStyleSignature(payload, header(), secret, timestamp + 10)).toBe(true);
    expect(verifyStripeStyleSignature(payload + " ", header(), secret, timestamp + 10)).toBe(false);
    expect(verifyStripeStyleSignature(payload, header(), "other-secret", timestamp + 10)).toBe(
      false,
    );
    expect(verifyStripeStyleSignature(payload, header(), secret, timestamp + 301)).toBe(false);
    expect(verifyStripeStyleSignature(payload, "", secret, timestamp)).toBe(false);
  });
});
