import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAutomationContext, readAutomation } from "@/lib/platform/automation.functions";
import type { AutomationModule, AutomationRow } from "@/lib/platform/automation";
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
import { OpsField, EnumField, ErrorState } from "./PlatformOperationForms";
import { AutomationAction, RuleEditor } from "./PlatformAutomationForms";
const label: Record<AutomationModule, string> = {
  jobs: "Background jobs",
  rules: "Alert rules",
  events: "Alert history",
};
const statuses: Record<AutomationModule, string[]> = {
  jobs: ["all", "queued", "running", "succeeded", "failed", "cancelled"],
  rules: ["all", "unconfigured", "paused", "unknown", "quiet", "firing"],
  events: ["all", "open", "resolved"],
};
const human = (v: string) => v.replaceAll("_", " ");
const time = (v: string | null | undefined) => (v ? formatConsoleInstant(v) : "Not recorded");
export function PlatformAutomation({
  module,
  item,
  onOpen,
  onClose,
  onModule,
}: {
  module: AutomationModule;
  item?: string | undefined;
  onOpen: (id: string) => void;
  onClose: () => void;
  onModule: (module: AutomationModule) => void;
}) {
  const load = useServerFn(getAutomationContext);
  const read = useServerFn(readAutomation);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{
    row: AutomationRow;
    kind: "edit" | "state" | "cancel";
  } | null>(null);
  const [kind, setKind] = useState("check_operations");
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const context = useQuery({
    queryKey: ["platform", "automation", "context"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 15000,
  });
  const access = context.data?.modules.find((m) => m.key === module);
  const list = useQuery({
    queryKey: ["platform", "automation", module, term, status, page],
    queryFn: () => read({ data: { module, search: term, status, page } }),
    enabled: !!access,
    retry: false,
    refetchInterval: 15000,
  });
  if (context.isPending) return <p role="status">Verifying automation permissions…</p>;
  if (context.isError)
    return <ErrorState error={context.error} retry={() => void context.refetch()} />;
  const worker = context.data!.worker;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Jobs and operational alerts</h1>
        <p className="text-sm text-muted-foreground">
          Measured platform operations · {viewerTimeZone()}
        </p>
      </div>
      <section aria-label="Scheduler status" className="space-y-2 rounded-lg border bg-card p-4">
        <p className="font-medium">Scheduler: {human(worker.state)}</p>
        <p className="text-sm">
          Last completion: {time(worker.finishedAt)} · {worker.lastJobs ?? "Unknown"} jobs processed
          in that tick.
        </p>
        <p className="text-xs text-muted-foreground">
          The scheduler checks each minute. A recent tick records scheduler execution; individual
          job results and retry failures appear below.
        </p>
        {!worker.configured || worker.state === "stale" ? (
          <p role="alert" className="text-sm text-destructive">
            The scheduler needs attention. Queued work must not be treated as completed.
          </p>
        ) : null}
      </section>
      <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Automation workspaces">
        {context.data!.modules.map((m) => (
          <Button
            key={m.key}
            variant={module === m.key ? "default" : "ghost"}
            onClick={() => {
              setPage(0);
              setStatus("all");
              setSearch("");
              setTerm("");
              setCreate(false);
              setAction(null);
              onModule(m.key);
            }}
          >
            {m.label}
          </Button>
        ))}
      </nav>
      {!access ? (
        <p role="alert">Your role cannot view this automation workspace.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <OpsField label={`Search ${label[module].toLowerCase()}`}>
                {(id) => (
                  <Input
                    id={id}
                    value={search}
                    maxLength={160}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                )}
              </OpsField>
            </div>
            <div className="w-44">
              <EnumField
                label="Status"
                value={status}
                options={statuses[module]}
                onChange={(v) => {
                  setStatus(v);
                  setPage(0);
                }}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void list.refetch();
                void context.refetch();
              }}
            >
              Refresh
            </Button>
            {access.canManage && module !== "events" ? (
              <Button onClick={() => setCreate(true)}>
                {module === "jobs" ? "Queue implemented job" : "Create alert rule"}
              </Button>
            ) : null}
          </div>
          {list.isPending ? (
            <p role="status">Loading {label[module].toLowerCase()}…</p>
          ) : list.isError ? (
            <ErrorState error={list.error} retry={() => void list.refetch()} />
          ) : (
            <>
              <div className="space-y-3">
                {list.data?.rows.map((r) => (
                  <article className="space-y-3 rounded-lg border bg-card p-4" key={r.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{r.name || r.id}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {module === "jobs" && !r.kind
                            ? "Unconfigured legacy record · execution unverified"
                            : human(r.status || r.state || "unknown")}
                          {r.severity ? ` · ${r.severity}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {module === "jobs" ? (
                          <Link
                            className="text-sm text-primary underline"
                            to="/platform/automation"
                            search={{ module: "jobs", item: r.id }}
                          >
                            Attempt history
                          </Link>
                        ) : null}
                        {access.canManage && module === "jobs" && r.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAction({ row: r, kind: "cancel" })}
                          >
                            Close failed job
                          </Button>
                        ) : null}
                        {access.canManage ? (
                          module === "rules" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAction({ row: r, kind: "edit" })}
                              >
                                Configure rule
                              </Button>
                              {r.metric ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAction({ row: r, kind: "state" })}
                                >
                                  {r.enabled ? "Pause rule" : "Enable rule"}
                                </Button>
                              ) : null}
                            </>
                          ) : module === "jobs" &&
                            (r.status === "queued" ||
                              (r.status === "failed" && r.kind && (r.max_attempts ?? 0) < 30)) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAction({ row: r, kind: "state" })}
                            >
                              {r.status === "failed" ? "Review retry" : "Review cancellation"}
                            </Button>
                          ) : module === "events" && !r.resolved_at && !r.acknowledged_at ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAction({ row: r, kind: "state" })}
                            >
                              Acknowledge alert
                            </Button>
                          ) : null
                        ) : null}
                      </div>
                    </div>
                    {module === "jobs" ? (
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>Handler: {r.kind ? human(r.kind) : "Not configured"}</p>
                        <p>
                          Attempts: {r.attempts ?? 0} / {r.max_attempts ?? 0}
                        </p>
                        <p>Queued: {time(r.created_at)}</p>
                        <p>Last finish: {time(r.finished_at)}</p>
                        {r.status === "queued" ? (
                          <p>Next eligible attempt: {time(r.next_run_at)}</p>
                        ) : null}
                        {r.last_error ? (
                          <p role="status" className="text-destructive">
                            {r.last_error}
                          </p>
                        ) : null}
                      </div>
                    ) : module === "rules" ? (
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>Source: {r.metric ? human(r.metric) : "Not configured"}</p>
                        <p>Fires above: {r.threshold ?? "Unknown"}</p>
                        <p>Last measured count: {r.observed ?? "Unknown"}</p>
                        <p>Observation: {time(r.observed_at)}</p>
                        {r.enabled &&
                        r.observed_at &&
                        Date.now() - Date.parse(r.observed_at) > 180000 ? (
                          <p role="status" className="text-destructive">
                            Observation is stale; current state is unverified.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>
                          Measured: {r.observed} · Threshold: {r.threshold}
                        </p>
                        <p>Observations in this episode: {r.observations}</p>
                        <p>First observed: {time(r.first_seen_at)}</p>
                        <p>Last observed: {time(r.last_seen_at)}</p>
                        <p>Acknowledged: {time(r.acknowledged_at)}</p>
                        <p>Resolved: {time(r.resolved_at)}</p>
                        {r.resolution_reason ? <p>{r.resolution_reason}</p> : null}
                        {r.quiet_hours ? <p>Recorded during UTC quiet hours.</p> : null}
                      </div>
                    )}
                  </article>
                ))}
                {!list.data?.rows.length ? (
                  <p role="status" className="rounded border p-6 text-muted-foreground">
                    No matching {label[module].toLowerCase()}.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {list.data?.total ?? 0} records · Page {page + 1}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!page || list.isFetching}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    disabled={list.isFetching || (page + 1) * 25 >= (list.data?.total ?? 0)}
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
              <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {module === "jobs" ? "Queue implemented job" : "Configure measured alert"}
                  </DialogTitle>
                  <DialogDescription>
                    {module === "jobs"
                      ? "The scheduler executes supported handlers and records every attempt. Queueing itself is not successful execution."
                      : "Create a paused rule, review it, then enable measurement. History is retained."}
                  </DialogDescription>
                </DialogHeader>
                {module === "jobs" ? (
                  <AutomationAction
                    command="jobs.enqueue"
                    payload={{ kind }}
                    label="Queue job"
                    onSaved={() => setCreate(false)}
                  >
                    <EnumField
                      label="Implemented handler"
                      value={kind}
                      options={["check_operations", "expire_support"]}
                      onChange={setKind}
                    />
                  </AutomationAction>
                ) : (
                  <RuleEditor onSaved={() => setCreate(false)} />
                )}
              </DialogContent>
            </Dialog>
          ) : null}
          {action ? (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setAction(null);
              }}
            >
              <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {action.kind === "edit" ? "Configure alert rule" : "Review operational action"}
                  </DialogTitle>
                  <DialogDescription>
                    {action.row.name || action.row.id} · Current record revision{" "}
                    {action.row.row_version ?? "—"}
                  </DialogDescription>
                </DialogHeader>
                {action.kind === "edit" ? (
                  <RuleEditor record={action.row} onSaved={() => setAction(null)} />
                ) : (
                  <AutomationAction
                    command={
                      module === "jobs"
                        ? action.row.status === "failed" && action.kind !== "cancel"
                          ? "jobs.retry"
                          : "jobs.cancel"
                        : module === "rules"
                          ? action.row.enabled
                            ? "rules.disable"
                            : "rules.enable"
                          : "alerts.ack"
                    }
                    payload={{
                      id: action.row.id,
                      ...(module !== "events" ? { row_version: action.row.row_version } : {}),
                    }}
                    label="Confirm action"
                    onSaved={() => setAction(null)}
                  >
                    <p className="text-sm">
                      {module === "jobs"
                        ? action.row.status === "failed" && action.kind !== "cancel"
                          ? "Retry adds five bounded attempts, up to 30 total, and retains the existing attempt history."
                          : "Close this queued or failed record without claiming successful execution. Its attempt history stays available. A scheduled handler can resume on the next tick after the dead letter is closed."
                        : module === "rules"
                          ? action.row.enabled
                            ? "Pause measurement and close the current episode with a recorded reason."
                            : "Start measurement on the next scheduler run. No observation will be assumed before that run."
                          : "Record that an operator has seen this alert. Acknowledgment does not claim the underlying problem is resolved."}
                    </p>
                  </AutomationAction>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction(null);
                    void list.refetch();
                  }}
                >
                  Reload latest records
                </Button>
              </DialogContent>
            </Dialog>
          ) : null}
          {item && module === "jobs" ? <JobRuns id={item} onClose={onClose} /> : null}
        </>
      )}
    </div>
  );
}
function JobRuns({ id, onClose }: { id: string; onClose: () => void }) {
  const read = useServerFn(readAutomation);
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["platform", "automation", "runs", id, page],
    queryFn: () => read({ data: { module: "runs", id, page } }),
    retry: false,
    refetchInterval: 15000,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Job attempt history</DialogTitle>
          <DialogDescription>
            {id} · {viewerTimeZone()}
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">Loading attempts…</p>
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            <div className="space-y-3">
              {query.data?.rows.map((r) => (
                <article key={r.id} className="space-y-2 rounded border p-4 text-sm">
                  <p className="font-medium">
                    Attempt {r.attempt} · {r.status}
                  </p>
                  <p>Started: {time(r.started_at)}</p>
                  <p>Finished: {time(r.finished_at)}</p>
                  {r.error_code ? (
                    <p className="text-destructive">Handler failure code: {r.error_code}</p>
                  ) : null}
                  {r.result ? (
                    <dl className="grid grid-cols-2 gap-2">
                      {Object.entries(r.result).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-muted-foreground">{human(key)}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </article>
              ))}
              {!query.data?.total ? <p role="status">No execution attempts recorded.</p> : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
                Previous attempts
              </Button>
              <Button
                variant="outline"
                disabled={(page + 1) * 25 >= (query.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                More attempts
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
