import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listHrAutomationRules,
  runHrAutomations,
  upsertHrAutomationRule,
} from "@/lib/hr/insights.functions";

export function HrAutomationsPage() {
  const { company, isPending } = useActiveCompany();
  const canManage = useCanDo("hr.settings.edit");
  const qc = useQueryClient();
  const fetch = useServerFn(listHrAutomationRules);
  const save = useServerFn(upsertHrAutomationRule);
  const run = useServerFn(runHrAutomations);

  const dataQ = useQuery({
    queryKey: ["hr-automations", company?.id],
    queryFn: () => fetch({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage,
    retry: false,
  });

  const inv = async () => {
    await qc.invalidateQueries({ queryKey: ["hr-automations", company?.id] });
  };

  const toggleM = useMutation({
    mutationFn: (rule: {
      id: string;
      code: string;
      name: string;
      triggerKind: string;
      isEnabled: boolean;
    }) =>
      save({
        data: {
          companyId: company!.id,
          payload: {
            id: rule.id,
            code: rule.code,
            name: rule.name,
            triggerKind: rule.triggerKind,
            isEnabled: !rule.isEnabled,
            config: {},
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Automation updated");
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const runM = useMutation({
    mutationFn: (ruleId?: string | null) =>
      run({ data: { companyId: company!.id, ruleId: ruleId ?? null } }),
    onSuccess: async () => {
      toast.success("Automations ran");
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canManage) {
    return (
      <ListWorkspace
        title="HR Automations"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "HR Automations" }]}
        subnav={<HrSubnav current="automations" />}
      >
        <EmptyState title="No access" description="Missing permission: hr.settings.edit." />
      </ListWorkspace>
    );
  }

  const items = dataQ.data?.items ?? [];
  const runs = dataQ.data?.runs ?? [];

  return (
    <ListWorkspace
      title="HR Automations"
      description="Idempotent digests that refresh Action Center HR alerts. Daily cron runs when pg_cron is available."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "HR Automations" }]}
      actions={
        <Button type="button" disabled={runM.isPending} onClick={() => runM.mutate(null)}>
          Run all now
        </Button>
      }
      subnav={<HrSubnav current="automations" />}
    >
      {dataQ.isPending ? (
        <LoadingState />
      ) : dataQ.isError ? (
        <QueryErrorState queries={[dataQ]} title="Could not load automations" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No automation rules"
          description="Defaults seed on first open."
          action={
            <Button size="sm" type="button" onClick={() => void dataQ.refetch()}>
              Refresh rules
            </Button>
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.triggerKind}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.isEnabled}
                      disabled={toggleM.isPending}
                      onCheckedChange={() => toggleM.mutate(r)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {r.lastRunAt ? new Date(r.lastRunAt).toLocaleString() : "—"}
                    </div>
                    <div className="text-muted-foreground text-xs">{r.lastRunSummary ?? ""}</div>
                    {r.lastRunStatus ? <StatusBadge status={r.lastRunStatus} /> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!r.isEnabled || runM.isPending}
                      onClick={() => runM.mutate(r.id)}
                    >
                      Run
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent runs
        </h2>
        {dataQ.isError ? null : runs.length === 0 ? (
          <EmptyState
            title="No runs yet"
            description="Run an automation to create a retry log entry."
            action={
              <Button
                size="sm"
                type="button"
                disabled={runM.isPending}
                onClick={() => runM.mutate(null)}
              >
                Run all now
              </Button>
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.startedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>{r.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>
    </ListWorkspace>
  );
}
