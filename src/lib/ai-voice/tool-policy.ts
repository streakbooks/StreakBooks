import { z } from "zod";
import type { Permission } from "@/lib/permissions";

export const VoiceRiskTier = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type VoiceRiskTier = z.infer<typeof VoiceRiskTier>;

export type VoiceToolDefinition<I extends z.ZodTypeAny, O extends z.ZodTypeAny> = {
  name: string;
  description: string;
  input: I;
  output: O;
  riskTier: VoiceRiskTier;
  permission: Permission;
  idempotency: "not_applicable" | "required";
  auditEventType: string;
};

/** Tool descriptors are immutable policy, not model-provided permissions. */
export function defineVoiceTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  definition: VoiceToolDefinition<I, O>,
): Readonly<VoiceToolDefinition<I, O>> {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(definition.name)) throw new Error("Invalid voice tool name");
  if (!/^[a-z][a-z0-9_.]{2,99}$/.test(definition.auditEventType)) throw new Error("Invalid audit event");
  if (definition.riskTier !== 0 && definition.idempotency !== "required") {
    throw new Error("Write tools must require idempotency");
  }
  if (definition.riskTier === 0 && definition.idempotency !== "not_applicable") {
    throw new Error("Read-only tools must not declare mutation idempotency");
  }
  return Object.freeze(definition);
}

export function assertVoiceExecutionAllowed(
  tool: Pick<VoiceToolDefinition<z.ZodTypeAny, z.ZodTypeAny>, "riskTier" | "permission">,
  grantedPermissions: readonly Permission[],
  confirmation: { clicked: boolean; reauthenticated: boolean } | null,
  requiresStepUp: boolean,
): void {
  if (!grantedPermissions.includes("ai.use") || !grantedPermissions.includes(tool.permission)) {
    throw new Error("Permission denied for this voice action");
  }
  if (tool.riskTier === 2 && !confirmation?.clicked) {
    throw new Error("On-screen confirmation is required");
  }
  if (tool.riskTier === 2 && requiresStepUp && !confirmation?.reauthenticated) {
    throw new Error("Re-authentication is required");
  }
}
