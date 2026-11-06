/**
 * Pure presentation model for the Accounting Reconciliation Exception Centre.
 *
 * Every audit is explicitly opt-in and keeps its native coverage boundary.
 * "Not run", "unavailable" and partial samples can never be shown as a pass.
 * No issue review acknowledgement is stored in the database.
 */
import type { HealthReport } from "./ledger-health";
import type { FxRealisedAuditResult } from "./fx-ledger-audit";
import type { FxRunAuditReport } from "./fx-revaluation-ledger-audit";
import type { DeferralAuditResult } from "./deferral-ledger-audit";
import type { LiabilityRollforwardResult } from "./payroll-liability-rollforward";
import { toCsv } from "@/lib/sales/csv";

export type ExceptionSource =
  | "ledger"
  | "fx_realised"
  | "fx_revaluation"
  | "deferrals"
  | "payroll"
  | "fixed_assets";
export type ExceptionSeverity = "error" | "warning";
export type ExceptionCoverageState = "not_run" | "checked" | "partial" | "unavailable";
export type ExceptionFinding = {
  key: string;
  source: ExceptionSource;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  journalId: string | null;
  reference: string | null;
  findingCount: number;
  href: string;
};
export type ExceptionCoverage = {
  source: ExceptionSource;
  label: string;
  state: ExceptionCoverageState;
  note: string;
  checkedCount: number | null;
};
export type AuditCapture<T> = {
  state: "not_run" | "checked" | "unavailable";
  result?: T;
  message?: string;
};
export type ExceptionInputs = {
  ledger: AuditCapture<HealthReport>;
  realisedFx: AuditCapture<FxRealisedAuditResult>;
  revaluation: AuditCapture<FxRunAuditReport>;
  deferrals: AuditCapture<DeferralAuditResult>;
  payroll: AuditCapture<LiabilityRollforwardResult>;
};
export type ExceptionSnapshot = {
  findings: ExceptionFinding[];
  coverage: ExceptionCoverage[];
  errors: number;
  warnings: number;
  fullyVerified: boolean;
};

const SOURCE: Record<ExceptionSource, { label: string; href: string; note: string }> = {
  ledger: {
    label: "Ledger health", href: "/accounting?tab=health",
    note: "Eight database health checks; sample details may be capped",
  },
  fx_realised: {
    label: "Realised FX", href: "/accounting?tab=fx",
    note: "Most recent 50 eligible nonzero FX postings only",
  },
  fx_revaluation: {
    label: "FX revaluation", href: "/accounting?tab=fx",
    note: "One selected revaluation run; not all runs",
  },
  deferrals: {
    label: "Deferrals", href: "/accounting?tab=deferrals",
    note: "One selected recognition schedule; not all schedules",
  },
  payroll: {
    label: "Payroll liability", href: "/accounting?tab=health",
    note: "One date range and current net-pay account; other periods and historic settings excluded",
  },
  fixed_assets: {
    label: "Fixed assets", href: "/fixed-assets",
    note: "No merged cross-module reconciliation source connected; review within Fixed Assets",
  },
};
const ORDER: ExceptionSource[] = [
  "ledger", "fx_realised", "fx_revaluation", "deferrals", "payroll", "fixed_assets",
];

function safeRef(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function buildFinding(
  source: ExceptionSource,
  id: string,
  severity: ExceptionSeverity,
  title: string,
  detail: string,
  opts: { reference?: string | null; journalId?: string | null; findingCount?: number } = {},
): ExceptionFinding {
  const cleanCount = opts.findingCount ?? 1;
  if (!Number.isSafeInteger(cleanCount) || cleanCount < 1) {
    throw new Error("Invalid exception finding count.");
  }
  return {
    key: source + ":" + id,
    source, severity, title, detail,
    reference: safeRef(opts.reference),
    journalId: safeRef(opts.journalId),
    findingCount: cleanCount,
    href: SOURCE[source].href,
  };
}
function coverageState<T>(input: AuditCapture<T>, partial = false): ExceptionCoverageState {
  if (input.state === "not_run") return "not_run";
  if (input.state === "unavailable" || !input.result) return "unavailable";
  return partial ? "partial" : "checked";
}

/** Normalise only confirmed server audit output; no source is silently assumed complete. */
export function createExceptionSnapshot(inputs: ExceptionInputs): ExceptionSnapshot {
  const findings: ExceptionFinding[] = [];
  const captures = {
    ledger: inputs.ledger,
    fx_realised: inputs.realisedFx,
    fx_revaluation: inputs.revaluation,
    deferrals: inputs.deferrals,
    payroll: inputs.payroll,
    fixed_assets: { state: "not_run" as const },
  };
  const coverage = ORDER.map((source): ExceptionCoverage => {
    const capture = captures[source];
    const isPartial =
      source === "fx_realised"
        ? Boolean(inputs.realisedFx.result?.hasMore)
        : source === "fx_revaluation" || source === "deferrals" || source === "payroll";
    const state = coverageState(capture, isPartial);
    const checkedCount =
      source === "ledger" ? inputs.ledger.result?.checks.length
      : source === "fx_realised" ? inputs.realisedFx.result?.rowsChecked
      : source === "fx_revaluation" ? inputs.revaluation.result?.journalCount
      : source === "deferrals" ? inputs.deferrals.result?.entries.length
      : source === "payroll" ? inputs.payroll.result?.sourceRunCount
      : null;
    const message = capture.message?.trim();
    const note = message && state === "unavailable"
      ? SOURCE[source].note + " · " + message
      : SOURCE[source].note;
    return { source, label: SOURCE[source].label, state, note, checkedCount: checkedCount ?? null };
  });
  const health = inputs.ledger.state === "checked" ? inputs.ledger.result : undefined;
  if (health) for (const check of health.checks) {
    if (check.status !== "fail" && check.status !== "warn") continue;
    const preview = check.items.slice(0, 3).map(item =>
      Object.entries(item)
        .filter(([,value]) => value !== null && value !== "")
        .map(([key, value]) => key.replace(/_/g, " ") + ": " + String(value))
        .join("; "),
    ).filter(Boolean).join(" | ");
    findings.push(buildFinding("ledger", check.key,
      check.status === "fail" ? "error" : "warning",
      check.label || check.key,
      [check.summary, preview && "Samples: " + preview,
        check.count > check.items.length && "Additional findings may exist beyond returned samples."].filter(Boolean).join(" · "),
      { findingCount: Math.max(1, check.count) },
    ));
  }
  const realised = inputs.realisedFx.state === "checked" ? inputs.realisedFx.result : undefined;
  if (realised) for (const row of realised.rows) {
    if (row.status === "matched") continue;
    findings.push(buildFinding("fx_realised", row.recordId,
      row.status === "mismatch" ? "error" : "warning",
      "Realised FX " + row.status + " · " + row.currencyCode,
      row.issues.length ? row.issues.join(" · ") : "Reversal requires historical verification.",
      { reference: row.recordId, journalId: row.journalId },
    ));
  }
  const revaluation = inputs.revaluation.state === "checked" ? inputs.revaluation.result : undefined;
  if (revaluation) {
    revaluation.differences.forEach((message, i) => findings.push(buildFinding(
      "fx_revaluation", revaluation.runId + ":difference:" + i, "error",
      "FX revaluation totals differ", message, { reference: revaluation.runId },
    )));
    for (const item of revaluation.items) {
      if (item.status !== "exception") continue;
      findings.push(buildFinding("fx_revaluation", revaluation.runId + ":" + item.journalId,
        "error", "FX revaluation journal exception",
        item.issues.join(" · ") || "Journal requires review.",
        { reference: revaluation.runId, journalId: item.journalId },
      ));
    }
  }
  const deferrals = inputs.deferrals.state === "checked" ? inputs.deferrals.result : undefined;
  if (deferrals) {
    deferrals.scheduleIssues.forEach((message, i) => findings.push(buildFinding(
      "deferrals", deferrals.scheduleId + ":schedule:" + i, "error",
      "Deferral schedule issue · " + deferrals.scheduleName, message,
      { reference: deferrals.scheduleId },
    )));
    for (const entry of deferrals.entries) {
      if (entry.status === "matched") continue;
      findings.push(buildFinding("deferrals", deferrals.scheduleId + ":" + entry.entryId,
        entry.status === "mismatch" ? "error" : "warning",
        "Deferral recognition period " + entry.periodNo + " · " + entry.status,
        entry.issues.join(" · ") || (entry.status === "unposted"
          ? "Recognition entry has not been posted."
          : "Recognition reversal requires review."),
        { reference: entry.entryId, journalId: entry.journalId },
      ));
    }
  }
  const payroll = inputs.payroll.state === "checked" ? inputs.payroll.result : undefined;
  if (payroll) {
    payroll.issues.forEach((item, i) => findings.push(buildFinding(
      "payroll", payroll.start + ":" + payroll.end + ":issue:" + i, "error",
      "Payroll liability · " + item.kind.replace(/_/g, " "), item.message,
      { reference: item.sourceId, journalId: item.journalId },
    )));
    payroll.warnings.forEach((message, i) => findings.push(buildFinding(
      "payroll", payroll.start + ":" + payroll.end + ":warning:" + i, "warning",
      "Payroll liability requires review", message,
    )));
  }
  // Do not collapse separate exception sources into an apparent global pass.
  const seen = new Set<string>();
  for (const finding of findings) {
    if (seen.has(finding.key)) throw new Error("Duplicate reconciliation exception identity.");
    seen.add(finding.key);
  }
  const errors = findings.filter(x => x.severity === "error").length;
  const warnings = findings.length - errors;
  return {
    findings, coverage, errors, warnings,
    fullyVerified: coverage.every(c => c.state === "checked") && findings.length === 0,
  };
}
export type ExceptionFilter = {
  source: ExceptionSource | "all";
  severity: ExceptionSeverity | "all";
  search: string;
  review: "all" | "unreviewed" | "reviewed";
};
/** Review is local to the current browser session, never an accounting sign-off. */
export function filterExceptionFindings(
  findings: readonly ExceptionFinding[], filter: ExceptionFilter,
  reviewed: ReadonlySet<string>,
): ExceptionFinding[] {
  const needle = filter.search.trim().toLocaleLowerCase();
  return findings.filter(row =>
    (filter.source === "all" || row.source === filter.source) &&
    (filter.severity === "all" || row.severity === filter.severity) &&
    (filter.review === "all" ||
      (filter.review === "reviewed" ? reviewed.has(row.key) : !reviewed.has(row.key))) &&
    (!needle || [
      row.title, row.detail, row.source, row.reference, row.journalId,
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)),
  ).sort((a,b) =>
    Number(b.severity === "error") - Number(a.severity === "error") ||
    a.source.localeCompare(b.source) || a.key.localeCompare(b.key),
  );
}
/** CSV is spreadsheet-formula-safe using the existing LinkBooks sales exporter. */
export function exceptionSnapshotCsv(
  snapshot: ExceptionSnapshot, reviewed: ReadonlySet<string>,
): string {
  const rows: unknown[][] = [
    ...snapshot.findings.map(row => [
      "Finding", SOURCE[row.source].label, row.severity, row.title,
      row.findingCount, row.detail, row.reference ?? "", row.journalId ?? "",
      reviewed.has(row.key) ? "Reviewed in this session" : "Not reviewed",
      row.href,
    ]),
    ...snapshot.coverage.map(row => [
      "Coverage", row.label, row.state, row.note, row.checkedCount ?? "",
      "", "", "", "Not a sign-off", SOURCE[row.source].href,
    ]),
  ];
  return toCsv([
    "Type", "Module", "Severity or coverage", "Title", "Count",
    "Description", "Source ID", "Journal ID", "Session review", "Review location",
  ], rows);
}
