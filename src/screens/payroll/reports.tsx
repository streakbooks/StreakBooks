import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PAYROLL_REPORT_STATUS_FOOTNOTE } from "@/lib/payroll/payroll-report-scope";
import {
  getPayrollReportsCatalog,
  runPayrollReportServer,
} from "@/lib/payroll/payroll-reports.functions";
import type {
  PayrollReportColumn,
  PayrollReportId,
  PayrollReportRow,
} from "@/lib/payroll/payroll-reports";
import { csvFilename, downloadCsv, toCsv, csvMoney } from "@/lib/reports/csv";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MONEY_KEYS = new Set([
  "grossMinor",
  "deductionsMinor",
  "netMinor",
  "employerCostMinor",
  "employerContributionsMinor",
  "amountMinor",
  "paidMinor",
  "outstandingMinor",
  "runGrossMinor",
  "runNetMinor",
  "journalDebitMinor",
  "journalCreditMinor",
  "totalCostMinor",
]);

function formatCell(
  key: string,
  value: string | number | undefined,
  fmt: ReturnType<typeof useFormat>,
  currency: string,
): string {
  if (value === undefined || value === "") return "—";
  if (MONEY_KEYS.has(key) && typeof value === "number") {
    return fmt.money(value, currency);
  }
  return String(value);
}

export function PayrollReportsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.reports.view");
  const fmt = useFormat();
  const fetchCatalog = useServerFn(getPayrollReportsCatalog);
  const fetchReport = useServerFn(runPayrollReportServer);

  const today = new Date().toISOString().slice(0, 10);
  const [reportId, setReportId] = useState<PayrollReportId>("payroll_summary");
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [dateTo, setDateTo] = useState(today);
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [department, setDepartment] = useState("");
  const [payScheduleId, setPayScheduleId] = useState<string>("all");

  const catalogQ = useQuery({
    queryKey: ["payroll-reports-catalog", company?.id],
    queryFn: () => fetchCatalog({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const reportQ = useQuery({
    queryKey: [
      "payroll-report",
      company?.id,
      reportId,
      dateFrom,
      dateTo,
      employeeId,
      department,
      payScheduleId,
    ],
    queryFn: () =>
      fetchReport({
        data: {
          companyId: company!.id,
          reportId,
          dateFrom,
          dateTo,
          employeeId: employeeId === "all" ? null : employeeId,
          department: department.trim() || null,
          payScheduleId: payScheduleId === "all" ? null : payScheduleId,
        },
      }),
    enabled: Boolean(company?.id && canView && catalogQ.isSuccess && catalogQ.data.available),
  });

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const e of catalogQ.data?.employees ?? []) {
      const d = e.department?.trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalogQ.data?.employees]);

  const reportData = reportQ.data;
  const result = reportData && reportData.available && reportData.result ? reportData.result : null;
  const currency = company?.base_currency ?? "GBP";

  const exportCsv = () => {
    if (!result || !company) return;
    const headers = result.columns.map((c) => c.label);
    const rows = result.rows.map((row) =>
      result.columns.map((col) => {
        const v = row[col.key];
        if (MONEY_KEYS.has(col.key) && typeof v === "number") {
          return csvMoney(v, currency);
        }
        return v ?? "";
      }),
    );
    if (result.totals) {
      rows.push(
        result.columns.map((col) => {
          const v = result.totals![col.key];
          if (MONEY_KEYS.has(col.key) && typeof v === "number") {
            return csvMoney(v, currency);
          }
          return v ?? "";
        }),
      );
    }
    const csv = toCsv(
      {
        company: company.name,
        report: result.title,
        period: `${dateFrom} – ${dateTo}`,
        currency,
        basis: PAYROLL_REPORT_STATUS_FOOTNOTE,
      },
      headers,
      rows,
    );
    downloadCsv(csvFilename(result.title, dateTo), csv);
  };

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Payroll reports" description="Operational payroll reporting.">
        <EmptyState
          title="No payroll report access"
          description="Ask an organisation administrator for the payroll.reports.view permission."
        />
      </ListWorkspace>
    );
  }
  if (catalogQ.isPending) return <LoadingState />;
  if (catalogQ.isError) {
    return (
      <ErrorState
        title="Could not load payroll reports"
        description={friendlyAuthError(catalogQ.error)}
        onRetry={() => catalogQ.refetch()}
      />
    );
  }

  const catalog = catalogQ.data;
  const selectedDef = catalog.reports.find((r) => r.id === reportId);

  return (
    <ListWorkspace
      title="Payroll reports"
      description="Approved and posted payroll runs with filters by period, employee, department and schedule."
      actions={
        result ? (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              disabled={result.rows.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print / PDF
            </Button>
          </div>
        ) : null
      }
      subnav={<PayrollSubnav current="reports" />}
    >
      {!catalog.available ? (
        <Alert>
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{catalog.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4 print:space-y-2">
          <div className="print:hidden">
            <TableCard>
              <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 lg:col-span-3">
                  <Label htmlFor="payroll-report-type">Report</Label>
                  <RecordLookupSelect
                    value={reportId}
                    onValueChange={(v) => setReportId(v as PayrollReportId)}
                  >
                    <SelectTrigger id="payroll-report-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.reports.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                  {selectedDef ? (
                    <p className="text-sm text-muted-foreground">{selectedDef.description}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payroll-report-from">Period end from</Label>
                  <Input
                    id="payroll-report-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payroll-report-to">Period end to</Label>
                  <Input
                    id="payroll-report-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payroll-report-schedule">Pay schedule</Label>
                  <RecordLookupSelect value={payScheduleId} onValueChange={setPayScheduleId}>
                    <SelectTrigger id="payroll-report-schedule">
                      <SelectValue placeholder="All schedules" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All schedules</SelectItem>
                      {catalog.schedules.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payroll-report-employee">Employee</Label>
                  <RecordLookupSelect value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger id="payroll-report-employee">
                      <SelectValue placeholder="All employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All employees</SelectItem>
                      {catalog.employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.employee_number} — {e.first_name} {e.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payroll-report-department">Department</Label>
                  <RecordLookupSelect
                    value={department || "all"}
                    onValueChange={(v) => setDepartment(v === "all" ? "" : v)}
                  >
                    <SelectTrigger id="payroll-report-department">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
              </div>
            </TableCard>
          </div>

          {reportQ.isPending ? (
            <LoadingState />
          ) : reportQ.isError ? (
            <ErrorState
              title="Could not run report"
              description={friendlyAuthError(reportQ.error)}
              onRetry={() => reportQ.refetch()}
            />
          ) : result ? (
            <ReportTable
              title={result.title}
              columns={result.columns}
              rows={result.rows}
              totals={result.totals}
              footnotes={result.footnotes}
              currency={currency}
              fmt={fmt}
            />
          ) : null}
        </div>
      )}
    </ListWorkspace>
  );
}

function ReportTable({
  title,
  columns,
  rows,
  totals,
  footnotes,
  currency,
  fmt,
}: {
  title: string;
  columns: PayrollReportColumn[];
  rows: PayrollReportRow[];
  totals: PayrollReportRow | null;
  footnotes: string[];
  currency: string;
  fmt: ReturnType<typeof useFormat>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No rows for this report"
        description="Try widening the date range or clearing employee and department filters."
      />
    );
  }

  return (
    <TableCard>
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {footnotes.map((note) => (
          <p key={note} className="mt-1 text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.align === "right" ? "text-right" : undefined}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx}>
              {columns.map((col) => {
                const raw = row[col.key];
                const runId = row["runId"];
                const isRunLink = col.key === "runNumber" && typeof runId === "string" && runId;
                return (
                  <TableCell
                    key={col.key}
                    className={col.align === "right" ? "text-right tabular-nums" : undefined}
                  >
                    {isRunLink ? (
                      <Link
                        to="/payroll/runs/$runId"
                        params={{ runId }}
                        className="font-medium text-primary hover:underline print:text-foreground print:no-underline"
                      >
                        {formatCell(col.key, raw as string | number, fmt, currency)}
                      </Link>
                    ) : (
                      formatCell(col.key, raw as string | number, fmt, currency)
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          {totals ? (
            <TableRow className="bg-muted/50 font-medium">
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={col.align === "right" ? "text-right tabular-nums" : undefined}
                >
                  {formatCell(
                    col.key,
                    totals[col.key] as string | number | undefined,
                    fmt,
                    currency,
                  )}
                </TableCell>
              ))}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </TableCard>
  );
}
