import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { loadAccountMetas, loadCompanyMeta, type Sb } from "@/lib/accounting/ledger-data";
import { callRpc, companyIdOf, isMissingRelation, num } from "@/lib/planning/rpc";
import {
  BASIC_PAYROLL_DISCLAIMER,
  type PayrollComponentTypeRow,
  type PayrollDocumentSequenceRow,
  type PayrollPayScheduleRow,
  type PayrollSettingsPage,
  type PayrollSettingsRow,
} from "@/lib/payroll/types";
import {
  suggestPayrollGlAccounts,
  type PayrollGlAccountSuggestions,
} from "@/lib/payroll/account-suggestions";
import {
  assertPaymentMethod,
  assertRoundingMode,
  parseComponentDraft,
  parsePayScheduleDraft,
  parsePayrollSettingsDraft,
  type ComponentDraft,
  type PayScheduleDraft,
  type PayrollSettingsDraft,
} from "@/lib/payroll/settings-draft";

export type PayrollSetupCounts = {
  activeEmployees: number;
  payrollRuns: number;
};

export const PAYROLL_MIGRATION =
  "Basic Global Payroll is not available yet: the database updates 20261105153211 and 20261105153212 have not been applied.";

type AccountOption = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  is_postable: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pick(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadPayrollSetupCounts(sb: Sb, companyId: string): Promise<PayrollSetupCounts> {
  const [employees, runs] = await Promise.all([
    sb
      .from("payroll_employees" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, companyId as never)
      .eq("status" as never, "active" as never),
    sb
      .from("payroll_runs" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, companyId as never),
  ]);
  if (employees.error && !isMissingRelation(employees.error)) {
    throw new Error(employees.error.message);
  }
  if (runs.error && !isMissingRelation(runs.error)) {
    throw new Error(runs.error.message);
  }
  return {
    activeEmployees: employees.count ?? 0,
    payrollRuns: runs.count ?? 0,
  };
}

async function ensureDefaultPayScheduleIfEmpty(
  supabase: Parameters<typeof callRpc>[0],
  sb: Sb,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: schedules, error } = await sb
    .from("payroll_pay_schedules" as never)
    .select("id, is_active" as never)
    .eq("company_id" as never, companyId as never);
  if (error) {
    if (isMissingRelation(error)) return;
    throw new Error(error.message);
  }
  const activeCount = (schedules ?? []).filter((row) => {
    const r = row as { is_active?: boolean };
    return r.is_active !== false;
  }).length;
  if (activeCount > 0) return;

  const anchorRaw = payload["payroll_start_date"];
  const anchor =
    typeof anchorRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw)
      ? anchorRaw
      : todayIsoDate();
  const offset = num(payload["payment_date_offset_days"]);

  await callRpc(
    supabase,
    "save_payroll_pay_schedule",
    {
      _company_id: companyId,
      _payload: {
        id: null,
        name: "Monthly",
        frequency: "monthly",
        anchor_date: anchor,
        payment_offset_days: offset,
        is_default: true,
        is_active: true,
      },
    },
    PAYROLL_MIGRATION,
  );
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return str(value);
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normaliseSettings(raw: unknown): PayrollSettingsRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = asRecord(raw);
  return {
    company_id: str(pick(row, "company_id")),
    enabled: bool(pick(row, "enabled")),
    operating_country_code: str(pick(row, "operating_country_code")),
    payroll_currency: str(pick(row, "payroll_currency")),
    default_pay_schedule_id: strOrNull(pick(row, "default_pay_schedule_id")),
    payroll_start_date: strOrNull(pick(row, "payroll_start_date")),
    default_working_days_per_week: num(pick(row, "default_working_days_per_week")),
    default_working_hours_per_day: num(pick(row, "default_working_hours_per_day")),
    payment_date_offset_days: num(pick(row, "payment_date_offset_days")),
    salary_expense_account_id: strOrNull(pick(row, "salary_expense_account_id")),
    net_pay_liability_account_id: strOrNull(pick(row, "net_pay_liability_account_id")),
    deduction_liability_account_id: strOrNull(pick(row, "deduction_liability_account_id")),
    employer_expense_account_id: strOrNull(pick(row, "employer_expense_account_id")),
    employer_liability_account_id: strOrNull(pick(row, "employer_liability_account_id")),
    default_payment_method: assertPaymentMethod(
      str(pick(row, "default_payment_method") || "bank_transfer"),
    ),
    requires_approval: bool(pick(row, "requires_approval"), true),
    rounding_mode: assertRoundingMode(str(pick(row, "rounding_mode") || "half_up")),
    payslip_show_employer_costs: bool(pick(row, "payslip_show_employer_costs")),
    payslip_footer_note: strOrNull(pick(row, "payslip_footer_note")),
    payslip_branding_name: strOrNull(pick(row, "payslip_branding_name")),
    employee_number_prefix: str(pick(row, "employee_number_prefix") || "EMP-"),
    next_employee_number: num(pick(row, "next_employee_number") || 1),
    disclaimer_acknowledged: bool(pick(row, "disclaimer_acknowledged")),
    version: num(pick(row, "version") || 1),
  };
}

function normaliseSchedule(raw: unknown): PayrollPayScheduleRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    name: str(pick(row, "name")),
    frequency: str(pick(row, "frequency")) as PayrollPayScheduleRow["frequency"],
    anchor_date: str(pick(row, "anchor_date")),
    payment_offset_days: num(pick(row, "payment_offset_days")),
    is_default: bool(pick(row, "is_default")),
    is_active: bool(pick(row, "is_active"), true),
  };
}

function normaliseComponent(raw: unknown): PayrollComponentTypeRow {
  const row = asRecord(raw);
  return {
    id: str(pick(row, "id")),
    company_id: str(pick(row, "company_id")),
    code: str(pick(row, "code")),
    name: str(pick(row, "name")),
    kind: str(pick(row, "kind")) as PayrollComponentTypeRow["kind"],
    calculation_method: str(
      pick(row, "calculation_method"),
    ) as PayrollComponentTypeRow["calculation_method"],
    percentage_base:
      (strOrNull(pick(row, "percentage_base")) as PayrollComponentTypeRow["percentage_base"]) ??
      null,
    is_taxable: bool(pick(row, "is_taxable"), true),
    is_recurring_default: bool(pick(row, "is_recurring_default"), true),
    is_system: bool(pick(row, "is_system")),
    is_active: bool(pick(row, "is_active"), true),
    sort_order: num(pick(row, "sort_order") || 100),
    expense_account_id: strOrNull(pick(row, "expense_account_id")),
    liability_account_id: strOrNull(pick(row, "liability_account_id")),
  };
}

function normaliseSequence(raw: unknown): PayrollDocumentSequenceRow | null {
  const row = asRecord(raw);
  const documentType = str(pick(row, "document_type"));
  if (documentType !== "payroll_run" && documentType !== "payslip") return null;
  return {
    document_type: documentType,
    prefix: str(pick(row, "prefix")),
    next_number: num(pick(row, "next_number") || 1),
    padding: num(pick(row, "padding") || 4),
  };
}

function pageFromRpc(
  raw: unknown,
  companyFallback?: { id: string; name: string; country_code: string; base_currency: string },
): PayrollSettingsPage {
  const data = asRecord(raw);
  const company = asRecord(pick(data, "company"));
  const schedules = pick(data, "schedules");
  const components = pick(data, "components");
  const sequences = pick(data, "sequences");
  return {
    available: true,
    company: {
      id: str(pick(company, "id") || companyFallback?.id || ""),
      name: str(pick(company, "name") || companyFallback?.name || ""),
      country_code: str(pick(company, "country_code") || companyFallback?.country_code || ""),
      base_currency: str(pick(company, "base_currency") || companyFallback?.base_currency || ""),
    },
    settings: normaliseSettings(pick(data, "settings")),
    schedules: Array.isArray(schedules) ? schedules.map(normaliseSchedule) : [],
    components: Array.isArray(components) ? components.map(normaliseComponent) : [],
    sequences: Array.isArray(sequences)
      ? sequences
          .map(normaliseSequence)
          .filter((row): row is PayrollDocumentSequenceRow => Boolean(row))
      : [],
    disclaimer: str(pick(data, "disclaimer") || BASIC_PAYROLL_DISCLAIMER),
  };
}

export const getPayrollSettingsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.view");
    const sb = context.supabase as unknown as Sb;

    const probe = await sb
      .from("payroll_settings" as never)
      .select("company_id" as never)
      .limit(1);
    if (probe.error) {
      if (isMissingRelation(probe.error)) {
        const meta = await loadCompanyMeta(sb, data.companyId).catch(() => null);
        return {
          available: false as const,
          company: {
            id: data.companyId,
            name: meta?.name ?? "",
            country_code: meta?.countryCode ?? "",
            base_currency: meta?.baseCurrency ?? "",
          },
          settings: null,
          schedules: [] as PayrollPayScheduleRow[],
          components: [] as PayrollComponentTypeRow[],
          sequences: [] as PayrollDocumentSequenceRow[],
          disclaimer: BASIC_PAYROLL_DISCLAIMER,
          accounts: [] as AccountOption[],
          accountSuggestions: null as PayrollGlAccountSuggestions | null,
          setupCounts: { activeEmployees: 0, payrollRuns: 0 } satisfies PayrollSetupCounts,
          migrationMessage: PAYROLL_MIGRATION,
        };
      }
      throw new Error(probe.error.message);
    }

    const raw = await callRpc<unknown>(
      context.supabase,
      "get_payroll_settings_page",
      { _company_id: data.companyId },
      PAYROLL_MIGRATION,
    );
    const page = pageFromRpc(raw);
    const metas = await loadAccountMetas(sb, data.companyId);
    const accounts: AccountOption[] = metas.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      is_active: account.is_active,
      is_postable: account.is_postable,
    }));
    const accountSuggestions = suggestPayrollGlAccounts(metas);
    const setupCounts = await loadPayrollSetupCounts(sb, data.companyId);
    return {
      ...page,
      accounts,
      accountSuggestions,
      setupCounts,
      migrationMessage: null as string | null,
    };
  });

export const savePayrollSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: PayrollSettingsDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.settings.edit");
    const parsed = parsePayrollSettingsDraft(data.draft);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "save_payroll_settings",
      { _company_id: data.companyId, _payload: parsed.value },
      PAYROLL_MIGRATION,
    );
    const sb = context.supabase as unknown as Sb;
    await ensureDefaultPayScheduleIfEmpty(context.supabase, sb, data.companyId, parsed.value);
    return normaliseSettings(saved);
  });

export const savePayrollPaySchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: PayScheduleDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.settings.edit");
    const parsed = parsePayScheduleDraft(data.draft);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "save_payroll_pay_schedule",
      { _company_id: data.companyId, _payload: parsed.value },
      PAYROLL_MIGRATION,
    );
    return normaliseSchedule(saved);
  });

export const savePayrollComponentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; draft: ComponentDraft }) => ({
    companyId: companyIdOf(input),
    draft: input.draft,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.settings.edit");
    const parsed = parseComponentDraft(data.draft);
    if (!parsed.ok) throw new Error(parsed.error);
    const saved = await callRpc<unknown>(
      context.supabase,
      "save_payroll_component_type",
      { _company_id: data.companyId, _payload: parsed.value },
      PAYROLL_MIGRATION,
    );
    return normaliseComponent(saved);
  });

export const savePayrollDocumentSequences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      payrollRunPrefix: string;
      payslipPrefix: string;
      payrollRunNext: number;
      payslipNext: number;
      payrollRunPadding: number;
      payslipPadding: number;
    }) => ({
      companyId: companyIdOf(input),
      payrollRunPrefix: String(input.payrollRunPrefix ?? "PR-").trim() || "PR-",
      payslipPrefix: String(input.payslipPrefix ?? "PS-").trim() || "PS-",
      payrollRunNext: Number(input.payrollRunNext),
      payslipNext: Number(input.payslipNext),
      payrollRunPadding: Number(input.payrollRunPadding),
      payslipPadding: Number(input.payslipPadding),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "payroll.settings.edit");
    if (data.payrollRunPrefix.length > 12 || data.payslipPrefix.length > 12) {
      throw new Error("Document prefixes must be 12 characters or fewer.");
    }
    if (
      !Number.isInteger(data.payrollRunNext) ||
      data.payrollRunNext < 1 ||
      !Number.isInteger(data.payslipNext) ||
      data.payslipNext < 1
    ) {
      throw new Error("Next numbers must be whole numbers of at least 1.");
    }
    if (
      !Number.isInteger(data.payrollRunPadding) ||
      data.payrollRunPadding < 1 ||
      data.payrollRunPadding > 10 ||
      !Number.isInteger(data.payslipPadding) ||
      data.payslipPadding < 1 ||
      data.payslipPadding > 10
    ) {
      throw new Error("Padding must be a whole number between 1 and 10.");
    }
    await callRpc<unknown>(
      context.supabase,
      "save_payroll_document_sequences",
      {
        _company_id: data.companyId,
        _payload: {
          payroll_run_prefix: data.payrollRunPrefix,
          payslip_prefix: data.payslipPrefix,
          payroll_run_next: data.payrollRunNext,
          payslip_next: data.payslipNext,
          payroll_run_padding: data.payrollRunPadding,
          payslip_padding: data.payslipPadding,
        },
      },
      PAYROLL_MIGRATION,
    );
    return {
      payrollRunPrefix: data.payrollRunPrefix,
      payslipPrefix: data.payslipPrefix,
      payrollRunNext: data.payrollRunNext,
      payslipNext: data.payslipNext,
      payrollRunPadding: data.payrollRunPadding,
      payslipPadding: data.payslipPadding,
    };
  });
