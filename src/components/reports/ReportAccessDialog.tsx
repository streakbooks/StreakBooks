import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getReportingWorkspace,
  setReportAccess,
  getReportGrants,
} from "@/lib/reports/ecosystem.functions";
import { listMyFirms } from "@/lib/firm/firm.functions";
import type { ReportingMember } from "@/lib/reports/ecosystem-model";
import type { SavedReport } from "@/lib/reports/saved-report";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
export function ReportAccessDialog({
  companyId,
  report,
  onClose,
}: {
  companyId: string;
  report: SavedReport;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    fetch = useServerFn(getReportingWorkspace),
    save = useServerFn(setReportAccess),
    grantFn = useServerFn(getReportGrants),
    firmsFn = useServerFn(listMyFirms);
  const [level, setLevel] = useState<"private" | "company" | "selected" | "firm">(
    report.access_level ?? "private",
  );
  const [firmId, setFirmId] = useState(report.firm_id ?? "");
  const [grants, setGrants] = useState<Record<string, "view" | "edit">>({});
  const q = useQuery({
    queryKey: ["report-access-members", companyId, report.id],
    queryFn: async () => {
      const [workspace, grants] = await Promise.all([
        fetch({ data: { companyId } }),
        grantFn({ data: { companyId, viewId: report.id } }),
      ]);
      return {
        ...(JSON.parse(workspace) as { members: ReportingMember[]; userId: string }),
        grants,
      };
    },
  });
  const initializedReport = useRef<string | null>(null);
  useEffect(() => {
    if (q.data && initializedReport.current !== report.id) {
      setGrants(Object.fromEntries(q.data.grants.map((g) => [g.user_id, g.access])));
      initializedReport.current = report.id;
    }
  }, [q.data, report.id]);
  const firms = useQuery({ queryKey: ["reporting-my-firms"], queryFn: () => firmsFn() });
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          viewId: report.id,
          level,
          firmId: level === "firm" ? firmId : null,
          grants: Object.entries(grants).map(([userId, access]) => ({ userId, access })),
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["report-library", companyId] });
      toast.success("Report access updated");
      onClose();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{report.name}”</DialogTitle>
          <DialogDescription>
            Choose a replacement access policy. Saving Private revokes all existing selected-user
            grants. Company and firm access still require active company reporting permission.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current access: {report.access_level ?? "private"}
          </p>
          <Label htmlFor="report-access-level">New access policy</Label>
          <select
            id="report-access-level"
            className="h-9 w-full rounded-md border bg-background px-3"
            value={level}
            disabled={q.isPending}
            onChange={(e) => setLevel(e.target.value as typeof level)}
          >
            <option value="private">Private — owner only</option>
            <option value="selected">Selected company members</option>
            <option value="company">Company — read only</option>
            <option value="firm">Authorized accounting firm — read only</option>
          </select>
          {level === "selected" &&
            (q.isPending ? (
              <LoadingState />
            ) : q.isError ? (
              <QueryErrorState queries={[q]} title="Could not load sharing recipients" />
            ) : (
              <div className="space-y-3">
                <MultiLookupSelect
                  ariaLabel="Report sharing recipients"
                  options={q.data.members
                    .filter((m) => m.user_id !== q.data.userId)
                    .map((m) => ({
                      id: m.user_id,
                      label: m.name,
                      description: m.email,
                      meta: m.role,
                    }))}
                  values={Object.keys(grants)}
                  onValuesChange={(ids) =>
                    setGrants(Object.fromEntries(ids.map((id) => [id, grants[id] ?? "view"])))
                  }
                />
                {q.data.members
                  .filter((m) => grants[m.user_id])
                  .map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{m.name}</span>
                      <select
                        className="rounded border bg-background p-1"
                        aria-label={`Access for ${m.name}`}
                        value={grants[m.user_id]}
                        onChange={(e) =>
                          setGrants({ ...grants, [m.user_id]: e.target.value as "view" | "edit" })
                        }
                      >
                        <option value="view">View</option>
                        <option value="edit">Edit configuration</option>
                      </select>
                    </div>
                  ))}
              </div>
            ))}
          {level === "firm" && (
            <div className="space-y-2">
              <Label htmlFor="report-share-firm">Accounting firm</Label>
              <RecordLookupSelect
                id="report-share-firm"
                className="h-9 w-full rounded border bg-background"
                value={firmId}
                onValueChange={(e) => setFirmId(e)}
              >
                <option value="">Choose a firm</option>
                {firms.data?.map((f) => (
                  <option key={f.firmId} value={f.firmId}>
                    {f.name}
                  </option>
                ))}
              </RecordLookupSelect>
              <p className="text-xs text-muted-foreground">
                The firm must have an active relationship with this client company.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              (level === "selected" && (q.isError || !Object.keys(grants).length)) ||
              (level === "firm" && !firmId)
            }
            onClick={() => mutation.mutate()}
          >
            Replace access policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
