import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import type { PayrollPaymentMethod } from "@/lib/payroll/types";
import { PAYROLL_RUNS_MIGRATION } from "@/lib/payroll/runs.functions";

export const PAYROLL_PAYMENTS_MIGRATION =
  "Basic Global Payroll payments are not available yet: the database update 20261105180000 has not been applied.";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pick(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return str(value);
}

export type PayrollPaymentRow = {
  id: string;
  company_id: string;
  payment_date: string;
  payment_method: PayrollPaymentMethod | "manual";
  amount_minor: number;
  unallocated_minor: number;
  currency: string;
  reference: string | null;
  memo: string | null;
  clearing_account_id: string;
  journal_id: string | null;
  status: "posted" | "reversed";
  created_at: string;
};

export type PayrollBankExportRow = {
  run_number: string;
  payslip_number: string;
  employee_number: string;
  employee_name: string;
  payment_date: string;
  currency: string;
  amount_minor: number;
  account_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  sort_code: string | null;
  iban: string | null;
  bic: string | null;
  reference: string;
};

export type PayrollRunJournalLine = {
  account_code: string;
  account_name: string;
  debit_minor: number;
  credit_minor: number;
  description: string | null;
};

export type PayrollRunJournalSummary = {
  id: string;
  journal_number: number;
  journal_date: string;
  memo: string | null;
  source_type: string;
  lines: PayrollRunJournalLine[];
};

function normalisePayment(raw: unknown): PayrollPaymentRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    payment_date: str(pick(row, "payment_date")),
    payment_method: str(pick(row, "payment_method")) as PayrollPaymentRow["payment_method"],
    amount_minor: num(pick(row, "amount_minor")),
    unallocated_minor: num(pick(row, "unallocated_minor")),
    currency: str(pick(row, "currency")),
    reference: strOrNull(pick(row, "reference")),
    memo: strOrNull(pick(row, "memo")),
    clearing_account_id: str(pick(row, "clearing_account_id")),
    journal_id: strOrNull(pick(row, "journal_id")),
    status: str(pick(row, "status")) as PayrollPaymentRow["status"],
    created_at: str(pick(row, "created_at")),
  };
}

async function probePaymentsTable(
  supabase: Parameters<typeof assertCompanyMember>[0],
  companyId: string,
): Promise<boolean> {
  const probe = await supabase
    .from("payroll_payments" as never)
    .select("id" as never)
    .eq("company_id" as never, companyId as never)
    .limit(1);
  if (probe.error && isMissingRelation(probe.error)) return false;
  if (probe.error) throw new Error(probe.error.message);
  return true;
}

export const listPayrollPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId?: string | null }) => ({
    companyId: companyIdOf(input),
    runId: input.runId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const ok = await probePaymentsTable(context.supabase, data.companyId);
    if (!ok) {
      return {
        available: false as const,
        payments: [] as PayrollPaymentRow[],
        migrationMessage: PAYROLL_PAYMENTS_MIGRATION,
      };
    }

    const raw = await callRpc<unknown>(
      context.supabase,
      "list_payroll_payments",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(raw);
    const items = pick(payload, "payments");
    return {
      available: true as const,
      payments: Array.isArray(items) ? items.map(normalisePayment) : [],
      migrationMessage: null as string | null,
    };
  });

export const recordPayrollPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      paymentDate: string;
      paymentMethod: string;
      amountMinor: number;
      clearingAccountId: string;
      currencyCode?: string;
      reference?: string;
      memo?: string;
      idempotencyKey?: string;
      allocations: Array<{ payslipId: string; amountMinor: number }>;
    }) => ({
      companyId: companyIdOf(input),
      paymentDate: input.paymentDate.trim(),
      paymentMethod: input.paymentMethod.trim(),
      amountMinor: Number(input.amountMinor),
      clearingAccountId: input.clearingAccountId,
      currencyCode: input.currencyCode?.trim().toUpperCase(),
      reference: input.reference?.trim() || undefined,
      memo: input.memo?.trim() || undefined,
      idempotencyKey: input.idempotencyKey?.trim() || undefined,
      allocations: input.allocations ?? [],
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.pay");
    if (!Number.isInteger(data.amountMinor) || data.amountMinor <= 0) {
      throw new Error("Payment amount must be a positive whole number of minor units.");
    }
    for (const a of data.allocations) {
      if (!Number.isInteger(a.amountMinor) || a.amountMinor <= 0) {
        throw new Error("Allocation amounts must be positive whole minor units.");
      }
    }

    const result = await callRpc<unknown>(
      context.supabase,
      "record_payroll_payment",
      {
        company_id: data.companyId,
        payment_date: data.paymentDate,
        payment_method: data.paymentMethod,
        amount_minor: data.amountMinor,
        clearing_account_id: data.clearingAccountId,
        currency_code: data.currencyCode,
        reference: data.reference,
        memo: data.memo,
        idempotency_key: data.idempotencyKey,
        allocations: data.allocations.map((a) => ({
          payslip_id: a.payslipId,
          amount_minor: a.amountMinor,
        })),
      },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const row = asRecord(result);
    return {
      payment_id: str(pick(row, "payment_id")),
      journal_id: strOrNull(pick(row, "journal_id")),
      unallocated_minor: num(pick(row, "unallocated_minor")),
      replayed: Boolean(pick(row, "replayed")),
    };
  });

export const exportPayrollBankCsvRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId?: string | null }) => ({
    companyId: companyIdOf(input),
    runId: input.runId?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.pay");
    const ok = await probePaymentsTable(context.supabase, data.companyId);
    if (!ok) throw new Error(PAYROLL_PAYMENTS_MIGRATION);

    const raw = await callRpc<unknown>(
      context.supabase,
      "export_payroll_bank_csv_rows",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(raw);
    const rows = pick(payload, "rows");
    return {
      format: str(pick(payload, "format") || "generic_csv"),
      disclaimer: str(pick(payload, "disclaimer")),
      rows: Array.isArray(rows)
        ? rows.map((item) => {
            const row = asRecord(item);
            return {
              run_number: str(pick(row, "run_number")),
              payslip_number: str(pick(row, "payslip_number")),
              employee_number: str(pick(row, "employee_number")),
              employee_name: str(pick(row, "employee_name")),
              payment_date: str(pick(row, "payment_date")),
              currency: str(pick(row, "currency")),
              amount_minor: num(pick(row, "amount_minor")),
              account_name: strOrNull(pick(row, "account_name")),
              bank_name: strOrNull(pick(row, "bank_name")),
              account_number: strOrNull(pick(row, "account_number")),
              sort_code: strOrNull(pick(row, "sort_code")),
              iban: strOrNull(pick(row, "iban")),
              bic: strOrNull(pick(row, "bic")),
              reference: str(pick(row, "reference")),
            } satisfies PayrollBankExportRow;
          })
        : [],
    };
  });

export const listPayrollRunJournals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const ok = await probePaymentsTable(context.supabase, data.companyId);
    if (!ok) throw new Error(PAYROLL_PAYMENTS_MIGRATION);

    const raw = await callRpc<unknown>(
      context.supabase,
      "list_payroll_run_journals",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(raw);
    const journals = pick(payload, "journals");
    if (!Array.isArray(journals)) return { journals: [] as PayrollRunJournalSummary[] };

    return {
      journals: journals.map((item) => {
        const bundle = asRecord(item);
        const journal = asRecord(pick(bundle, "journal"));
        const linesRaw = pick(bundle, "lines");
        const lines = Array.isArray(linesRaw)
          ? linesRaw.map((lineItem) => {
              const lr = asRecord(lineItem);
              const line = asRecord(pick(lr, "line"));
              return {
                account_code: str(pick(lr, "account_code")),
                account_name: str(pick(lr, "account_name")),
                debit_minor: num(pick(line, "debit_minor")),
                credit_minor: num(pick(line, "credit_minor")),
                description: strOrNull(pick(line, "description")),
              } satisfies PayrollRunJournalLine;
            })
          : [];
        return {
          id: str(pick(journal, "id")),
          journal_number: num(pick(journal, "journal_number")),
          journal_date: str(pick(journal, "journal_date")),
          memo: strOrNull(pick(journal, "memo")),
          source_type: str(pick(journal, "source_type")),
          lines,
        } satisfies PayrollRunJournalSummary;
      }),
    };
  });

export const postPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.post");
    const saved = await callRpc<unknown>(
      context.supabase,
      "post_payroll_run",
      { _company_id: data.companyId, _run_id: data.runId },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const row = asRecord(saved);
    return { id: str(pick(row, "id")), status: str(pick(row, "status")) };
  });
