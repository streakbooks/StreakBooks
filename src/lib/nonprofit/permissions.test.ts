import { describe, expect, it } from "vitest";
import { roleHasPermission } from "@/lib/permissions";

describe("nonprofit permissions", () => {
  it("lets finance post and keeps read-only users from posting or seeing beneficiaries", () => {
    expect(roleHasPermission("accountant", "nonprofit.post")).toBe(true);
    expect(roleHasPermission("accountant", "nonprofit.restrictions.release")).toBe(true);
    expect(roleHasPermission("bookkeeper", "nonprofit.post")).toBe(true);
    expect(roleHasPermission("bookkeeper", "nonprofit.restrictions.release")).toBe(false);
    expect(roleHasPermission("staff", "nonprofit.donations.manage")).toBe(true);
    expect(roleHasPermission("staff", "nonprofit.post")).toBe(false);
    expect(roleHasPermission("staff", "nonprofit.beneficiaries.view")).toBe(false);
    expect(roleHasPermission("read_only", "nonprofit.view")).toBe(true);
    expect(roleHasPermission("read_only", "nonprofit.post")).toBe(false);
  });
});
