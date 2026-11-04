import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "./practice-work";
import type { AccountWorkpaper } from "./workpapers";

const listInput = z.object({
  companyId: z.string().uuid(),
  asOf: isoDate,
});

const minorString = z
  .string()
  .regex(/^-?\d+$/, "Enter an integer amount in minor units")
  .refine((value) => {
    const n = BigInt(value);
    return n >= -9007199254740991n && n <= 9007199254740991n;
  }, "Amount exceeds the safe workpaper range");

const saveInput = z.object({
  companyId: z.string().uuid(),
  payload: z
    .object({
      action: z.enum(["save", "prepare", "review", "reopen"]),
      id: z.string().uuid().optional(),
      version: z.number().int().positive().optional(),
      accountId: z.string().uuid(),
      asOf: isoDate,
      ledgerBalanceMinor: minorString,
      supportingBalanceMinor: minorString.nullable().optional(),
      evidenceReference: z.string().max(300).optional(),
      note: z.string().max(4000).optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (Boolean(value.id) !== Boolean(value.version)) {
        ctx.addIssue({
          code: "custom",
          message: "An existing workpaper requires its ID and version",
        });
      }
    }),
});

/** Raw posted-ledger balances, not the financial-statement trial balance's
 * synthetic retained-earnings presentation. This matches the sign-off RPC. */
export const listWorkpaperLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const [accounts, balances] = await Promise.all([
      context.supabase
        .from("accounts")
        .select("id,code,name,account_type,is_postable")
        .eq("company_id", data.companyId)
        .eq("is_postable", true)
        .in("account_type", ["asset", "liability", "equity"])
        .order("code")
        .limit(5001),
      context.supabase.rpc(
        "ledger_balances" as never,
        {
          _company_id: data.companyId,
          _from: null,
          _to: data.asOf,
          _exclude_year_end_close: false,
        } as never,
      ),
    ]);
    if (accounts.error) throw new Error(accounts.error.message);
    if (balances.error) throw new Error(balances.error.message);
    if ((accounts.data ?? []).length > 5000) {
      throw new Error("Workpaper portfolio exceeds the current account review limit.");
    }
    const amounts = new Map(
      (
        (balances.data ?? []) as Array<{
          account_id: string;
          debit_minor: number;
          credit_minor: number;
        }>
      ).map((row) => [row.account_id, row]),
    );
    return {
      rows: (accounts.data ?? []).map((account) => {
        const balance = amounts.get(account.id);
        return {
          account_id: account.id,
          code: account.code,
          name: account.name,
          account_type: account.account_type,
          debit_minor: balance?.debit_minor ?? 0,
          credit_minor: balance?.credit_minor ?? 0,
        };
      }),
    };
  });

export const listAccountWorkpapers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }): Promise<AccountWorkpaper[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: records, error } = await context.supabase
      .from("account_workpapers" as never)
      .select(
        "id,company_id,account_id,as_of,gl_balance_minor,supporting_balance_minor,evidence_reference,note,status,prepared_by,reviewed_by,prepared_at,reviewed_at,version" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("as_of" as never, data.asOf as never)
      .order("account_id" as never);
    if (error) {
      throw new Error(
        error.message.includes("account_workpapers")
          ? "Account workpapers require the latest database migration."
          : error.message,
      );
    }
    return (records ?? []) as AccountWorkpaper[];
  });

export const saveAccountWorkpaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const { data: record, error } = await context.supabase.rpc(
      "save_account_workpaper" as never,
      {
        _company_id: data.companyId,
        _payload: data.payload,
      } as never,
    );
    if (error) throw new Error(error.message);
    return record as { id: string; status: string; version: number };
  });
