import { z } from "zod";
import { UUID_RE } from "@/lib/company-validation";
import { isIsoDate } from "@/lib/accounting/conversion-balances";

const uuid = z.string().regex(UUID_RE, "Choose a valid record");
const date = z.string().refine(isIsoDate, "Choose a valid date");
const money = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Enter an exact amount in minor units")
  .refine((v) => BigInt(v) <= 9223372036854775807n, "Amount is too large");
const positiveMoney = money.refine((v) => BigInt(v) > 0n, "Enter a positive amount");
const signedMoney = z
  .string()
  .regex(/^-?(0|[1-9]\d*)$/)
  .refine((v) => BigInt(v) >= -9223372036854775808n && BigInt(v) <= 9223372036854775807n);
const evidence = {
  evidence_reference: z.string().trim().min(3).max(500),
  policy_note: z.string().trim().min(10).max(4000),
  user_confirmed: z.literal(true, { error: "Confirm that you verified the supporting records" }),
};
export const CASH_POLICY_KINDS = [
  "balance_sheet",
  "conversion",
  "inventory",
  "prepaid",
  "deferred",
  "payroll_wages",
  "payroll_employer_tax",
  "payroll_deductions",
] as const;
export const cashPolicyInput = z.object({
  companyId: uuid,
  payload: z
    .object({
      ...evidence,
      kind: z.enum(CASH_POLICY_KINDS),
      source_account_id: uuid,
      recognition_account_id: uuid,
      equity_account_id: uuid.nullable().default(null),
      effective_from: date,
      effective_to: date.nullable().default(null),
      evidence_journal_ids: z.array(uuid).min(1).max(100),
      supersedes_id: uuid.nullable().default(null),
    })
    .superRefine((v, ctx) => {
      if (v.source_account_id === v.recognition_account_id && v.kind !== "balance_sheet")
        ctx.addIssue({
          code: "custom",
          message: "Choose different source and recognition accounts",
        });
      if (v.effective_to && v.effective_to < v.effective_from)
        ctx.addIssue({ code: "custom", message: "The end date must follow the effective date" });
      if (new Set(v.evidence_journal_ids).size !== v.evidence_journal_ids.length)
        ctx.addIssue({ code: "custom", message: "Select each supporting journal once" });
    }),
});
export type CashPolicyInput = z.input<typeof cashPolicyInput>;
export const cashOpeningInput = z.object({
  companyId: uuid,
  payload: z
    .object({
      ...evidence,
      source_kind: z.enum(["sales_invoice", "purchase_bill"]),
      document_id: uuid,
      posted_journal_id: uuid,
      control_account_id: uuid,
      equity_account_id: uuid,
      currency_code: z.string().regex(/^[A-Z]{3}$/),
      gross_minor: positiveMoney,
      components: z
        .array(z.object({ account_id: uuid, amount_minor: positiveMoney }))
        .min(1)
        .max(100),
      tax_lines: z
        .array(
          z.object({
            id: z.string().min(1).max(100),
            net_minor: money,
            tax_minor: money,
            tax_code_id: uuid,
          }),
        )
        .max(100)
        .default([]),
      mode: z.enum(["recognize_on_settlement", "already_recognized"]),
      effective_from: date,
      supersedes_id: uuid.nullable().default(null),
    })
    .superRefine((v, ctx) => {
      if (
        v.tax_lines.length &&
        v.tax_lines.reduce(
          (sum, line) => sum + BigInt(line.net_minor) + BigInt(line.tax_minor),
          0n,
        ) !== BigInt(v.gross_minor)
      )
        ctx.addIssue({
          code: "custom",
          message: "Verified tax lines must reconcile to the opening document gross",
        });
      if (v.control_account_id === v.equity_account_id)
        ctx.addIssue({
          code: "custom",
          message: "Choose different control and opening equity accounts",
        });
      if (new Set(v.components.map((c) => c.account_id)).size !== v.components.length)
        ctx.addIssue({ code: "custom", message: "Combine components for the same account" });
      if (v.components.reduce((s, c) => s + BigInt(c.amount_minor), 0n) !== BigInt(v.gross_minor))
        ctx.addIssue({
          code: "custom",
          message: "Verified components must equal the opening document total",
        });
    }),
});
export type CashOpeningInput = z.input<typeof cashOpeningInput>;
export const cashInventoryInput = z.object({
  companyId: uuid,
  payload: z
    .object({
      ...evidence,
      purchase_document_id: uuid,
      purchase_journal_id: uuid,
      inventory_account_id: uuid,
      movement_journal_id: uuid,
      movement_kind: z.enum(["sale", "customer_return", "supplier_return"]),
      cost_minor: positiveMoney,
      reverses_evidence_id: uuid.nullable().default(null),
      supersedes_id: uuid.nullable().default(null),
    })
    .superRefine((v, ctx) => {
      if (v.movement_kind === "customer_return" && !v.reverses_evidence_id)
        ctx.addIssue({
          code: "custom",
          message: "Select the original approved sale cost for this return",
        });
      if (v.movement_kind !== "customer_return" && v.reverses_evidence_id)
        ctx.addIssue({
          code: "custom",
          message: "Only customer returns reverse an approved sale cost",
        });
    }),
});
export type CashInventoryInput = z.input<typeof cashInventoryInput>;
export const cashExceptionInput = z
  .object({
    companyId: uuid,
    exception: z.object({
      companyId: uuid,
      code: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      message: z.string().min(1).max(4000),
      sourceAccountId: uuid.nullable(),
      journalId: uuid.nullable(),
      documentId: uuid.nullable(),
      amountMinor: signedMoney,
      currency: z.string().regex(/^[A-Z]{3}$/),
      date,
      period: z.object({ from: date, to: date }),
      missingEvidence: z.array(z.string().min(1).max(1000)).min(1).max(20),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.companyId !== v.exception.companyId)
      ctx.addIssue({
        code: "custom",
        message: "The exception belongs to a different organisation",
      });
    if (v.exception.period.from > v.exception.period.to)
      ctx.addIssue({ code: "custom", message: "Choose a valid reporting period" });
    if (!v.exception.sourceAccountId && !v.exception.journalId && !v.exception.documentId)
      ctx.addIssue({ code: "custom", message: "The exception must identify its source record" });
  });
export type CashExceptionInput = z.input<typeof cashExceptionInput>;
export const cashResolveInput = z.object({
  companyId: uuid,
  exceptionId: uuid,
  resolutionKind: z.enum(["policy", "opening", "inventory"]),
  resolutionId: uuid,
  reviewNote: z.string().trim().min(10).max(4000),
});
export type CashResolveInput = z.input<typeof cashResolveInput>;
