import { z } from "zod";
import { assertUuid } from "@/lib/company-validation";
import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";
import { normaliseMoneyInput } from "@/lib/purchases/money-input";

const id = z.string().uuid();
const minor = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const session = z.object({
  id,
  register_id: id,
  opened_by: id.nullable(),
  opened_at: z.string(),
  opening_float_minor: minor,
  expected_cash_minor: minor,
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  closed_at: z.string().nullable(),
  closing_count_minor: minor.nullable(),
});
export const posWorkspaceSchema = z.object({
  userId: z.string().uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  registers: z
    .array(
      z.object({
        id,
        code: z.string(),
        name: z.string(),
        location_id: id,
        cash_account_id: id,
        is_active: z.boolean(),
        location_name: z.string(),
      }),
    )
    .max(100),
  openSessions: z.array(session).max(100),
  recentSessions: z.array(session).max(50),
  locations: z.array(z.object({ id, name: z.string(), code: z.string() })).max(100),
  cashAccounts: z.array(z.object({ id, name: z.string(), code: z.string() })).max(500),
  members: z
    .array(z.object({ id: z.string().uuid(), name: z.string(), email: z.string().nullable() }))
    .max(100),
  locationAccess: z
    .array(z.object({ location_id: z.string().uuid(), user_id: z.string().uuid() }))
    .max(1000),
  canManage: z.boolean(),
  canOpen: z.boolean(),
  canClose: z.boolean(),
  canSell: z.boolean(),
  canAdjustCash: z.boolean(),
  canRefund: z.boolean(),
});
export type PosWorkspace = z.infer<typeof posWorkspaceSchema>;
export type PosSession = z.infer<typeof session>;
export function parsePosMinor(value: unknown): string {
  const result = minor.safeParse(value);
  if (!result.success)
    throw new Error("Amount must be a non-negative integer string within database limits");
  return result.data;
}
/** Opening/closing physical counts cannot silently round an extra currency decimal. */
export function posCountFromDisplay(raw: string, currency: string): string {
  const normalized = normaliseMoneyInput(raw);
  if (
    !normalized ||
    normalized.startsWith("-") ||
    (normalized.split(".")[1]?.length ?? 0) > decimalPlacesFor(currency)
  ) {
    throw new Error("Enter a non-negative amount with the company's currency precision");
  }
  return parsePosMinor(toMinorUnits(normalized, currency).toString());
}
export type PosCreateRegisterInput = {
  companyId: string;
  registerId: string;
  locationId: string;
  cashAccountId: string;
  code: string;
  name: string;
};
export function parseCreatePosRegister(input: PosCreateRegisterInput): PosCreateRegisterInput {
  const code = typeof input?.code === "string" ? input.code.trim().toUpperCase() : "";
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(code) || name.length < 1 || name.length > 120)
    throw new Error("Enter a register code (1–40 letters/digits) and name (1–120 characters)");
  return {
    companyId: assertUuid(input.companyId),
    registerId: assertUuid(input.registerId, "register"),
    locationId: assertUuid(input.locationId, "location"),
    cashAccountId: assertUuid(input.cashAccountId, "cash account"),
    code,
    name,
  };
}
export type PosSessionCommand = {
  companyId: string;
  targetId: string;
  operationId: string;
  amountMinor: string;
};
export function parsePosSessionCommand(input: PosSessionCommand): PosSessionCommand {
  return {
    companyId: assertUuid(input?.companyId),
    targetId: assertUuid(input.targetId, "register/session"),
    operationId: assertUuid(input.operationId, "operation"),
    amountMinor: parsePosMinor(input.amountMinor),
  };
}
export type PosLocationAccessInput = {
  companyId: string;
  locationId: string;
  userId: string;
  allowed: boolean;
};
export function parsePosLocationAccess(input: PosLocationAccessInput): PosLocationAccessInput {
  if (typeof input?.allowed !== "boolean") throw new Error("Choose grant or revoke");
  return {
    companyId: assertUuid(input.companyId),
    locationId: assertUuid(input.locationId, "location"),
    userId: assertUuid(input.userId, "member"),
    allowed: input.allowed,
  };
}
