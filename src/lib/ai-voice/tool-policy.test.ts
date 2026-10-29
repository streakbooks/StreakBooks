import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertVoiceExecutionAllowed, defineVoiceTool } from "./tool-policy";

const read = defineVoiceTool({
  name: "read_accounting_summary",
  description: "Read a summary",
  input: z.object({}),
  output: z.object({ asOf: z.string() }),
  riskTier: 0,
  permission: "reports.view",
  idempotency: "not_applicable",
  auditEventType: "ai.read",
});
const write = defineVoiceTool({
  name: "send_sales_invoice",
  description: "Send a document",
  input: z.object({ invoiceId: z.string().uuid() }),
  output: z.object({ sent: z.boolean() }),
  riskTier: 2,
  permission: "sales.authorise",
  idempotency: "required",
  auditEventType: "ai.send",
});

describe("voice tool security policy", () => {
  it("requires ai.use plus the domain permission", () => {
    expect(() => assertVoiceExecutionAllowed(read, ["reports.view"], null, false)).toThrow(/Permission denied/);
    expect(() => assertVoiceExecutionAllowed(read, ["ai.use"], null, false)).toThrow(/Permission denied/);
    expect(() => assertVoiceExecutionAllowed(read, ["ai.use", "reports.view"], null, false)).not.toThrow();
  });
  it("never accepts spoken approval for consequential operations", () => {
    const permissions = ["ai.use", "sales.authorise"] as const;
    expect(() => assertVoiceExecutionAllowed(write, permissions, null, false)).toThrow(/On-screen/);
    expect(() => assertVoiceExecutionAllowed(write, permissions, { clicked: false, reauthenticated: true }, false)).toThrow(/On-screen/);
    expect(() => assertVoiceExecutionAllowed(write, permissions, { clicked: true, reauthenticated: false }, true)).toThrow(/Re-authentication/);
    expect(() => assertVoiceExecutionAllowed(write, permissions, { clicked: true, reauthenticated: true }, true)).not.toThrow();
  });
  it("requires confirmation for tier-one writes as well", () => {
    const draft = defineVoiceTool({
      name: "create_draft_invoice", description: "Create a draft", input: z.object({}),
      output: z.object({}), riskTier: 1, permission: "sales.draft",
      idempotency: "required", auditEventType: "ai.draft",
    });
    expect(() => assertVoiceExecutionAllowed(draft, ["ai.use", "sales.draft"], null, false)).toThrow(/On-screen/);
    expect(() => assertVoiceExecutionAllowed(draft, ["ai.use", "sales.draft"], { clicked: true, reauthenticated: false }, false)).not.toThrow();
  });
  it("rejects non-idempotent write descriptors", () => {
    expect(() => defineVoiceTool({
      name: "unsafe_write",
      description: "Unsafe",
      input: z.object({}),
      output: z.object({}),
      riskTier: 1,
      permission: "sales.draft",
      idempotency: "not_applicable",
      auditEventType: "ai.write",
    })).toThrow(/idempotency/);
  });
});
