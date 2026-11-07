import { getReportingBasis } from "@/lib/reports/accounting-basis.functions";
import { withSavedReportBasis, type AccountingBasis } from "@/lib/reports/accounting-basis";
import { parseReportSearch } from "@/lib/reports/search";
import { useReportActivity } from "@/hooks/use-report-activity";
import { ReportingFeatureGate } from "@/components/reports/ReportingFeatureGate";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { fiscalYearStart, todayIso } from "@/lib/accounting/fiscal-year";
import {
  customDefinitionSchema,
  starterDefinition,
  type CustomDefinition,
} from "@/lib/reports/custom-definition";
import type { SavedReport } from "@/lib/reports/saved-report";
import type { ReportDocument } from "@/lib/reports/report-document";
import {
  getReportAccounts,
  getReportFilterOptions,
  getSavedReport,
  previewCustomReport,
  exportReportDocument,
} from "@/lib/reports/ecosystem.functions";
import { saveReportView, updateSavedReportView } from "@/lib/reports/report-views.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { CustomReportDesigner } from "@/components/reports/CustomReportDesigner";
import { DocumentPreview } from "@/components/reports/DocumentPreview";
import { downloadReportFile } from "@/lib/reports/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
export const Route = createFileRoute("/_authenticated/reports/builder/$viewId")({
  component: BuilderPage,
  validateSearch: parseReportSearch,
  head: () => ({ meta: [{ title: "Report builder — LinkBooks" }] }),
});
function BuilderPage() {
  const { company, isPending } = useActiveCompany();
  const { viewId } = Route.useParams();
  const openingPeriod = Route.useSearch();
  const accountsFn = useServerFn(getReportAccounts),
    load = useServerFn(getSavedReport);
  const accounts = useQuery({
    queryKey: ["report-builder-accounts", company?.id],
    enabled: !!company,
    queryFn: () => accountsFn({ data: { companyId: company!.id } }),
  });
  const loadBasis = useServerFn(getReportingBasis);
  const companyBasis = useQuery({
    queryKey: ["reporting-basis", company?.id],
    enabled: Boolean(company),
    queryFn: () => loadBasis({ data: { companyId: company!.id } }),
  });
  const filterOptionsFn = useServerFn(getReportFilterOptions);
  const filterOptions = useQuery({
    queryKey: ["report-filter-options", company?.id],
    enabled: !!company,
    queryFn: () => filterOptionsFn({ data: { companyId: company!.id } }),
  });
  const saved = useQuery({
    queryKey: ["saved-report", company?.id, viewId],
    enabled: !!company && viewId !== "new",
    retry: false,
    queryFn: async () =>
      JSON.parse(await load({ data: { companyId: company!.id, viewId } })) as SavedReport,
  });
  if (
    isPending ||
    accounts.isPending ||
    companyBasis.isPending ||
    filterOptions.isPending ||
    (viewId !== "new" && saved.isPending)
  )
    return <LoadingState />;
  if (!company)
    return (
      <EmptyState
        title="Choose an organisation"
        description="Open an organisation to build a report."
      />
    );
  if (accounts.isError || filterOptions.isError || saved.isError || companyBasis.isError)
    return (
      <ErrorState
        title="Could not load report builder"
        description={friendlyAuthError(
          accounts.error ?? filterOptions.error ?? saved.error ?? companyBasis.error,
        )}
        onRetry={() => {
          void accounts.refetch();
          void companyBasis.refetch();
          void filterOptions.refetch();
          if (viewId !== "new") void saved.refetch();
        }}
      />
    );
  return (
    <ReportingFeatureGate companyId={company.id}>
      <BuilderEditor
        key={`${company.id}-${viewId}-${saved.data?.updated_at ?? "new"}-${openingPeriod.from ?? ""}-${openingPeriod.to ?? ""}`}
        companyId={company.id}
        defaultBasis={openingPeriod.basis ?? companyBasis.data ?? "accrual"}
        defaultFrom={fiscalYearStart(
          todayIso(),
          company.fiscal_year_end_month,
          company.fiscal_year_end_day ?? 31,
        )}
        accounts={accounts.data ?? []}
        filterOptions={filterOptions.data!}
        saved={saved.data}
      />
    </ReportingFeatureGate>
  );
}
function BuilderEditor({
  companyId,
  defaultFrom,
  defaultBasis,
  accounts,
  filterOptions,
  saved,
}: {
  companyId: string;
  defaultFrom: string;
  defaultBasis: AccountingBasis;
  accounts: Awaited<ReturnType<typeof getReportAccounts>>;
  filterOptions: Awaited<ReturnType<typeof getReportFilterOptions>>;
  saved?: SavedReport | undefined;
}) {
  const navigate = useNavigate(),
    client = useQueryClient();
  const create = useServerFn(saveReportView),
    update = useServerFn(updateSavedReportView),
    preview = useServerFn(previewCustomReport),
    exportFn = useServerFn(exportReportDocument);
  const [definition, setDefinition] = useState<CustomDefinition>(() =>
    saved?.config["_builder"]
      ? customDefinitionSchema.parse(withSavedReportBasis(saved.config, defaultBasis)["_builder"])
      : { ...starterDefinition(), basis: defaultBasis },
  );
  const openingPeriod = Route.useSearch();
  const [from, setFrom] = useState(
      String(openingPeriod.from ?? saved?.config["from"] ?? defaultFrom),
    ),
    [to, setTo] = useState(String(openingPeriod.to ?? saved?.config["to"] ?? todayIso()));
  useReportActivity(companyId, saved?.report_id, saved?.id, from, to);
  const [document, setDocument] = useState<ReportDocument | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const change = (next: CustomDefinition) => {
    setDefinition(next);
    setDocument(null);
  };
  const currentKey = JSON.stringify({ definition, from, to });
  const previewMutation = useMutation({
    mutationFn: () => preview({ data: { companyId, from, to, definition } }),
    onSuccess: (result) => {
      setDocument(JSON.parse(result) as ReportDocument);
      setPreviewKey(currentKey);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const save = useMutation({
    mutationFn: async (): Promise<{ id?: string; ok?: boolean }> => {
      customDefinitionSchema.parse(definition);
      const config = {
        ...(saved?.config ?? {}),
        from,
        to,
        basis: definition.basis,
        _builder: definition,
      };
      return saved
        ? update({
            data: {
              companyId,
              viewId: saved.id,
              updatedAt: saved.updated_at,
              name: definition.title,
              config,
              isFavourite: saved.is_favourite,
            },
          })
        : create({
            data: { companyId, reportId: "profit-and-loss", name: definition.title, config },
          });
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["report-library", companyId] });
      toast.success("Report definition saved");
      if (!saved && "id" in result)
        void navigate({ to: "/reports/builder/$viewId", params: { viewId: result.id! } });
      else await client.invalidateQueries({ queryKey: ["saved-report", companyId] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const exporting = useMutation({
    mutationFn: (format: "pdf" | "xlsx" | "csv") =>
      exportFn({ data: { companyId, viewId: saved!.id, from, to, format } }),
    onSuccess: downloadReportFile,
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const dirty =
    JSON.stringify(saved?.config["_builder"]) !== JSON.stringify(definition) ||
    String(saved?.config["from"]) !== from ||
    String(saved?.config["to"]) !== to;
  return (
    <ListWorkspace
      title="Custom report builder"
      description="Build financial reports from your chart of accounts and posted-ledger balances."
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <Label htmlFor="builder-from">From</Label>
          <Input
            id="builder-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setDocument(null);
            }}
          />
        </div>
        <div>
          <Label htmlFor="builder-to">To</Label>
          <Input
            id="builder-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setDocument(null);
            }}
          />
        </div>
        <Button
          variant="outline"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          Recalculate preview
        </Button>
        <Button
          disabled={save.isPending || !document || previewKey !== currentKey}
          onClick={() => save.mutate()}
        >
          Save report
        </Button>
        <Button asChild variant="ghost">
          <Link to="/reports">Cancel</Link>
        </Button>
        {saved &&
          !dirty &&
          ["pdf", "xlsx", "csv"].map((format) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              disabled={exporting.isPending}
              onClick={() => exporting.mutate(format as "pdf" | "xlsx" | "csv")}
            >
              {format.toUpperCase()}
            </Button>
          ))}
      </div>
      <div className="print:hidden">
        <CustomReportDesigner
          definition={definition}
          onChange={change}
          accounts={accounts}
          filterOptions={filterOptions}
        />
      </div>
      {previewMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyAuthError(previewMutation.error)}
        </p>
      )}
      {previewMutation.isPending && <LoadingState />}
      {document && <DocumentPreview document={document} />}
    </ListWorkspace>
  );
}
