import { describe, expect, it } from "vitest";
import {
  ACCESS_AREAS,
  adjustmentsFromSelection,
  effectivePermissions,
  isRoleLockedPermission,
  normaliseAdjustments,
  ROLE_LOCKED_PERMISSIONS,
} from "./access-catalogue";
import { PERMISSIONS } from "./permissions";

describe("access catalogue", () => {
  it("lists every permission once", () => {
    const listed = ACCESS_AREAS.flatMap((area) => area.items.map((item) => item.permission));
    expect(listed.slice().sort()).toEqual([...PERMISSIONS].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("keeps governance rights on the duty role", () => {
    expect(ROLE_LOCKED_PERMISSIONS).toContain("members.manage");
    expect(ROLE_LOCKED_PERMISSIONS).toContain("billing.manage");
    expect(isRoleLockedPermission("company.view")).toBe(true);
    expect(isRoleLockedPermission("sales.authorise")).toBe(false);
  });

  it("adds a grant and removes a denial without touching locked rights", () => {
    const next = effectivePermissions("staff", [
      { permission: "sales.authorise", effect: "grant" },
      { permission: "sales.draft", effect: "deny" },
      { permission: "members.manage", effect: "grant" },
      { permission: "company.view", effect: "deny" },
    ]);
    expect(next).toContain("sales.authorise");
    expect(next).not.toContain("sales.draft");
    expect(next).not.toContain("members.manage");
    expect(next).toContain("company.view");
  });

  it("does not customise an owner or an unknown role", () => {
    expect(effectivePermissions("owner", [{ permission: "sales.view", effect: "deny" }])).toContain(
      "sales.view",
    );
    expect(
      effectivePermissions("owner", [{ permission: "billing.manage", effect: "deny" }]),
    ).toContain("billing.manage");
    expect(effectivePermissions("hacker", [{ permission: "sales.view", effect: "grant" }])).toEqual(
      [],
    );
  });

  it("stores only real differences from the duty role", () => {
    expect(
      normaliseAdjustments("bookkeeper", [
        { permission: "periods.unlock", effect: "grant" },
        { permission: "journals.manual", effect: "deny" },
        { permission: "sales.view", effect: "grant" },
        { permission: "billing.manage", effect: "grant" },
        { permission: "accounts.manage", effect: "deny" },
      ]),
    ).toEqual([
      { permission: "periods.unlock", effect: "grant" },
      { permission: "journals.manual", effect: "deny" },
    ]);
    expect(normaliseAdjustments("owner", [{ permission: "sales.void", effect: "deny" }])).toEqual(
      [],
    );
  });

  it("builds adjustments from a checkbox selection", () => {
    const selected = new Set(effectivePermissions("staff"));
    selected.add("sales.authorise");
    selected.delete("contacts.manage");
    expect(adjustmentsFromSelection("staff", selected)).toEqual([
      { permission: "sales.authorise", effect: "grant" },
      { permission: "contacts.manage", effect: "deny" },
    ]);
  });
});
