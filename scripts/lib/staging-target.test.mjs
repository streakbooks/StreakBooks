import { describe, expect, it } from "vitest";
import { validateStagingTarget } from "./staging-target.mjs";

const staging = {
  stagingUrl: "https://staging.linkbooks.example.com",
  expectedHost: "staging.linkbooks.example.com",
  productionUrl: "https://app.linkbooks.example.com",
};

describe("staging E2E safety guard", () => {
  it("accepts only an explicit, distinct HTTPS staging origin", () => {
    expect(validateStagingTarget(staging)).toEqual({
      origin: "https://staging.linkbooks.example.com",
      hostname: "staging.linkbooks.example.com",
    });
  });

  it("rejects production even when the expected hostname was accidentally set to production", () => {
    expect(() =>
      validateStagingTarget({
        ...staging,
        stagingUrl: staging.productionUrl,
        expectedHost: "app.linkbooks.example.com",
      }),
    ).toThrow(/production hostname/);
  });

  it("rejects a mismatch between expected and actual staging host", () => {
    expect(() =>
      validateStagingTarget({
        ...staging,
        stagingUrl: "https://other.example.com",
      }),
    ).toThrow(/does not match/);
  });

  it("rejects HTTP, embedded credentials, query strings, fragments and custom paths", () => {
    for (const url of [
      "http://staging.linkbooks.example.com",
      "https://user:pass@staging.linkbooks.example.com",
      "https://staging.linkbooks.example.com/?token=x",
      "https://staging.linkbooks.example.com/#password",
      "https://staging.linkbooks.example.com/login",
      "https://staging.linkbooks.example.com:9443",
    ]) {
      expect(() => validateStagingTarget({ ...staging, stagingUrl: url })).toThrow();
    }
  });

  it("requires a production comparison and an exact known hostname", () => {
    expect(() => validateStagingTarget({ ...staging, productionUrl: "" })).toThrow();
    expect(() => validateStagingTarget({ ...staging, expectedHost: "" })).toThrow();
    expect(() =>
      validateStagingTarget({ ...staging, expectedHost: "https://staging.linkbooks.example.com" }),
    ).toThrow();
  });

  it("rejects localhost and numeric IP targets", () => {
    for (const hostname of ["localhost", "127.0.0.1", "10.0.0.1", "dev.local", "[::1]"]) {
      expect(() =>
        validateStagingTarget({
          ...staging,
          stagingUrl: "https://" + hostname,
          expectedHost: hostname,
        }),
      ).toThrow(/staging hostname|public staging hostname/);
    }
  });
});
