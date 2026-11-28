import { describe, expect, it } from "vitest";
import { roleHasPermission } from "@/lib/permissions";

describe("real estate permissions", () => {
  it("lets finance post and keeps staff from posting or approving", () => {
    expect(roleHasPermission("accountant", "realestate.post")).toBe(true);
    expect(roleHasPermission("accountant", "realestate.approve")).toBe(true);
    expect(roleHasPermission("bookkeeper", "realestate.post")).toBe(true);
    expect(roleHasPermission("bookkeeper", "realestate.approve")).toBe(false);
    expect(roleHasPermission("staff", "realestate.sales.manage")).toBe(true);
    expect(roleHasPermission("staff", "realestate.post")).toBe(false);
    expect(roleHasPermission("read_only", "realestate.view")).toBe(true);
    expect(roleHasPermission("read_only", "realestate.post")).toBe(false);
    expect(roleHasPermission("admin", "realestate.admin")).toBe(true);
  });
});
