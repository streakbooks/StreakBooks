/**
 * Ledger health check: types and pure helpers for the report returned by the
 * `ledger_health_check` database function. The function does the checking; this file only
 * validates what came back and words it, so nothing here can turn a failure into a pass.
 */

export type HealthStatus = "pass" | "warn" | "fail" | "na";

export type HealthCheckKey =
  | "trial_balance"
  | "unbalanced"
  | "orphans"
  | "document_journals"
  | "subledger_ar"
  | "subledger_ap"
  | "period_locks"
  | "automation";

export type HealthItem = Record<string, string | number | null>;

export type HealthCheck = {
  key: string;
  label: string;
  status: HealthStatus;
  count: number;
  summary: string;
  items: HealthItem[];
};

export type HealthReport = {
  companyId: string;
  baseCurrency: string;
  generatedAt: string;
  overall: "pass" | "warn" | "fail";
  journalsChecked: number;
  linesChecked: number;
  checks: HealthCheck[];
};

const STATUSES = new Set<string>(["pass", "warn", "fail", "na"]);

/**
 * The database function always emits these eight checks. An incomplete response
 * must not become a green accounting status, even if its "overall" says "pass".
 */
export const REQUIRED_LEDGER_HEALTH_CHECKS: readonly HealthCheckKey[] = [
  "trial_balance",
  "unbalanced",
  "orphans",
  "document_journals",
  "subledger_ar",
  "subledger_ap",
  "period_locks",
  "automation",
];

function nonNegativeSafeInteger(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
    throw new Error(`The ledger health check returned an invalid ${field}.`);
  }
  return v;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Parse the database result without allowing missing evidence to read as a pass.
 * The expected company ID ties this report back to the authenticated request.
 */
export function parseHealthReport(raw: unknown, expectedCompanyId?: string): HealthReport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The ledger health check returned no result.");
  }
  const r = raw as Record<string, unknown>;
  const rawChecks = r["checks"];
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
    throw new Error("The ledger health check returned no checks.");
  }

  const keys = new Set<string>();
  const checks: HealthCheck[] = rawChecks.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("The ledger health check returned an invalid check.");
    }
    const o = entry as Record<string, unknown>;
    const key = asString(o["key"]);
    if (!key || keys.has(key)) {
      throw new Error("The ledger health check returned a missing or duplicate check key.");
    }
    keys.add(key);
    const status = asString(o["status"]);
    const validStatus = STATUSES.has(status) ? (status as HealthStatus) : "fail";
    // Only AR/AP checks can legitimately be not-applicable when a control is unset.
    const normalizedStatus =
      validStatus === "na" && key !== "subledger_ar" && key !== "subledger_ap"
        ? "fail"
        : validStatus;
    const items = Array.isArray(o["items"])
      ? (o["items"] as unknown[]).filter(
          (item): item is HealthItem =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
      : [];
    return {
      key,
      label: asString(o["label"]),
      status: normalizedStatus,
      count: nonNegativeSafeInteger(o["count"], `${key} count`),
      summary: asString(o["summary"]),
      items,
    };
  });

  const missing = REQUIRED_LEDGER_HEALTH_CHECKS.filter((key) => !keys.has(key));
  if (missing.length > 0) {
    throw new Error(`The ledger health check is incomplete: ${missing.join(", ")}.`);
  }
  const companyId = asString(r["company_id"]);
  if (!companyId || (expectedCompanyId && companyId !== expectedCompanyId)) {
    throw new Error("The ledger health check returned the wrong organisation.");
  }
  const baseCurrency = asString(r["base_currency"]);
  if (!baseCurrency) throw new Error("The ledger health check returned no base currency.");

  return {
    companyId,
    baseCurrency,
    generatedAt: asString(r["generated_at"]),
    overall: overallStatus(checks),
    journalsChecked: nonNegativeSafeInteger(r["journals_checked"], "journal count"),
    linesChecked: nonNegativeSafeInteger(r["lines_checked"], "line count"),
    checks,
  };
}

/** Worst status wins. Checks that do not apply (`na`) neither pass nor fail the whole report. */
export function overallStatus(checks: Pick<HealthCheck, "status">[]): "pass" | "warn" | "fail" {
  if (checks.length === 0) return "fail";
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

export function headline(report: Pick<HealthReport, "overall" | "checks">): string {
  const failed = report.checks.filter((c) => c.status === "fail").length;
  const warned = report.checks.filter((c) => c.status === "warn").length;
  const applicable = report.checks.filter((c) => c.status !== "na").length;
  if (report.overall === "pass") return `All ${applicable} checks passed.`;
  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (warned > 0) parts.push(`${warned} need a look`);
  return `${parts.join(", ")} of ${applicable} checks.`;
}

const PROBLEM_LABELS: Record<string, string> = {
  line_without_journal: "Line has no journal",
  line_company_differs_from_journal: "Line belongs to a different organisation than its journal",
  line_account_missing_or_other_company:
    "Line points at a missing account or one from another organisation",
  posted_journal_without_lines: "Posted journal has no lines",
  no_journal: "Issued but has no journal",
  journal_missing: "Journal record is missing",
  journal_not_posted: "Journal is not posted",
  journal_reversed_but_document_live: "Journal was reversed but the document is still live",
  voided_but_journal_still_live: "Voided but its journal is still in the ledger",
  posted_after_period_lock: "Posted after the period was locked",
  posted_after_lock_date: "Posted after the lock date was set",
  dated_outside_its_period: "Dated outside its accounting period",
  failed: "Auto-reversal failed",
  overdue: "Auto-reversal overdue",
};

export function problemLabel(problem: string | number | null | undefined): string {
  const key = typeof problem === "string" ? problem : "";
  return PROBLEM_LABELS[key] ?? (key ? key.replace(/_/g, " ") : "Problem");
}

/** In-app place to start fixing each check. */
export function checkHref(key: string): string | null {
  switch (key) {
    case "subledger_ar":
      return "/reports/aged-receivables";
    case "subledger_ap":
      return "/reports/aged-payables";
    case "trial_balance":
    case "unbalanced":
    case "orphans":
      return "/reports/trial-balance";
    case "period_locks":
      return "/reports/journals";
    case "automation":
      return "/accounting";
    default:
      return null;
  }
}
