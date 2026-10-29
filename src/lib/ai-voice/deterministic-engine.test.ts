import { describe, expect, it } from "vitest";
import { parseDeterministicCommand, supportedNavigationCommands } from "./deterministic-engine";

describe("deterministic voice command interpreter", () => {
  it.each([
    ["Open sales", "/sales"],
    ["Show my invoices", "/sales"],
    ["Navigate to chart of accounts", "/accounting"],
    ["Go to the reports", "/reports"],
    ["View overdue bills", null],
    ["Show bank accounts", "/banking"],
    ["Take me to dashboard", "/"],
    ["Display fixed assets", "/fixed-assets"],
  ])("interprets %s safely", (text, path) => {
    const result = parseDeterministicCommand(text);
    if (path === null) expect(result.kind).toBe("unsupported");
    else {
      expect(result.kind).toBe("matched");
      if (result.kind === "matched") {
        expect(result.command.intent).toBe("navigate");
        if (result.command.intent === "navigate") expect(result.command.destination).toBe(path);
      }
    }
  });
  it("matches accounting review without financial mutation", () => {
    const result = parseDeterministicCommand("Show reconciliation exceptions");
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.command.intent).toBe("review");
      expect(result.command.requiredPermission).toBe("banking.view");
    }
  });
  it("never executes text as SQL, code or external navigation", () => {
    for (const attack of [
      "run SQL drop table companies",
      "open https://evil.example",
      "delete all invoices",
      "confirm posting journal",
      "open sales and delete all invoices",
    ]) expect(parseDeterministicCommand(attack).kind).toBe("unsupported");
  });
  it("rejects excessive input", () => {
    expect(parseDeterministicCommand("open sales " + "a".repeat(1100)).kind).toBe("unsupported");
  });
  it("has unique destinations", () => {
    expect(new Set(supportedNavigationCommands.map((c) => c.label)).size).toBe(supportedNavigationCommands.length);
  });
});
