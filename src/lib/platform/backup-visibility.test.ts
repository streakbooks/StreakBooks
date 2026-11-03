import { describe, expect, it } from "vitest";
import { backupVisibility } from "./backup-visibility";

describe("backup visibility", () => {
  it("matches the 2 November 2026 backup list", () => {
    expect(
      backupVisibility({ role: "platform_owner", pitrEnabled: false, backupCount: 0 }),
    ).toEqual({
      status: "no_restore_point",
      restorePoint: false,
    });
  });

  it("does not turn an unknown list into a restore point", () => {
    expect(
      backupVisibility({ role: "platform_owner", pitrEnabled: null, backupCount: null }),
    ).toEqual({
      status: "unknown",
      restorePoint: false,
    });
    expect(() =>
      backupVisibility({ role: "platform_finance", pitrEnabled: false, backupCount: 0 }),
    ).toThrow(/permission/);
  });
});
