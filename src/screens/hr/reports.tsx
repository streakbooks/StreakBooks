import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  exportHrEmployeeDirectory, previewHrEmployeeImport, runHrReport,
} from "@/lib/hr/insights.functions";
import { HR_REPORT_IDS, HR_REPORT_LABELS, type HrReportId } from "@/lib/hr/insights-types";
import { csvFilename, downloadCsv, toCsv } from "@/lib/reports/csv";

export function HrReportsPage() {
  const { company, isPending } = useActiveCompany();
  const canReportsView = useCanDo("hr.reports.view");
  const canHrView = useCanDo("hr.view");
  const canReports = canReportsView || canHrView;
  const canImport = useCanDo("hr.employees.manage");
  const runReport = useServerFn(runHrReport);
  const exportDir = useServerFn(exportHrEmployeeDirectory);
  const previewImport = useServerFn(previewHrEmployeeImport);

  const today = new Date().toISOString().slice(0, 10);
  const [reportId, setReportId] = useState<HrReportId>("headcount_by_department");
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [dateTo, setDateTo] = useState(today);
  const [importText, setImportText] = useState("employeeNumber,firstName,lastName,email\n");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewImport>> | null>(null);

  const reportQ = useQuery({
    queryKey: ["hr-report", company?.id, reportId, dateFrom, dateTo],
    queryFn: () => runReport({ data: { companyId: company!.id, reportId, dateFrom, dateTo } }),
    enabled: Boolean(company?.id) && canReports,
    retry: false,
  });

  const exportM = useMutation({
    mutationFn: () => exportDir({ data: { companyId: company!.id } }),
    onSuccess: (data) => {
      const headers = [
        "employeeNumber","firstName","lastName","email","status","hireDate","terminationDate",
        "department","designation","location","managerEmployeeNumber","workArrangement",
      ];
      const rows = data.items.map((r) => headers.map((h) => (r as Record<string, string | null>)[h] ?? ""));
      downloadCsv(
        csvFilename("hr-employees", today),
        toCsv(
          { company: company!.name || company!.id, report: "HR employee directory", period: today, currency: company?.base_currency ?? "USD" },
          headers,
          rows,
        ),
      );
      toast.success(`Exported ${data.items.length} employees`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const previewM = useMutation({
    mutationFn: async () => {
      const lines = importText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error("Paste a CSV header plus at least one data row");
      const headers = lines[0]!.split(",").map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        const obj: Record<string, string | null> = {};
        headers.forEach((h, i) => { obj[h] = cols[i] ?? null; });
        return obj;
      });
      return previewImport({ data: { companyId: company!.id, rows } });
    },
    onSuccess: (res) => { setPreview(res); toast.success("Dry-run complete"); },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const columns = reportQ.data?.columns ?? [];
  const rows = reportQ.data?.rows ?? [];
  const reportCsv = useMemo(() => {
    if (!company || columns.length === 0) return null;
    return toCsv(
      {
        company: company.name || company.id,
        report: HR_REPORT_LABELS[reportId],
        period: `${dateFrom} → ${dateTo}`,
        currency: company.base_currency ?? "USD",
      },
      columns.map((c) => c.label),
      rows.map((r) => columns.map((c) => r[c.key] ?? "")),
    );
  }, [company, columns, rows, reportId, dateFrom, dateTo]);

  if (isPending) return <LoadingState />;
  if (!company) return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canReports) {
    return (
      <ListWorkspace title="HR Reports" breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "HR Reports" }]}>
        <HrSubnav current="reports" />
        <EmptyState title="No access" description="You need hr.reports.view or hr.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="HR Reports"
      description="Workforce analytics with CSV export. Employee create/update stays Payroll-owned."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "HR Reports" }]}
      actions={
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={exportM.isPending} onClick={() => exportM.mutate()}>
            Export directory CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!reportCsv}
            onClick={() => reportCsv && downloadCsv(csvFilename(`hr-${reportId}`, dateTo), reportCsv)}
          >
            Export report CSV
          </Button>
        </div>
      }
    >
      <HrSubnav current="reports" />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>Report</Label>
          <Select value={reportId} onValueChange={(v) => setReportId(v as HrReportId)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {HR_REPORT_IDS.map((id) => <SelectItem key={id} value={id}>{HR_REPORT_LABELS[id]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {reportQ.isPending ? <LoadingState /> : reportQ.isError ? (
        <ErrorState title="Could not run report" description={friendlyAuthError(reportQ.error)} onRetry={() => void reportQ.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No rows" description="No data for this report and date range." />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>{columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  {columns.map((c) => <TableCell key={c.key}>{r[c.key] ?? "—"}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {canImport ? (
        <section className="mt-8 space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Import dry-run</h2>
          <p className="text-sm text-muted-foreground">
            Preview CSV rows only. Creates/updates stay on the shared Payroll employee master.
          </p>
          <Textarea className="min-h-28 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} />
          <Button type="button" disabled={previewM.isPending} onClick={() => previewM.mutate()}>Run dry-run</Button>
          {preview ? (
            <div className="space-y-2 text-sm">
              <p>Accepted {preview.accepted} · Warnings {preview.warnings} · Errors {preview.errors}</p>
              <p className="text-muted-foreground">{preview.note}</p>
              {preview.issues.length > 0 ? (
                <TableCard>
                  <Table>
                    <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Level</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {preview.issues.slice(0, 50).map((i, idx) => (
                        <TableRow key={idx}><TableCell>{i.row}</TableCell><TableCell>{i.level}</TableCell><TableCell>{i.message}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCard>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </ListWorkspace>
  );
}