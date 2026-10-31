import { describe, expect, it } from "vitest";
import { canNavigateByVoice, parseDeterministicCommand } from "./deterministic-engine";
import { permissionsForRole } from "@/lib/permissions";

describe("deterministic voice navigation", () => {
  it.each([
    ["open dashboard", "/", "company.view"],
    ["open invoices", "/sales/invoices", "sales.view"],
    ["open bills", "/purchases/bills", "purchases.view"],
    ["open banking", "/banking", "banking.view"],
    ["open contacts", "/contacts", "company.view"],
    ["create invoice", "/sales/invoices/new", "sales.draft"],
    ["create a supplier bill", "/purchases/bills/new", "purchases.draft"],
    [" OPEN   THE INVOICES! ", "/sales/invoices", "sales.view"],
    ["Go to my dashboard.", "/", "company.view"],
    ["show customer invoices", "/sales/invoices", "sales.view"],
    ["navigate to bank accounts", "/banking", "banking.view"],
    ["take me to contacts", "/contacts", "company.view"],
    ["view reports", "/reports", "reports.view"],
    ["display fixed assets", "/fixed-assets", "accounting.view"],
    ["switch to sales", "/sales", "sales.view"],
    ["open purchases", "/purchases", "purchases.view"],
    ["new invoice", "/sales/invoices/new", "sales.draft"],
    ["open new invoice", "/sales/invoices/new", "sales.draft"],
    ["ｏｐｅｎ ｂｉｌｌｓ", "/purchases/bills", "purchases.view"],
  ])("matches %s to the existing route %s", (phrase, destination, requiredPermission) => {
    expect(parseDeterministicCommand(phrase)).toMatchObject({
      kind: "matched",
      command: { destination, requiredPermission },
    });
  });

  it.each([
    "",
    "invoice",
    "save invoice",
    "post bill",
    "delete contact",
    "approve invoice",
    "pay bills",
    "initiate payment",
    "create payment",
    "create invoice for Alice for 200",
    "open invoices and pay bills",
    "open invoices, save invoice",
    "open bills then approve",
    "do not open invoices",
    "open invoices or bills",
    "open invoices/bills",
    "open https://example.com",
    "open /sales/invoices",
    "open invoicez",
    "start sales invoice draft",
    "open banking; delete everything",
    "x".repeat(1001),
  ])("rejects unsupported or mutating speech: %s", (phrase) => {
    expect(parseDeterministicCommand(phrase).kind).toBe("unsupported");
  });

  it("uses the supplied permission list and requires view plus draft for forms", () => {
    const result = parseDeterministicCommand("create invoice");
    if (result.kind !== "matched") throw new Error("Expected a matching command");
    expect(canNavigateByVoice(result.command, permissionsForRole("owner"))).toBe(true);
    expect(canNavigateByVoice(result.command, permissionsForRole("staff"))).toBe(true);
    expect(canNavigateByVoice(result.command, permissionsForRole("read_only"))).toBe(false);
    expect(canNavigateByVoice(result.command, permissionsForRole("unknown"))).toBe(false);
    expect(canNavigateByVoice(result.command, ["company.view", "sales.draft"])).toBe(false);
    expect(canNavigateByVoice(result.command, ["sales.view", "sales.draft"])).toBe(false);
    expect(canNavigateByVoice(result.command, [])).toBe(false);
  });

  it.each([
    ["open invoices", "sales.view"],
    ["open bills", "purchases.view"],
    ["open banking", "banking.view"],
    ["create bill", "purchases.draft"],
  ] as const)("blocks %s without its module permission", (phrase, required) => {
    const result = parseDeterministicCommand(phrase);
    if (result.kind !== "matched") throw new Error("Expected a matching command");
    expect(
      canNavigateByVoice(
        result.command,
        permissionsForRole("owner").filter((p) => p !== required),
      ),
    ).toBe(false);
  });
});
