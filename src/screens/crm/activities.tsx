import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  completeCrmActivity,
  getCrmSettings,
  listCrmActivities,
  listCrmLeads,
  upsertCrmActivity,
} from "@/lib/crm/crm.functions";
import { displayLeadName } from "@/lib/crm/types";
import type { Permission } from "@/lib/permissions";
import type { CrmSectionKey } from "@/lib/crm/sections";
import { toast } from "sonner";

export function CrmActivitiesPage({
  sectionKey = "activities",
}: {
  sectionKey?: Extract<CrmSectionKey, "activities" | "tasks" | "calendar">;
}) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canManage = can("crm.activities.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchActivities = useServerFn(listCrmActivities);
  const fetchLeads = useServerFn(listCrmLeads);
  const createActivity = useServerFn(upsertCrmActivity);
  const completeActivity = useServerFn(completeCrmActivity);

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState("task");
  const [leadId, setLeadId] = useState("");
  const [dueAt, setDueAt] = useState("");

  const title =
    sectionKey === "tasks"
      ? "Tasks & Follow-ups"
      : sectionKey === "calendar"
        ? "Calendar & Meetings"
        : "Activities";

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const activities = useQuery({
    queryKey: ["crm-activities", company?.id, sectionKey],
    queryFn: () =>
      fetchActivities({
        data: {
          companyId: company!.id,
          ...(sectionKey === "tasks" ? { status: "open" } : {}),
        },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const leads = useQuery({
    queryKey: ["crm-leads", company?.id, "activity-form"],
    queryFn: () => fetchLeads({ data: { companyId: company!.id, limit: 100 } }),
    enabled: Boolean(company?.id) && canManage && showForm,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      if (!leadId) throw new Error("Select a lead");
      return createActivity({
        data: {
          companyId: company.id,
          kind: sectionKey === "calendar" ? "meeting" : kind,
          subject,
          leadId,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Activity saved");
      setShowForm(false);
      setSubject("");
      setLeadId("");
      setDueAt("");
      await queryClient.invalidateQueries({ queryKey: ["crm-activities", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const completeMutation = useMutation({
    mutationFn: async (activityId: string) => {
      if (!company) throw new Error("No organisation");
      return completeActivity({ data: { companyId: company.id, activityId } });
    },
    onSuccess: async () => {
      toast.success("Activity completed");
      await queryClient.invalidateQueries({ queryKey: ["crm-activities", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title={title} description="CRM activities">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const rows = (activities.data ?? []).filter((row) => {
    if (sectionKey === "calendar") return row.kind === "meeting";
    if (sectionKey === "tasks") return row.kind === "task" || row.status === "open";
    return true;
  });

  return (
    <ListWorkspace
      title={title}
      description="Calls, meetings, tasks and follow-ups linked to leads and deals."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: title }]}
      actions={
        canManage && settings.data?.enabled ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New activity"}
          </Button>
        ) : undefined
      }
    >
      <CrmSubnav current={sectionKey} />
      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM to track activities." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          {showForm && canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>New activity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="act-subject">Subject</Label>
                  <Input
                    id="act-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                {sectionKey !== "calendar" ? (
                  <div className="space-y-2">
                    <Label>Kind</Label>
                    <Select value={kind} onValueChange={setKind}>
                      <SelectTrigger aria-label="Activity kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task">Task</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="note">Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>Lead</Label>
                  <Select value={leadId || "__none"} onValueChange={(v) => setLeadId(v === "__none" ? "" : v)}>
                    <SelectTrigger aria-label="Related lead">
                      <SelectValue placeholder="Select lead" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Select lead</SelectItem>
                      {(leads.data ?? []).map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {displayLeadName(lead)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="act-due">Due</Label>
                  <Input
                    id="act-due"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={createMutation.isPending || !subject.trim() || !leadId}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Save activity"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activities.isLoading ? <LoadingState /> : null}
          {activities.isError ? (
            <ErrorState
              title="Could not load activities"
              description={friendlyAuthError(activities.error)}
             onRetry={() => activities.refetch()}/>
          ) : null}
          {activities.isSuccess && rows.length === 0 ? (
            <EmptyState title="No activities" description="Schedule a follow-up against a lead." />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.subject}</TableCell>
                      <TableCell className="capitalize">{row.kind.replace("_", " ")}</TableCell>
                      <TableCell className="capitalize">{row.status}</TableCell>
                      <TableCell>
                        {row.dueAt ? new Date(row.dueAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && row.status === "open" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={completeMutation.isPending}
                            onClick={() => completeMutation.mutate(row.id)}
                          >
                            Complete
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
