import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpsContext, listOps } from "@/lib/platform/operations.functions";
import { opsTitle } from "@/lib/platform/operations";
import type { OpsModule } from "@/lib/platform/operations";
import { formatConsoleInstant, viewerTimeZone } from "@/lib/platform/console-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { OpsField, EnumField, OpsEditor } from "./PlatformOperationForms";
import { OpsDetails } from "./PlatformOperationDetails";
const labels: Record<OpsModule, string> = {
  cases: "Service cases",
  incidents: "Incidents",
  segments: "Business segments",
  releases: "Release records",
};
const filters: Record<OpsModule, string[]> = {
  cases: ["all", "open", "closed", "triage", "in_progress", "waiting_customer"],
  incidents: ["all", "open", "resolved", "investigating", "identified", "monitoring"],
  segments: ["all", "active", "archived"],
  releases: ["all", "planned", "recorded", "rolled_back"],
};
const human = (value: string) => value.replaceAll("_", " ");
export function PlatformOperations({
  module,
  item,
  company,
  onOpen,
  onModule,
  onClose,
}: {
  module: OpsModule;
  item?: string | undefined;
  company?: string | undefined;
  onOpen: (id: string) => void;
  onModule: (module: OpsModule) => void;
  onClose: () => void;
}) {
  const load = useServerFn(getOpsContext);
  const list = useServerFn(listOps);
  const context = useQuery({
    queryKey: ["platform", "operations", "context"],
    queryFn: () => load(),
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [create, setCreate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const access = context.data?.modules.find((m) => m.key === module);
  const query = useQuery({
    queryKey: ["platform", "operations", module, term, status, company, page],
    queryFn: () =>
      list({
        data: {
          module,
          search: term,
          status,
          company: module === "cases" ? (company ?? null) : null,
          page,
        },
      }),
    enabled: !!access,
    retry: false,
  });
  if (context.isPending) return <p role="status">Verifying operations access…</p>;
  if (context.isError) {
    return <QueryErrorState queries={[context]} title="Could not load operations access" />;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operations workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer support and platform change history · {viewerTimeZone()}
        </p>
      </div>
      <nav aria-label="Operations workspaces" className="flex flex-wrap gap-2 border-b pb-3">
        {context.data?.modules.map((m) => (
          <Button
            key={m.key}
            variant={module === m.key ? "default" : "ghost"}
            onClick={() => {
              setPage(0);
              setStatus("all");
              setSearch("");
              setTerm("");
              setCreate(false);
              onModule(m.key);
            }}
          >
            {m.label}
          </Button>
        ))}
      </nav>
      {!access ? (
        <div role="alert" className="rounded-lg border p-6">
          Your role cannot open {labels[module]}. Choose an authorized workspace above.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <OpsField label={`Search ${labels[module].toLowerCase()}`}>
                {(id) => (
                  <Input
                    id={id}
                    value={search}
                    maxLength={160}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search names, references or IDs"
                  />
                )}
              </OpsField>
            </div>
            <div className="w-48">
              <EnumField
                label="Status"
                value={status}
                options={filters[module]}
                onChange={(v) => {
                  setStatus(v);
                  setPage(0);
                }}
              />
            </div>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Refresh
            </Button>
            {access.canManage ? (
              <Button onClick={() => setCreate(true)}>
                Create{" "}
                {module === "cases"
                  ? "case"
                  : module === "incidents"
                    ? "incident"
                    : module === "segments"
                      ? "segment"
                      : "release record"}
              </Button>
            ) : null}
          </div>
          {module === "cases" && company ? (
            <p className="text-sm text-muted-foreground">
              Showing service cases for business {company}.
            </p>
          ) : null}
          {module === "releases" ? (
            <p className="rounded-md bg-muted p-3 text-sm">
              Record plans, verified change references and recovery evidence here. Deployment
              connections are not configured.
            </p>
          ) : null}
          {query.isPending ? (
            <p role="status">Loading {labels[module].toLowerCase()}…</p>
          ) : query.isError ? (
            <QueryErrorState queries={[query]} title={`Could not load ${labels[module]}`} />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      {[
                        "Record",
                        "Status",
                        module === "segments" ? "Active businesses" : "Context",
                        "Last recorded change",
                      ].map((h) => (
                        <th className="p-3 font-medium" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data?.rows.map((r) => (
                      <tr className="border-b last:border-0" key={r.id}>
                        <td className="p-3">
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            to="/platform/operations"
                            search={{ module, item: r.id, company }}
                          >
                            {opsTitle(r)}
                          </Link>
                          {r.priority || r.severity ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {r.priority || r.severity}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {human(r.status || r.stage || "unknown")}
                          {r.status === "open" && r.phase ? (
                            <p className="text-xs text-muted-foreground">{human(r.phase)}</p>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {module === "segments"
                            ? r.members
                            : r.company_name || r.owner_name || r.version || "Unassigned"}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {formatConsoleInstant(r.updated_at || r.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!query.data?.rows.length ? (
                  <p role="status" className="p-8 text-center text-muted-foreground">
                    No matching {labels[module].toLowerCase()}.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-between">
                <p role="status" className="text-sm text-muted-foreground">
                  {query.data?.total ?? 0} records · Page {page + 1}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!page || query.isFetching}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    disabled={query.isFetching || (page + 1) * 25 >= (query.data?.total ?? 0)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
          {create ? (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setCreate(false);
              }}
            >
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    Create{" "}
                    {module === "cases"
                      ? "service case"
                      : module === "incidents"
                        ? "incident"
                        : module === "segments"
                          ? "business segment"
                          : "release plan"}
                  </DialogTitle>
                  <DialogDescription>
                    Stored with the acting staff member, reason and time.
                  </DialogDescription>
                </DialogHeader>
                <OpsEditor
                  module={module}
                  company={company}
                  onSaved={(id) => {
                    setCreate(false);
                    onOpen(id);
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
          {item ? (
            <OpsDetails
              key={`${module}:${item}`}
              module={module}
              id={item}
              canManage={access.canManage}
              onClose={onClose}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
