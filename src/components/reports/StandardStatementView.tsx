import { addMonthsIso, monthStart, fiscalYearStart } from "@/lib/accounting/fiscal-year";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { getStandardStatement, exportStandardStatement } from "@/lib/reports/standard.functions";
import { getReportAccounts, getReportFilterOptions } from "@/lib/reports/ecosystem.functions";
import { resolveStandardSettings, encodeStandardSettings } from "@/lib/reports/standard-settings";
import { downloadReportFile } from "@/lib/reports/download";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { displayDocumentValue } from "@/lib/reports/document-format";
import { ReportShell, ReportPane, Stat, type ReportCtx } from "./ReportShell";
import { StandardReportControls } from "./StandardReportControls";
import { DocumentPreview } from "./DocumentPreview";
import { Button } from "@/components/ui/button";
export function StandardStatementView({
  ctx,
  report,
}: {
  ctx: ReportCtx;
  report: "profit-and-loss" | "balance-sheet";
}) {
  const settings = resolveStandardSettings(ctx.search),
    encoded = encodeStandardSettings(settings);
  const fetch = useServerFn(getStandardStatement),
    exportFn = useServerFn(exportStandardStatement),
    accountsFn = useServerFn(getReportAccounts),
    optionsFn = useServerFn(getReportFilterOptions);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const canExport = useCanDo("reports.export");
  const columnFrom =
    report === "balance-sheet" && ctx.search.compare === "months" && !ctx.search.settings
      ? addMonthsIso(monthStart(ctx.to), -5)
      : report === "balance-sheet" && (settings.group === "total" || !ctx.search.from)
        ? fiscalYearStart(ctx.to, ctx.fyEndMonth ?? 12, ctx.fyEndDay ?? 31)
        : ctx.from;
  const effectiveCtx = { ...ctx, from: columnFrom, search: { ...ctx.search, settings: encoded } };
  const data = { companyId: ctx.companyId, report, from: columnFrom, to: ctx.to, settings };
  const q = useQuery({
    queryKey: ["standard-statement", ctx.companyId, report, columnFrom, ctx.to, encoded],
    queryFn: () => {
      if (ctx.search.basis === "cash")
        throw new Error(
          "Cash-basis statements are not available. Choose an accrual saved view or the Cash Summary report.",
        );
      return fetch({ data });
    },
    retry: false,
  });
  const choices = useQuery({
    queryKey: ["standard-statement-choices", ctx.companyId],
    enabled: choicesOpen && report === "profit-and-loss",
    queryFn: async () => {
      const [accounts, options] = await Promise.all([
        accountsFn({ data: { companyId: ctx.companyId } }),
        optionsFn({ data: { companyId: ctx.companyId } }),
      ]);
      return { accounts, options };
    },
    retry: false,
  });
  const exporting = useMutation({
    mutationFn: (format: "pdf" | "xlsx" | "csv") => exportFn({ data: { ...data, format } }),
    onSuccess: downloadReportFile,
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const doc = q.data;
  return (
    <ReportShell
      title={report === "profit-and-loss" ? "Profit and Loss" : "Balance Sheet"}
      ctx={effectiveCtx}
      mode={report === "profit-and-loss" ? "range" : "asof"}
      basis={settings.showBasis ? "Accrual basis · posted ledger" : ""}
      extraControls={
        <>
          <StandardReportControls
            settings={settings}
            onApply={(value) =>
              ctx.setSearch({
                from: columnFrom,
                settings: encodeStandardSettings(value),
                columns: undefined,
                compare: undefined,
              })
            }
            report={report}
            accounts={choices.data?.accounts ?? []}
            filterOptions={choices.data?.options ?? { currencies: [], sources: [] }}
            loadingFilters={choices.isPending}
            {...(choices.isError ? { filterError: friendlyAuthError(choices.error) } : {})}
            onOpen={() => setChoicesOpen(true)}
            onRetryFilters={() => void choices.refetch()}
          />
          {report === "balance-sheet" && settings.group !== "total" && (
            <div className="space-y-1">
              <Label htmlFor="statement-column-from">Column periods from</Label>
              <Input
                id="statement-column-from"
                type="date"
                value={columnFrom}
                onChange={(e) => e.target.value && ctx.setSearch({ from: e.target.value })}
              />
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw
              className={`mr-1 size-4 ${q.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </>
      }
      toolbarActions={
        <>
          {(
            [
              ["pdf", "Download PDF"],
              ["xlsx", "Export Excel"],
              ["csv", "Export CSV"],
            ] as const
          ).map(([format, label]) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              disabled={!canExport || !doc || q.isError || exporting.isPending}
              onClick={() => exporting.mutate(format)}
            >
              <Download className="mr-1 size-4" aria-hidden="true" />
              {exporting.isPending && exporting.variables === format ? "Preparing…" : label}
            </Button>
          ))}
        </>
      }
    >
      <ReportPane
        query={q}
        emptyTitle="No report data"
        emptyDescription="Choose a period with posted accounting activity."
      >
        {doc && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4 print:hidden">
              {doc.summary?.map((item) => (
                <Stat
                  key={item.label}
                  label={item.label}
                  value={displayDocumentValue(item.value, {
                    format: "money",
                    scale: settings.scale,
                    ...(settings.decimals !== "currency"
                      ? { decimals: Number(settings.decimals) }
                      : {}),
                    negative: settings.negative,
                    currencyPrefix: doc.currency + " ",
                  })}
                />
              ))}
            </div>
            <DocumentPreview
              document={doc}
              showHeader={false}
              compact={settings.compact}
              collapsedSections={settings.collapsedSections}
              {...(settings.detail === "accounts"
                ? {
                    onToggleSection: (label: string) =>
                      ctx.setSearch({
                        settings: encodeStandardSettings({
                          ...settings,
                          collapsedSections: settings.collapsedSections.includes(label)
                            ? settings.collapsedSections.filter((s) => s !== label)
                            : [...settings.collapsedSections, label],
                        }),
                      }),
                  }
                : {})}
            />
          </>
        )}
      </ReportPane>
    </ReportShell>
  );
}
