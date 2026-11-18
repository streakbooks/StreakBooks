import { describe, expect, it } from "vitest";
import {
  parsePosMinor,
  posCountFromDisplay,
  parseCreatePosRegister,
  parsePosSessionCommand,
  parsePosLocationAccess,
} from "./register-contracts";
import { roleHasPermission } from "@/lib/permissions";
const id = "10000000-0000-4000-8000-000000000001";
describe("physical count and register inputs", () => {
  it("preserves bigint values that exceed browser safe integers", () =>
    expect(parsePosMinor("9007199254740993")).toBe("9007199254740993"));
  it.each([1, 1.5, -1, "-1", "1.0", "1e2", "01", "9223372036854775808", null, undefined])(
    "rejects ambiguous or unsafe minor input %s",
    (value) => expect(() => parsePosMinor(value)).toThrow(),
  );
  it.each([
    ["USD", "1.25", "125"],
    ["JPY", "125", "125"],
    ["KWD", "1.125", "1125"],
    ["INR", "₹1,250.00", "125000"],
  ])("parses physical count %s %s exactly", (currency, raw, expected) =>
    expect(posCountFromDisplay(raw, currency)).toBe(expected),
  );
  it.each([
    ["USD", "1.001"],
    ["JPY", "1.1"],
    ["KWD", "1.0001"],
    ["USD", "-1"],
    ["USD", ""],
  ])("does not silently round count %s %s", (currency, raw) =>
    expect(() => posCountFromDisplay(raw, currency)).toThrow(),
  );
  it("normalizes register labels and preserves supplied idempotency id", () =>
    expect(
      parseCreatePosRegister({
        companyId: id,
        registerId: id,
        locationId: id,
        cashAccountId: id,
        code: " till-1 ",
        name: " Counter ",
      }),
    ).toMatchObject({ registerId: id, code: "TILL-1", name: "Counter" }));
  it("requires a stable operation UUID, boolean access and tenant IDs", () => {
    expect(() =>
      parsePosSessionCommand({ companyId: id, targetId: id, operationId: "bad", amountMinor: "1" }),
    ).toThrow();
    expect(() =>
      parsePosLocationAccess({
        companyId: id,
        locationId: id,
        userId: id,
        allowed: "true" as unknown as boolean,
      }),
    ).toThrow();
  });
  it("keeps setup restricted while cashier duties need distinct grants", () => {
    expect(roleHasPermission("staff", "pos.register.open")).toBe(true);
    expect(roleHasPermission("staff", "pos.sale.create")).toBe(true);
    expect(roleHasPermission("staff", "pos.cash.adjust")).toBe(false);
    expect(roleHasPermission("staff", "pos.settings.manage")).toBe(false);
    expect(roleHasPermission("bookkeeper", "pos.cash.adjust")).toBe(true);
    expect(roleHasPermission("read_only", "pos.register.close")).toBe(false);
    expect(roleHasPermission("accountant", "pos.register.close")).toBe(false);
  });
});
