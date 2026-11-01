import { z } from "zod";
export const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a real calendar date");
const minor = z
  .string()
  .regex(/^\d{1,19}$/)
  .refine(
    (value) => /^\d{1,19}$/.test(value) && BigInt(value) <= 9223372036854775807n,
    "Amount exceeds the ledger range",
  );
export const correctionSelection = z
  .array(
    z.object({ id: z.string().uuid(), fingerprint: z.string().regex(/^[a-f0-9]{32}$/) }).strict(),
  )
  .min(1)
  .max(100)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    "A line can only be selected once",
  );
export const correctionInput = z
  .object({
    companyId: z.string().uuid(),
    items: correctionSelection,
    targetId: z.string().uuid(),
    mode: z.enum(["original", "adjustment"]),
    date: realDate.nullable(),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict()
  .refine(
    (v) => (v.mode === "original" ? v.date === null : v.date !== null),
    "Choose the date for this correction policy",
  );
export type CorrectionInput = z.infer<typeof correctionInput>;
export type ApplyInput = CorrectionInput & { requestKey: string; previewHash: string };
export const correctionFilter = z
  .object({
    from: realDate,
    to: realDate,
    account_id: z.string().uuid().nullable().default(null),
    source_type: z.string().max(50).default(""),
    query: z.string().trim().max(200).default(""),
    min_minor: minor.nullable().default(null),
    max_minor: minor.nullable().default(null),
    page: z.number().int().min(0).max(100000).default(0),
  })
  .refine(
    (f) =>
      f.from <= f.to && new Date(f.to).getTime() - new Date(f.from).getTime() <= 3660 * 86400000,
    "Choose an ordered date range of at most ten years",
  )
  .refine(
    (f) =>
      f.min_minor === null ||
      f.max_minor === null ||
      (/^\d{1,19}$/.test(f.min_minor) &&
        /^\d{1,19}$/.test(f.max_minor) &&
        BigInt(f.min_minor) <= BigInt(f.max_minor)),
    "Minimum amount exceeds maximum",
  );
export type CorrectionFilter = z.infer<typeof correctionFilter>;
export type CorrectionSetup = {
  currency: string;
  decimals: number;
  can_apply: boolean;
  can_export: boolean;
  accounts: Array<{ id: string; code: string; name: string; type: string; eligible: boolean }>;
};
export type CorrectionLine = {
  id: string;
  journal_id: string;
  journal_date: string;
  journal_number: string;
  source_type: string;
  source_id: string | null;
  source_reference: string;
  contact_name: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  currency: string;
  currency_decimals: number;
  base_gross_minor: string;
  description: string | null;
  memo: string | null;
  debit_minor: string;
  credit_minor: string;
  fingerprint: string;
  blocked_reason: string | null;
};
export type CorrectionSearch = { rows: CorrectionLine[]; has_more: boolean; page: number };
export type CorrectionPlanRow = {
  id: string;
  journal_id: string;
  journal_number: string;
  journal_date: string;
  source_type: string;
  source_reference: string;
  contact_name: string | null;
  source_account_id: string;
  source_account_code: string;
  source_account_name: string;
  description: string | null;
  memo: string | null;
  debit_minor: string;
  credit_minor: string;
  posting_date: string;
  fingerprint: string;
};
export type CorrectionPlan = {
  company_id: string;
  currency: string;
  rows: CorrectionPlanRow[];
  gross_minor: string;
  line_count: number;
  journal_count: number;
  date_mode: "original" | "adjustment";
  adjustment_date: string | null;
  reason: string;
  target: { id: string; code: string; name: string; updated_at: string };
  preview_hash: string;
};
export type CorrectionBatch = {
  id: string;
  company_id: string;
  request_key: string;
  reason: string;
  date_mode: "original" | "adjustment";
  adjustment_date: string | null;
  plan: Omit<CorrectionPlan, "preview_hash">;
  journal_ids: string[];
  status: "applied" | "undone";
  created_by: string;
  created_at: string;
  undo_date: string | null;
  undo_reason: string | null;
  undone_by: string | null;
  undone_at: string | null;
  undo_journal_ids: string[] | null;
};
export function decimalFilterToMinor(value: string, decimals: number): string | null {
  if (!value.trim()) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)
    throw new Error("Unsupported currency precision");
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text))
    throw new Error("Amount filters must be non-negative decimal numbers");
  const [whole, frac = ""] = text.split(".");
  if (frac.length > decimals) throw new Error(`Amounts support at most ${decimals} decimal places`);
  const n = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (n > 9223372036854775807n) throw new Error("Amount filter exceeds the ledger range");
  return n.toString();
}
export function exactMoney(minor: string | bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)
    throw new Error("Unsupported currency precision");
  const n = BigInt(minor),
    a = n < 0n ? -n : n,
    scale = 10n ** BigInt(decimals);
  return `${n < 0n ? "-" : ""}${a / scale}${decimals ? "." + (a % scale).toString().padStart(decimals, "0") : ""}`;
}
export function grossSelection(
  rows: Pick<CorrectionLine, "debit_minor" | "credit_minor">[],
): bigint {
  return rows.reduce((sum, r) => sum + BigInt(r.debit_minor) + BigInt(r.credit_minor), 0n);
}
