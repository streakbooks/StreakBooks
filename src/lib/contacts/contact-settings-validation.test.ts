import { describe, expect, it } from "vitest";
import {
  normalizeContactSettingsValues,
  parseContactSettingsDraft,
} from "./contact-settings-validation";

const valid = {
  defaultKind: "both",
  prefix: " C- ",
  nextNum: "1001",
  terms: "0",
};

describe("Contact settings validation", () => {
  it("preserves valid defaults and zero-day terms", () => {
    expect(parseContactSettingsDraft(valid)).toMatchObject({
      ok: true,
      value: {
        defaultKind: "both",
        accountNumberPrefix: "C-",
        nextAccountNumber: 1001,
        defaultPaymentTermsDays: 0,
      },
    });
    expect(normalizeContactSettingsValues({})).toEqual({
      defaultKind: "customer",
      accountNumberPrefix: "C",
      nextAccountNumber: 1001,
      defaultPaymentTermsDays: 30,
    });
  });

  it.each(["", " ", "-2", "0", "1.2", "1e3", "2147483647", "Infinity", "NaN"])(
    "rejects invalid next account number %s",
    (nextNum) => expect(parseContactSettingsDraft({ ...valid, nextNum }).ok).toBe(false),
  );

  it.each(["", " ", "-2", "1.2", "1e2", "3651", "NaN"])(
    "rejects invalid payment terms %s",
    (terms) => expect(parseContactSettingsDraft({ ...valid, terms }).ok).toBe(false),
  );

  it("rejects invalid roles and prefixes without silently replacing or truncating them", () => {
    expect(parseContactSettingsDraft({ ...valid, defaultKind: "unknown" }).ok).toBe(false);
    expect(parseContactSettingsDraft({ ...valid, prefix: " " }).ok).toBe(false);
    expect(parseContactSettingsDraft({ ...valid, prefix: "x".repeat(11) }).ok).toBe(false);
  });

  it.each([
    { defaultKind: "unknown" },
    { accountNumberPrefix: "x".repeat(11) },
    { accountNumberPrefix: "" },
    { nextAccountNumber: 2.7 },
    { nextAccountNumber: 2147483647 },
    { defaultPaymentTermsDays: -1 },
    { defaultPaymentTermsDays: 3651 },
    { defaultPaymentTermsDays: 1.5 },
    { defaultPaymentTermsDays: "14" },
  ])("rejects malformed API input: %j", (input) => {
    expect(() => normalizeContactSettingsValues(input)).toThrow();
  });
});
