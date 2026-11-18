import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getProjectProfitability } from "@/lib/projects/projects.functions";
import { budgetUsedPercent, marginPercent, totalsOf } from "@/lib/projects/projects";
import { ProjectPanel } from "@/components/create-new/ProjectPanel";
import { StatementBasisSelect } from "@/components/reports/StatementBasisSelect";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/projects")({
  validateSearch: (raw: Record<string, unknown>): { create?: boolean } => {
    const create =
      raw["create"] === true ||
      raw["create"] === "true" ||
      raw["create"] === "1" ||
      raw["create"] === 1;
    return create ? { create: true } : {};
  },
  head: () => ({ meta: [{ title: "Projects — LinkBooks" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const { create: forceCreate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const base = company?.base_currency ?? "GBP";
  const fetchReport = useServerFn(getProjectProfitability);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showCreate, setShowCreate] = useState(Boolean(forceCreate));
  const [basisChoice, setBasisChoice] = useState<{
    companyId: string;
    basis: "accrual" | "cash";
  } | null>(null);
  const basis = basisChoice && basisChoice.companyId === companyId ? basisChoice.basis : undefined;
  useEffect(() => {
    if (!forceCreate) return;
    setShowCreate(true);
    void navigate({ search: { create: undefined }, replace: true });
  }, [forceCreate, navigate]);

  const query = useQuery({
    queryKey: ["project-profitability", companyId, from, to, basis],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchReport({
        data: {
          companyId: companyId!,
          from: from || null,
          to: to || null,
          ...(basis ? { basis } : {}),
        },
      }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  const rows = query.data?.rows ?? [];
  const totals = totalsOf(rows);
  const money = (n: number) => fromMinorUnits(n, base);

  return (
    <ListWorkspace
      title="Projects"
      description={`Profit by project in ${base}, from posted figures. Tag invoices, bills and bank lines to a project from their own screens. Untagged activity is not included.`}
      actions={
        <>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            New project
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/imports" search={{ module: "projects" }}>
              Import projects
            </Link>
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="pp-from">From</Label>
          <Input id="pp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pp-to">To</Label>
          <Input id="pp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <StatementBasisSelect
          basis={query.data?.basis ?? basis ?? "accrual"}
          report="profit-and-loss"
          onChange={(value) => setBasisChoice({ companyId, basis: value })}
        />
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          onRetry={() => void query.refetch()}
          title="Could not load projects"
          description={friendlyAuthError(query.error)}
        />
      ) : !query.data.available ? (
        <Alert className="mb-6">
          <AlertDescription>
            The project report needs a database update that has not been applied yet.
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project, then tag invoices, bills and bank lines to it."
          action={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              New project
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Costs</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Budget used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const margin = marginPercent(r);
              const used = budgetUsedPercent(r);
              return (
                <TableRow key={r.projectId}>
                  <TableCell>
                    {r.code} — {r.name}
                    {r.unconvertedDocuments > 0 ? (
                      <span className="block text-xs text-destructive">
                        {r.unconvertedDocuments} foreign-currency document
                        {r.unconvertedDocuments === 1 ? "" : "s"} left out: no exchange rate stored.
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{money(r.revenueMinor)}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.costMinor)}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.profitMinor)}</TableCell>
                  <TableCell className="text-right">
                    {margin === null ? "—" : `${margin}%`}
                  </TableCell>
                  <TableCell className="text-right">{used === null ? "—" : `${used}%`}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right font-mono">{money(totals.revenueMinor)}</TableCell>
              <TableCell className="text-right font-mono">{money(totals.costMinor)}</TableCell>
              <TableCell className="text-right font-mono">{money(totals.profitMinor)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {query.data?.basis === "cash"
          ? "Cash revenue and costs follow allocated payment and refund dates, before tax. Partial payments are shared across tagged and untagged source lines. Direct cash transactions retain their project tags."
          : "Revenue and costs use net amounts (before tax) of authorised documents, less credit notes. Bank lines and Create-New documents tagged to a project count their income and expense postings. Drafts and voided documents are excluded."}{" "}
        <Link to="/reports" className="underline">
          All reports
        </Link>
      </p>

      {showCreate ? (
        <div id="projects-new-panel" className="mt-8 max-w-md scroll-mt-24">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">New project</h2>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Close
            </Button>
          </div>
          <ProjectPanel />
        </div>
      ) : null}
    </ListWorkspace>
  );
}
