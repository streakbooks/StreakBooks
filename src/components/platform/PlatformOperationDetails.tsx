import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOpsDetail,
  listOpsMembers,
  previewOpsMembers,
} from "@/lib/platform/operations.functions";
import { opsTitle } from "@/lib/platform/operations";
import type { OpsModule, OpsCommand, OpsRecord, OpsTimeline } from "@/lib/platform/operations";
import { formatConsoleInstant } from "@/lib/platform/console-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { OpsField, EnumField, OpsAction, OpsEditor } from "./PlatformOperationForms";
import { PlatformRecordLookup } from "./PlatformRecordLookup";
const labels: Record<OpsModule, string> = {
  cases: "Service cases",
  incidents: "Incidents",
  segments: "Business segments",
  releases: "Release records",
};
const human = (v: string) => v.replaceAll("_", " ");
export function OpsDetails({
  module,
  id,
  canManage,
  onClose,
}: {
  module: OpsModule;
  id: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const load = useServerFn(getOpsDetail);
  const query = useQuery({
    queryKey: ["platform", "operations", "detail", module, id],
    queryFn: () => load({ data: { module, id } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [mode, setMode] = useState("overview");
  const r = query.data?.record;
  const mutable =
    r &&
    (module === "cases" || module === "incidents"
      ? r.status === "open"
      : module === "segments"
        ? r.status === "active"
        : r.stage === "planned");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{r ? opsTitle(r) : "Operations record"}</DialogTitle>
          <DialogDescription>
            {labels[module]} · {id}
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">Loading record…</p>
        ) : query.isError ? (
          <QueryErrorState queries={[query]} title="Could not load record" />
        ) : r ? (
          <>
            <div className="flex flex-wrap gap-2 border-b pb-3">
              {[
                "overview",
                "history",
                ...(module === "segments" ? ["members"] : []),
                ...(canManage && mutable ? ["edit"] : []),
                ...(canManage ? ["actions"] : []),
              ].map((v) => (
                <Button
                  key={v}
                  variant={mode === v ? "default" : "ghost"}
                  onClick={() => setMode(v)}
                >
                  {human(v)}
                </Button>
              ))}
              <Button className="ml-auto" variant="outline" onClick={() => void query.refetch()}>
                Reload latest
              </Button>
            </div>
            {mode === "overview" ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{human(r.status || r.stage || "unknown")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd>{r.owner_name || r.owner_id || "Unassigned"}</dd>
                  </div>
                  {r.company_id ? (
                    <div>
                      <dt className="text-muted-foreground">Business</dt>
                      <dd>{r.company_name || r.company_id}</dd>
                    </div>
                  ) : null}
                  {r.due_at ? (
                    <div>
                      <dt className="text-muted-foreground">Response deadline</dt>
                      <dd>{formatConsoleInstant(r.due_at)}</dd>
                    </div>
                  ) : null}
                  {r.closed_at || r.resolved_at ? (
                    <div>
                      <dt className="text-muted-foreground">Resolved at</dt>
                      <dd>{formatConsoleInstant((r.closed_at || r.resolved_at)!)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatConsoleInstant(r.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Revision</dt>
                    <dd>{r.row_version}</dd>
                  </div>
                </dl>
                <p className="whitespace-pre-wrap">
                  {r.description || r.summary || "No description recorded."}
                </p>
                {r.change_reference ? <p>Change evidence: {r.change_reference}</p> : null}
                {r.rollback_reference ? <p>Rollback evidence: {r.rollback_reference}</p> : null}
              </div>
            ) : null}
            {mode === "history" ? (
              <OpsHistory
                events={query.data!.timeline}
                record={r}
                canManage={canManage}
                onSaved={() => setMode("history")}
              />
            ) : null}
            {mode === "edit" && canManage && mutable ? (
              <OpsEditor
                key={r.row_version}
                module={module}
                record={r}
                onSaved={() => setMode("overview")}
              />
            ) : null}
            {mode === "members" && module === "segments" ? (
              <SegmentMembers key={r.row_version} record={r} canManage={canManage && !!mutable} />
            ) : null}
            {mode === "actions" && canManage ? (
              <RecordActions
                key={r.row_version}
                module={module}
                record={r}
                onSaved={() => setMode("overview")}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
function OpsHistory({
  events,
  record,
  canManage,
  onSaved,
}: {
  events: OpsTimeline[];
  record: OpsRecord;
  canManage: boolean;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Most recent 100 events. Notes are internal platform records.
      </p>
      {!events.length ? (
        <p>No history recorded.</p>
      ) : (
        events.map((e) => (
          <article className="space-y-2 rounded-lg border p-4 text-sm" key={e.id}>
            <p className="font-medium">
              {human(e.action.split(".").at(-1) || e.action)} ·{" "}
              {e.actor_name || e.actor_id || "System"}
            </p>
            <p className="text-xs text-muted-foreground">{formatConsoleInstant(e.at)}</p>
            <p>{e.reason}</p>
            {e.note ? <p className="whitespace-pre-wrap">{e.note}</p> : null}
            {e.undo_available && canManage ? (
              <OpsAction
                command="segments.undo"
                payload={{ id: record.id, row_version: record.row_version, event_id: e.id }}
                label="Undo membership change"
                onSaved={onSaved}
              />
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
function RecordActions({
  module,
  record: r,
  onSaved,
}: {
  module: OpsModule;
  record: OpsRecord;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const transition: OpsCommand =
    module === "cases"
      ? r.status === "open"
        ? "cases.close"
        : "cases.reopen"
      : module === "incidents"
        ? r.status === "open"
          ? "incidents.resolve"
          : "incidents.reopen"
        : module === "segments"
          ? r.status === "active"
            ? "segments.archive"
            : "segments.restore"
          : r.stage === "planned"
            ? "releases.evidence"
            : "releases.rollback";
  const label =
    module === "releases"
      ? r.stage === "planned"
        ? "Record change evidence"
        : "Record rollback evidence"
      : human(transition.split(".")[1]!) +
        (module === "cases" ? " case" : module === "incidents" ? " incident" : " segment");
  return (
    <div className="space-y-6">
      {module !== "releases" || r.stage !== "rolled_back" ? (
        <section className="space-y-3">
          <h3 className="font-semibold capitalize">{label}</h3>
          <OpsAction
            command={transition}
            payload={{
              id: r.id,
              row_version: r.row_version,
              ...(module === "releases"
                ? { [r.stage === "planned" ? "change_reference" : "rollback_reference"]: reference }
                : {}),
            }}
            label={label}
            onSaved={onSaved}
          >
            {module === "releases" ? (
              <OpsField label="Verified reference">
                {(id) => (
                  <Textarea
                    id={id}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                )}
              </OpsField>
            ) : (
              <p className="text-sm text-muted-foreground">
                The record and its history will be retained.
              </p>
            )}
          </OpsAction>
        </section>
      ) : null}
      {module !== "segments" ? (
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">Add internal note</h3>
          <OpsAction
            command={`${module}.comment`}
            payload={{ id: r.id, note }}
            label="Add note"
            onSaved={onSaved}
          >
            <OpsField label="Internal note">
              {(id) => (
                <Textarea
                  id={id}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  maxLength={8000}
                />
              )}
            </OpsField>
          </OpsAction>
        </section>
      ) : null}
    </div>
  );
}
function SegmentMembers({ record, canManage }: { record: OpsRecord; canManage: boolean }) {
  const list = useServerFn(listOpsMembers);
  const preview = useServerFn(previewOpsMembers);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [business, setBusiness] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [mode, setMode] = useState("add");
  const query = useQuery({
    queryKey: ["platform", "operations", "members", record.id, search, page, record.row_version],
    queryFn: () => list({ data: { id: record.id, search, page } }),
    retry: false,
  });
  const impact = useMutation({
    mutationFn: (intent: { mode: "add" | "remove"; companyIds: string[] }) =>
      preview({ data: { id: record.id, mode: intent.mode, companyIds: intent.companyIds } }),
  });
  return (
    <div className="space-y-4">
      <OpsField label="Find active members">
        {(id) => (
          <Input
            id={id}
            value={search}
            maxLength={160}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        )}
      </OpsField>
      {query.isPending ? (
        <p role="status">Loading members…</p>
      ) : query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load members" />
      ) : (
        <>
          <ul className="divide-y rounded border">
            {query.data?.rows.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>{m.label}</span>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMode("remove");
                      setIds((current) => (current.includes(m.id) ? current : [...current, m.id]));
                      impact.reset();
                    }}
                  >
                    Select for removal
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {!query.data?.total ? <p>No active businesses in this segment.</p> : null}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Previous members
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * 25 >= (query.data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              More members
            </Button>
            <p className="self-center text-sm">{query.data?.total ?? 0} active</p>
          </div>
        </>
      )}
      {canManage ? (
        <section className="space-y-4 border-t pt-4">
          <h3 className="font-semibold">Change membership</h3>
          <EnumField
            label="Membership action"
            value={mode}
            options={["add", "remove"]}
            onChange={(v) => {
              setMode(v);
              impact.reset();
            }}
          />
          <PlatformRecordLookup
            kind="business"
            value={business}
            onChange={(v) => {
              setBusiness(v);
              if (v && !ids.includes(v) && ids.length < 100) setIds((current) => [...current, v]);
              impact.reset();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Up to 100 businesses. Preview the actual changes before saving.
          </p>
          <ul className="space-y-1">
            {ids.map((id) => (
              <li className="flex items-center justify-between gap-2 text-xs" key={id}>
                <span className="break-all">{id}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIds((current) => current.filter((v) => v !== id));
                    setBusiness("");
                    impact.reset();
                  }}
                >
                  Remove selection
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            disabled={!ids.length || impact.isPending}
            onClick={() => impact.mutate({ mode: mode as "add" | "remove", companyIds: [...ids] })}
          >
            Preview membership change
          </Button>
          {impact.isError ? <p role="alert">{impact.error.message}</p> : null}
          {impact.data &&
          impact.variables?.mode === mode &&
          JSON.stringify(impact.variables.companyIds) === JSON.stringify(ids) ? (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="font-medium">
                {impact.data.changed} changes from {impact.data.rows.length} selected businesses
              </p>
              <ul className="text-sm">
                {impact.data.rows.map((r) => (
                  <li key={r.id}>
                    {r.label} · {r.changes ? mode : "Already in requested state"}
                  </li>
                ))}
              </ul>
              <OpsAction
                command="segments.members"
                payload={{
                  id: record.id,
                  row_version: impact.data.rowVersion,
                  company_ids: ids,
                  mode,
                }}
                label="Confirm membership changes"
                disabled={!impact.data.changed}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
