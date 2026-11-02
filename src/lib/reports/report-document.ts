import { buildCapturedStandardStatement } from "./standard-captured";
/** Immutable report document shared by preview, PDF, XLSX, CSV and the delivery worker. */
import { z } from "zod";
import { isReportDate } from "./date-validation";
import {
  accountMap,
  balancesToLines,
  type AccountMeta,
  type LedgerBalance,
} from "@/lib/accounting/ledger-data";
import {
  buildBalanceSheet,
  buildFiscalTrialBalance,
  buildProfitAndLoss,
} from "@/lib/accounting/reporting";
import { buildBalanceSheetStatement, buildPnlStatement, type StatementLine } from "./statements";
import { buildIndirectCashFlow } from "./indirect-cash-flow";
import { reportFiltersSchema, filterFingerprint, describeReportFilters } from "./report-filters";
import { customDefinitionSchema, executeCustomReport, decimalValue } from "./custom-definition";
import { fromMinorUnits, decimalPlacesFor } from "@/lib/accounting/money";

const integer = z.union([z.string().regex(/^-?\d+$/), z.number().int().safe()]).transform(String);
const balance = z.object({
  account_id: z.string().uuid(),
  debit_minor: integer,
  credit_minor: integer,
  line_count: z.coerce.number().int().nonnegative().default(0),
});
const cash = z.object({
  bank_account_name: z.string(),
  gl_account_id: z.string().uuid(),
  opening_minor: integer,
  received_minor: integer,
  spent_minor: integer,
  transfers_in_minor: integer,
  transfers_out_minor: integer,
  closing_minor: integer,
});
export const factsSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string(),
  from: z.string(),
  to: z.string(),
  fyStart: z.string(),
  priorFrom: z.string(),
  priorTo: z.string(),
  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    baseCurrency: z.string(),
    fyEndMonth: z.number(),
    fyEndDay: z.number().nullable(),
  }),
  accounts: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      account_type: z.enum(["asset", "liability", "equity", "income", "expense"]),
      subtype: z.string().nullable(),
      account_kind: z.string().nullable(),
      system_key: z.string().nullable(),
      fs_line: z.string().nullable(),
      cash_flow_class: z.string().nullable(),
      is_control: z.boolean(),
      is_active: z.boolean(),
      is_postable: z.boolean(),
      show_on_dashboard_watchlist: z.boolean(),
    }),
  ),
  period: z.array(balance),
  prior: z.array(balance),
  bsPrior: z.array(balance),
  bsCurrent: z.array(balance),
  cash: z.array(cash),
  appliedFilters: reportFiltersSchema.optional(),
  standardColumns: z
    .array(
      z.object({
        label: z.string(),
        from: z.string().refine(isReportDate),
        to: z.string().refine(isReportDate),
        fyStart: z.string().refine(isReportDate),
        period: z.array(balance),
        bsPrior: z.array(balance),
        bsCurrent: z.array(balance),
      }),
    )
    .max(26)
    .optional(),
  customColumns: z
    .array(
      z.object({ id: z.string(), from: z.string(), to: z.string(), balances: z.array(balance) }),
    )
    .optional(),
});
export type ReportingFacts = z.infer<typeof factsSchema>;
export type DocumentRow = {
  label: string;
  values: string[];
  kind: "heading" | "account" | "subtotal" | "total" | "formula" | "group";
  accountId?: string;
  indent?: number;
  format?: "money" | "number" | "percent";
  negative?: "minus" | "parentheses";
  scale?: string;
  thousands?: boolean;
  negativeRed?: boolean;
  zero?: "zero" | "dash" | "blank";
  currencyPrefix?: string;
  decimals?: number;
};
export type DocumentSection = {
  id: string;
  title: string;
  columns: string[];
  columnPeriods?: Array<{ from: string; to: string }>;
  columnFormats?: Array<"inherit" | "money" | "number" | "percent">;
  rows: DocumentRow[];
  note?: string;
};
export type ReportDocument = {
  summary?: Array<{ label: string; value: string }>;
  title: string;
  subtitle: string;
  company: string;
  currency: string;
  from: string;
  to: string;
  capturedAt: string;
  header: string;
  footer: string;
  notes: string;
  orientation: "portrait" | "landscape";
  sections: DocumentSection[];
};
function balances(rows: ReportingFacts["period"]): LedgerBalance[] {
  return rows.map((r) => ({
    ...r,
    debit_minor: BigInt(r.debit_minor),
    credit_minor: BigInt(r.credit_minor),
  }));
}
function safe(value: bigint | string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("This report exceeds the supported numeric range for cash-flow analysis");
  return n;
}
export function documentFigures(raw: unknown) {
  const f = factsSchema.parse(raw),
    byId = accountMap(f.accounts as AccountMeta[]),
    currency = f.company.baseCurrency;
  const lines = (rows: ReportingFacts["period"], date: string) =>
    balancesToLines(balances(rows), byId, date, currency);
  const current = buildProfitAndLoss(lines(f.period, f.to), { from: f.from, to: f.to });
  const prior = buildProfitAndLoss(lines(f.prior, f.priorTo), { from: f.priorFrom, to: f.priorTo });
  const bsLines = [
    ...lines(
      f.bsPrior,
      f.fyStart > "0001-01-01"
        ? new Date(Date.parse(f.fyStart + "T00:00:00Z") - 86400000).toISOString().slice(0, 10)
        : f.fyStart,
    ),
    ...lines(f.bsCurrent, f.to),
  ];
  const bs = buildBalanceSheet(bsLines, { asOf: f.to, fyStart: f.fyStart });
  const tb = buildFiscalTrialBalance(bsLines, { to: f.to, fyStart: f.fyStart });
  return { f, current, prior, bs, tb };
}
export const PACK_REPORTS = [
  "profit-and-loss",
  "balance-sheet",
  "trial-balance",
  "cash-summary",
  "cash-flow-indirect",
] as const;
export function buildReportDocument(
  raw: unknown,
  definition: { name: string; reportId?: string; config: Record<string, unknown> },
): ReportDocument {
  if (
    typeof definition.config["settings"] === "string" &&
    (definition.reportId === "profit-and-loss" || definition.reportId === "balance-sheet") &&
    !definition.config["_builder"]
  ) {
    const document = buildCapturedStandardStatement(
      factsSchema.parse(raw),
      definition.reportId,
      definition.config["settings"],
    );
    if (definition.name && definition.name !== definition.reportId)
      document.title = definition.name;
    return document;
  }
  const { f, current, prior, bs, tb } = documentFigures(raw);
  const currency = f.company.baseCurrency;
  const config = definition.config;
  const builder = config["_builder"] ? customDefinitionSchema.parse(config["_builder"]) : null;
  const doc: ReportDocument = {
    title: builder?.title ?? definition.name,
    subtitle: builder?.subtitle ?? String(config["subtitle"] ?? ""),
    company: f.company.name,
    currency,
    from: f.from,
    to: f.to,
    capturedAt: f.capturedAt,
    header: builder?.header ?? String(config["header"] ?? ""),
    footer: builder?.footer ?? String(config["footer"] ?? ""),
    notes:
      builder?.notes ??
      [
        String(config["commentary"] ?? ""),
        ...(Array.isArray(config["actionItems"])
          ? config["actionItems"].map((item: unknown) => {
              const action = z
                .object({
                  text: z.string().max(500),
                  status: z.string().max(30),
                  assigneeId: z.string().uuid().nullable(),
                })
                .parse(item);
              return `Action: ${action.text} — ${action.status.replaceAll("_", " ")}${action.assigneeId ? ` (assigned: ${action.assigneeId})` : ""}`;
            })
          : []),
      ]
        .filter(Boolean)
        .join("\n"),
    orientation: builder?.orientation ?? "portrait",
    sections: [],
  };
  if (builder) {
    if (builder.filters.clauses.length || f.appliedFilters?.clauses.length) {
      if (
        !f.appliedFilters ||
        filterFingerprint(f.appliedFilters) !== filterFingerprint(builder.filters)
      )
        throw new Error("Captured facts do not match the requested report filters");
      doc.subtitle = [doc.subtitle, "Filtered report"].filter(Boolean).join(" · ");
      const names = new Map(f.accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
      doc.notes = [`Report filters: ${describeReportFilters(builder.filters, names)}`, doc.notes]
        .filter(Boolean)
        .join("\n");
    }
    if (!f.customColumns) throw new Error("Custom column facts were not captured");
    let rows = executeCustomReport(
      builder,
      f.accounts,
      f.customColumns.map((c) => c.balances),
      decimalPlacesFor(currency),
    );
    const suppressed = new Set<string>();
    const byRow = new Map(builder.rows.map((r) => [r.id, r]));
    function hideChildren(id: string) {
      for (const child of byRow.get(id)?.children ?? []) {
        if (suppressed.has(child)) continue;
        suppressed.add(child);
        hideChildren(child);
      }
    }
    for (const r of builder.rows) if (r.kind === "group" && r.collapsed) hideChildren(r.id);
    rows = rows.filter((r) => !suppressed.has(r.id));
    const settings = builder.display;
    const visible = builder.columns
      .map((c, i) => ({ c, i }))
      .filter(
        (x) =>
          !x.c.hidden &&
          (settings.columns === "all" ||
            rows.some(
              (r) =>
                r.kind !== "heading" && (r.values[x.i] === null || BigInt(r.values[x.i]!.n) !== 0n),
            )),
      );
    if (!visible.length) throw new Error("No visible columns match the display settings");
    rows = rows.filter(
      (r) =>
        r.kind === "heading" ||
        settings.rows === "all" ||
        (settings.rows === "non_zero"
          ? visible.some(({ i }) => r.values[i] === null || BigInt(r.values[i]!.n) !== 0n)
          : visible.every(({ i }) => r.values[i] !== null && BigInt(r.values[i]!.n) === 0n)),
    );
    if (settings.sort !== "custom")
      rows = [...rows].sort(
        (a, b) => a.label.localeCompare(b.label) * (settings.sort === "label_desc" ? -1 : 1),
      );
    const currencyPrefix = settings.currencySymbol
      ? new Intl.NumberFormat("en", { style: "currency", currency })
          .formatToParts(0)
          .find((p) => p.type === "currency")?.value
      : undefined;
    if (settings.scale !== "1")
      doc.subtitle = [
        doc.subtitle,
        `Monetary and number figures divided by ${Number(settings.scale).toLocaleString("en")}`,
      ]
        .filter(Boolean)
        .join(" · ");
    doc.sections = [
      {
        id: "custom",
        title: builder.title,
        ...(rows.some((r) => visible.some(({ i }) => r.values[i] === null))
          ? {
              note: "Unavailable values have a zero denominator or depend on an unavailable calculation; they are not zero balances.",
            }
          : {}),
        columnFormats: visible.map(({ c }) => c.format),
        columns: visible.map(({ c, i }) =>
          c.mode === "calculated"
            ? c.label
            : `${c.label} (${f.customColumns![i]!.from} – ${f.customColumns![i]!.to})`,
        ),
        rows: rows.map((r) => ({
          label: r.label,
          kind: (r.kind === "accounts" ? "account" : r.kind) as DocumentRow["kind"],
          ...(byRow.get(r.id)?.accountIds.length === 1 && !byRow.get(r.id)?.accountTypes.length
            ? { accountId: byRow.get(r.id)!.accountIds[0]! }
            : {}),
          indent: r.indent,
          format: r.format,
          negative: r.negative,
          scale: settings.scale,
          thousands: settings.thousands,
          negativeRed: settings.negativeRed,
          zero: settings.zero,
          ...(currencyPrefix ? { currencyPrefix } : {}),
          values: visible.map(({ i }) => {
            const value = r.values[i];
            if (r.kind === "heading") return "";
            if (value === undefined) throw new Error("Missing custom report value");
            if (value === null) return "Unavailable";
            const format =
              builder.columns[i]!.format === "inherit" ? r.format : builder.columns[i]!.format;
            return decimalValue(value, r.decimals, format === "percent" ? 100n : 1n);
          }),
        })),
      },
    ];
    return doc;
  }
  const requested = definition.reportId ? [definition.reportId] : config["reports"];
  if (!Array.isArray(requested) || !requested.length) throw new Error("No reports selected");
  const money = (n: bigint | string) => fromMinorUnits(BigInt(n), currency);
  const statement = (
    id: string,
    title: string,
    lines: StatementLine[],
    columns: string[],
  ): DocumentSection => ({
    id,
    title,
    columns,
    rows: lines.map((l) => ({
      label: l.code ? `${l.code} ${l.label}` : l.label,
      kind: l.kind,
      ...(l.accountId ? { accountId: l.accountId } : {}),
      values: l.amounts.map(money),
    })),
  });
  for (const id of requested) {
    if (id === "profit-and-loss")
      doc.sections.push(
        statement(id, "Profit and Loss", buildPnlStatement([current, prior]), [
          `${f.from} – ${f.to}`,
          `${f.priorFrom} – ${f.priorTo}`,
        ]),
      );
    else if (id === "balance-sheet") {
      if (!bs.equationHolds)
        throw new Error(
          "Balance sheet does not reconcile; resolve the ledger discrepancy before export or delivery",
        );
      doc.sections.push(
        statement(id, "Balance Sheet", buildBalanceSheetStatement([bs]), [`As at ${f.to}`]),
      );
    } else if (id === "trial-balance") {
      if (!tb.balances)
        throw new Error("Trial balance does not balance; resolve the ledger discrepancy");
      doc.sections.push({
        id,
        title: "Trial Balance",
        columns: ["Debit", "Credit"],
        rows: [
          ...tb.rows.map((r) => ({
            label: `${r.code} ${r.name}`,
            kind: "account" as const,
            accountId: r.account_id,
            values: [money(r.debit_minor), money(r.credit_minor)],
          })),
          { label: "Total", kind: "total", values: [money(tb.totalDebit), money(tb.totalCredit)] },
        ],
      });
    } else if (id === "cash-summary")
      doc.sections.push({
        id,
        title: "Cash Summary",
        columns: ["Opening cash", "Received", "Spent", "Net transfers", "Closing cash"],
        rows: f.cash.map((c) => ({
          label: c.bank_account_name,
          kind: "account",
          accountId: c.gl_account_id,
          values: [
            c.opening_minor,
            c.received_minor,
            c.spent_minor,
            (BigInt(c.transfers_in_minor) - BigInt(c.transfers_out_minor)).toString(),
            c.closing_minor,
          ].map(money),
        })),
      });
    else if (id === "cash-flow-indirect") {
      const opening = f.cash.reduce((s, c) => s + BigInt(c.opening_minor), 0n),
        closing = f.cash.reduce((s, c) => s + BigInt(c.closing_minor), 0n);
      const flow = buildIndirectCashFlow({
        accounts: f.accounts,
        movements: f.period.map((b) => ({
          accountId: b.account_id,
          debitMinor: safe(b.debit_minor),
          creditMinor: safe(b.credit_minor),
        })),
        bankAccountIds: f.cash.map((c) => c.gl_account_id),
        openingCashMinor: safe(opening),
        closingCashLedgerMinor: safe(closing),
      });
      if (!flow.reconciles) throw new Error("Cash flow does not reconcile to the bank ledger");
      doc.sections.push({
        id,
        title: "Cash Flow (indirect)",
        columns: [`${f.from} – ${f.to}`],
        note: "Indirect classification follows the existing account classifications; disposal proceeds may require accountant review.",
        rows: [
          { label: "Opening cash", kind: "total", values: [money(opening)] },
          ...(
            [
              ["Operating activities", flow.operating],
              ["Investing activities", flow.investing],
              ["Financing activities", flow.financing],
            ] as const
          ).flatMap(([label, items]) => [
            { label, kind: "heading" as const, values: [""] },
            ...items.map((r) => ({
              label: r.label,
              kind: "account" as const,
              values: [money(BigInt(r.amountMinor))],
              ...(r.accountId ? { accountId: r.accountId } : {}),
            })),
          ]),
          {
            label: "Net cash movement",
            kind: "total",
            values: [money(BigInt(flow.netChangeMinor))],
          },
          { label: "Closing cash", kind: "total", values: [money(closing)] },
        ],
      });
    } else throw new Error(`Report ${String(id)} cannot be exported by this document renderer`);
  }
  return doc;
}
