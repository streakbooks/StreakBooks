import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import { validatePayrollPaymentAllocations } from "@/lib/payroll/payroll-payment-allocation";
import { payrollClearingCurrencyMismatch } from "@/lib/payroll/clearing-currency";
import { assertPayrollSettlementDateOnly } from "@/lib/payroll/payment-date";
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

export type PayrollPaymentAllocationRow = {
  id: string;
  company_id: string;
  payment_id: string;
  payslip_id: string;
  run_id: string;
  amount_minor: number;
};

export type PayrollPaymentDetailAllocation = {
  allocation: PayrollPaymentAllocationRow;
  payslip_number: string;
  employee_name: string;
  run_number: string;
};

export type PayrollPaymentDetailPage = {
  available: true;
  payment: PayrollPaymentRow;
  allocations: PayrollPaymentDetailAllocation[];
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

export const getPayrollPayment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; paymentId: string }) => ({
    companyId: companyIdOf(input),
    paymentId: input.paymentId,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const ok = await probePaymentsTable(context.supabase, data.companyId);
    if (!ok) throw new Error(PAYROLL_PAYMENTS_MIGRATION);

    const raw = await callRpc<unknown>(
      context.supabase,
      "get_payroll_payment",
      { _company_id: data.companyId, _payment_id: data.paymentId },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(raw);
    const paymentRaw = pick(payload, "payment");
    const allocsRaw = pick(payload, "allocations");
    const allocationRows = Array.isArray(allocsRaw)
      ? allocsRaw.map((item) => {
          const row = asRecord(item);
          const allocation = asRecord(pick(row, "allocation"));
          const employee = asRecord(pick(row, "employee"));
          const payslip = asRecord(pick(row, "payslip"));
          return {
            allocation: {
              id: str(pick(allocation, "id")),
              company_id: str(pick(allocation, "company_id")),
              payment_id: str(pick(allocation, "payment_id")),
              payslip_id: str(pick(allocation, "payslip_id")),
              run_id: str(pick(allocation, "run_id")),
              amount_minor: num(pick(allocation, "amount_minor")),
            },
            payslip_number: str(pick(payslip, "payslip_number")),
            employee_name:
              `${str(pick(employee, "first_name"))} ${str(pick(employee, "last_name"))}`.trim(),
            run_id: str(pick(allocation, "run_id")),
          };
        })
      : [];

    const runIds = [...new Set(allocationRows.map((a) => a.run_id).filter(Boolean))];
    const runNumberById = new Map<string, string>();
    if (runIds.length > 0) {
      const runRes = await context.supabase
        .from("payroll_runs" as never)
        .select("id, run_number" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, runIds as never);
      if (runRes.error) throw new Error(runRes.error.message);
      for (const row of runRes.data ?? []) {
        const r = row as { id: string; run_number: string };
        runNumberById.set(r.id, r.run_number);
      }
    }

    const allocations: PayrollPaymentDetailAllocation[] = allocationRows.map((row) => ({
      allocation: row.allocation,
      payslip_number: row.payslip_number,
      employee_name: row.employee_name,
      run_number: runNumberById.get(row.run_id) ?? "—",
    }));

    return {
      available: true as const,
      payment: normalisePayment(paymentRaw),
      allocations,
    } satisfies PayrollPaymentDetailPage;
  });

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
    assertPayrollSettlementDateOnly(data.paymentDate, "Payment");
    if (!Number.isSafeInteger(data.amountMinor) || data.amountMinor <= 0) {
      throw new Error("Payment amount must be a positive whole number of minor units.");
    }
    for (const a of data.allocations) {
      if (!Number.isSafeInteger(a.amountMinor) || a.amountMinor <= 0) {
        throw new Error("Allocation amounts must be positive whole minor units.");
      }
    }

    // The existing payroll payment RPC posts journals at FX rate 1.
    // Until currency conversion is implemented, reject any settlement whose
    // currency does not match the organisation's base currency.
    const companyRes = await context.supabase
      .from("companies" as never)
      .select("base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .single();
    if (companyRes.error) throw new Error(companyRes.error.message);
    const baseCurrency = String(
      (companyRes.data as { base_currency?: string } | null)?.base_currency ?? "",
    ).toUpperCase();

    const settingsRes = await context.supabase
      .from("payroll_settings" as never)
      .select("payroll_currency" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (settingsRes.error) throw new Error(settingsRes.error.message);
    const settingsCurrency = String(
      (settingsRes.data as { payroll_currency?: string } | null)?.payroll_currency ?? "",
    ).toUpperCase();
    if (!settingsCurrency) throw new Error("Configure payroll settings before recording payment.");
    const postingCurrency = (data.currencyCode ?? settingsCurrency).toUpperCase();
    if (postingCurrency !== settingsCurrency) {
      throw new Error("Payment currency must match the payroll settings currency.");
    }
    if (!baseCurrency || postingCurrency !== baseCurrency) {
      throw new Error(
        "Non-base-currency payroll payments are not yet supported by the FX journal workflow.",
      );
    }

    // Prevent crediting a foreign-currency bank at FX=1. The SQL trigger
    // enforces the same invariant inside record_payroll_payment for direct RPCs.
    const clearingRes = await context.supabase
      .from("accounts" as never)
      .select("id, currency_code" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.clearingAccountId as never)
      .maybeSingle();
    if (clearingRes.error) throw new Error(clearingRes.error.message);
    if (!clearingRes.data) throw new Error("Clearing account not found for this organisation.");

    const linkedRes = await context.supabase
      .from("bank_accounts" as never)
      .select("currency_code" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("gl_account_id" as never, data.clearingAccountId as never)
      .eq("is_active" as never, true as never);
    if (linkedRes.error) throw new Error(linkedRes.error.message);
    const mismatch = payrollClearingCurrencyMismatch(
      postingCurrency,
      (clearingRes.data as { currency_code: string | null }).currency_code,
      (linkedRes.data ?? []).map(
        (bank) => (bank as { currency_code: string | null }).currency_code,
      ),
    );
    if (mismatch) throw new Error(mismatch);

    const paymentAmountMinor = BigInt(data.amountMinor);
    const allocationInputs = data.allocations.map((a) => ({
      payslipId: a.payslipId,
      amountMinor: BigInt(a.amountMinor),
    }));

    if (allocationInputs.length > 0) {
      const ids = data.allocations.map((a) => a.payslipId);
      const slipRes = await context.supabase
        .from("payroll_payslips" as never)
        .select("id, amount_paid_minor, run_employee_id, run_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, ids as never);
      if (slipRes.error) throw new Error(slipRes.error.message);

      const runIds = [...new Set(
        (slipRes.data ?? []).map((row) => (row as { run_id: string }).run_id),
      )];
      const runRes = await context.supabase
        .from("payroll_runs" as never)
        .select("id, currency" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, runIds as never);
      if (runRes.error) throw new Error(runRes.error.message);
      const runCurrencies = new Map(
        (runRes.data ?? []).map((row) => {
          const item = row as { id: string; currency: string };
          return [item.id, item.currency.toUpperCase()] as const;
        }),
      );
      for (const item of slipRes.data ?? []) {
        const slip = item as { run_id: string };
        if (runCurrencies.get(slip.run_id) !== postingCurrency) {
          throw new Error("Payslip payroll currency differs from settlement currency.");
        }
      }

      const runEmpIds = (slipRes.data ?? []).map(
        (row) => (row as { run_employee_id: string }).run_employee_id,
      );
      const reRes = await context.supabase
        .from("payroll_run_employees" as never)
        .select("id, net_minor" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, runEmpIds as never);
      if (reRes.error) throw new Error(reRes.error.message);
      const netByRunEmp = new Map(
        (reRes.data ?? []).map((row) => {
          const r = row as { id: string; net_minor: number };
          return [r.id, BigInt(r.net_minor)] as const;
        }),
      );

      const payslipsForValidation = (slipRes.data ?? []).map((row) => {
        const r = row as { id: string; amount_paid_minor: number; run_employee_id: string };
        return {
          payslipId: r.id,
          netMinor: netByRunEmp.get(r.run_employee_id) ?? 0n,
          paidMinor: BigInt(r.amount_paid_minor),
        };
      });

      const validated = validatePayrollPaymentAllocations(
        paymentAmountMinor,
        allocationInputs,
        payslipsForValidation,
      );
      if (!validated.ok) throw new Error(validated.error);
    } else {
      const validated = validatePayrollPaymentAllocations(paymentAmountMinor, [], []);
      if (!validated.ok) throw new Error(validated.error);
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

export const reversePayrollRunAccrual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; runId: string; reversalDate: string }) => ({
    companyId: companyIdOf(input),
    runId: input.runId,
    reversalDate: input.reversalDate.trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.run.post");
    assertPayrollSettlementDateOnly(data.reversalDate, "Reversal");
    const saved = await callRpc<unknown>(
      context.supabase,
      "reverse_payroll_run_accrual",
      {
        _company_id: data.companyId,
        _run_id: data.runId,
        _reversal_date: data.reversalDate,
      },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(saved);
    const run = asRecord(pick(payload, "run"));
    return {
      runId: str(pick(run, "id")),
      status: str(pick(run, "status")),
      reversalJournalId: strOrNull(pick(payload, "reversal_journal_id")),
    };
  });

export const reversePayrollPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; paymentId: string; reversalDate: string }) => ({
    companyId: companyIdOf(input),
    paymentId: input.paymentId,
    reversalDate: input.reversalDate.trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.pay");
    assertPayrollSettlementDateOnly(data.reversalDate, "Reversal");
    const saved = await callRpc<unknown>(
      context.supabase,
      "reverse_payroll_payment",
      {
        _company_id: data.companyId,
        _payment_id: data.paymentId,
        _reversal_date: data.reversalDate,
      },
      PAYROLL_PAYMENTS_MIGRATION,
    );
    const payload = asRecord(saved);
    return {
      paymentId: str(pick(payload, "payment_id")),
      reversalJournalId: strOrNull(pick(payload, "reversal_journal_id")),
    };
  });
