import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CrmStatusBadge } from "@/components/crm/CrmStatusBadge";
import { CrmMeetingCalendar } from "@/components/crm/CrmMeetingCalendar";
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
  listCrmAccountOverlay,
  listCrmOpportunities,
  upsertCrmActivity,
} from "@/lib/crm/crm.functions";
import { displayLeadName } from "@/lib/crm/types";
import type { Permission } from "@/lib/permissions";
import type { CrmSectionKey } from "@/lib/crm/sections";
import { toast } from "sonner";

const ACTIVITY_PAGE_SIZE = 50;

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
  const fetchOpportunities = useServerFn(listCrmOpportunities);
  const fetchAccounts = useServerFn(listCrmAccountOverlay);
  const createActivity = useServerFn(upsertCrmActivity);
  const completeActivity = useServerFn(completeCrmActivity);

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState("task");
  const [leadId, setLeadId] = useState("");
  const [relatedType, setRelatedType] = useState<"lead" | "opportunity" | "contact">("lead");
  const [contactId, setContactId] = useState("");
  const [taskFilter, setTaskFilter] = useState<"open" | "all" | "overdue">("open");
  const [overdueAsOf, setOverdueAsOf] = useState(() => new Date().toISOString());
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const handle = setTimeout(() => {
      setAppliedSearch(searchTerm.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);
  const [opportunityId, setOpportunityId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const calendarFrom = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  ).toISOString();
  const calendarTo = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    1,
  ).toISOString();
  const activityKind =
    sectionKey === "tasks" ? "task" : sectionKey === "calendar" ? "meeting" : kind;
  const dueIsValid = !dueAt || Number.isFinite(new Date(dueAt).getTime());
  const needsDue = activityKind === "meeting";
  const relatedId =
    relatedType === "lead" ? leadId : relatedType === "opportunity" ? opportunityId : contactId;

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
    queryKey: [
      "crm-activities",
      company?.id,
      sectionKey,
      taskFilter,
      overdueAsOf,
      appliedSearch,
      page,
      calendarFrom,
      calendarTo,
    ],
    queryFn: () =>
      fetchActivities({
        data: {
          companyId: company!.id,
          ...(sectionKey === "tasks" && taskFilter !== "all" ? { status: "open" } : {}),
          ...(sectionKey === "tasks" && taskFilter === "overdue" ? { dueTo: overdueAsOf } : {}),
          ...(sectionKey === "tasks" ? { kind: "task" } : {}),
          ...(sectionKey === "calendar"
            ? { kind: "meeting", dueFrom: calendarFrom, dueTo: calendarTo, limit: 500 }
            : {
                q: appliedSearch,
                limit: ACTIVITY_PAGE_SIZE + 1,
                offset: page * ACTIVITY_PAGE_SIZE,
              }),
        },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const leads = useQuery({
    queryKey: ["crm-leads", company?.id, "activity-form"],
    queryFn: () => fetchLeads({ data: { companyId: company!.id, limit: 100 } }),
    enabled: Boolean(company?.id) && canManage && showForm && relatedType === "lead",
    retry: false,
  });

  const opportunities = useQuery({
    queryKey: ["crm-opportunities", company?.id, "activity-form"],
    queryFn: () => fetchOpportunities({ data: { companyId: company!.id, limit: 100 } }),
    enabled: Boolean(company?.id) && canManage && showForm && relatedType === "opportunity",
    retry: false,
  });

  const accounts = useQuery({
    queryKey: ["crm-contact-activity-options", company?.id],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id, limit: 200 } }),
    enabled: Boolean(company?.id) && canManage && showForm && relatedType === "contact",
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      if (!relatedId) throw new Error("Link the activity to a lead or opportunity.");
      if (!dueIsValid || (needsDue && !dueAt)) {
        throw new Error("Provide a valid meeting date and time.");
      }
      return createActivity({
        data: {
          companyId: company.id,
          kind: activityKind,
          subject,
          leadId: relatedType === "lead" ? leadId : null,
          opportunityId: relatedType === "opportunity" ? opportunityId : null,
          contactId: relatedType === "contact" ? contactId : null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Activity saved");
      setShowForm(false);
      setSubject("");
      setLeadId("");
      setOpportunityId("");
      setContactId("");
      setRelatedType("lead");
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

  const rows = (
    sectionKey === "calendar"
      ? (activities.data ?? [])
      : (activities.data ?? []).slice(0, ACTIVITY_PAGE_SIZE)
  ).filter((row) => {
    if (sectionKey === "calendar") return row.kind === "meeting";
    if (sectionKey === "tasks") return row.kind === "task";
    return true;
  });
  const hasNextPage =
    sectionKey !== "calendar" && (activities.data?.length ?? 0) > ACTIVITY_PAGE_SIZE;

  return (
    <ListWorkspace
      title={title}
      description="Calls, meetings, tasks and follow-ups linked to leads and deals."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: title }]}
      actions={
        canManage && settings.data?.enabled ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm
              ? "Close form"
              : sectionKey === "calendar"
                ? "New meeting"
                : sectionKey === "tasks"
                  ? "New task"
                  : "New activity"}
          </Button>
        ) : undefined
      }
      subnav={<CrmSubnav current={sectionKey} />}
    >
      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM to track activities." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          {sectionKey !== "calendar" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="crm-activity-search" className="sr-only">
                Search activities
              </Label>
              <Input
                id="crm-activity-search"
                type="search"
                placeholder="Search activities by subject"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full sm:max-w-sm"
              />
              <span role="status" className="text-xs text-muted-foreground">
                Page {page + 1} · {rows.length} matching records
              </span>
            </div>
          ) : null}
          {sectionKey === "tasks" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="crm-task-filter">Task status</Label>
              <Select
                value={taskFilter}
                onValueChange={(value) => {
                  setTaskFilter(value as "open" | "all" | "overdue");
                  setPage(0);
                  if (value === "overdue") setOverdueAsOf(new Date().toISOString());
                }}
              >
                <SelectTrigger
                  id="crm-task-filter"
                  className="w-48"
                  aria-label="Filter task status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open tasks</SelectItem>
                  <SelectItem value="all">All tasks</SelectItem>
                  <SelectItem value="overdue">Overdue tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {sectionKey === "calendar" && activities.isSuccess ? (
            <CrmMeetingCalendar
              activities={rows}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
            />
          ) : null}
          {showForm && canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {sectionKey === "calendar"
                    ? "New meeting"
                    : sectionKey === "tasks"
                      ? "New task"
                      : "New activity"}
                </CardTitle>
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
                {sectionKey === "activities" ? (
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
                  <Label>Related to</Label>
                  <Select
                    value={relatedType}
                    onValueChange={(v) => setRelatedType(v as "lead" | "opportunity" | "contact")}
                  >
                    <SelectTrigger aria-label="Related record type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="opportunity">Opportunity</SelectItem>
                      <SelectItem value="contact">Customer / Contact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {relatedType === "lead" ? (
                  <div className="space-y-2">
                    <Label>Lead</Label>
                    <RecordLookupSelect
                      value={leadId || "__none"}
                      onValueChange={(v) => setLeadId(v === "__none" ? "" : v)}
                    >
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
                    </RecordLookupSelect>
                    {leads.isError ? (
                      <p role="alert" className="text-xs text-destructive">
                        Could not load leads. Retry the form.
                      </p>
                    ) : null}
                  </div>
                ) : relatedType === "opportunity" ? (
                  <div className="space-y-2">
                    <Label>Opportunity</Label>
                    <RecordLookupSelect
                      value={opportunityId || "__none"}
                      onValueChange={(v) => setOpportunityId(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger aria-label="Related opportunity">
                        <SelectValue placeholder="Select opportunity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Select opportunity</SelectItem>
                        {(opportunities.data ?? []).map((opportunity) => (
                          <SelectItem key={opportunity.id} value={opportunity.id}>
                            {opportunity.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                    {opportunities.isError ? (
                      <p role="alert" className="text-xs text-destructive">
                        Could not load opportunities. Retry the form.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Customer / Contact</Label>
                    <RecordLookupSelect
                      value={contactId || "__none"}
                      onValueChange={(v) => setContactId(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger aria-label="Related CRM contact">
                        <SelectValue placeholder="Select contact" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Select contact</SelectItem>
                        {(accounts.data ?? []).map((account) => (
                          <SelectItem key={account.contactId} value={account.contactId}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                    {accounts.isError ? (
                      <p role="alert" className="text-xs text-destructive">
                        Could not load Contacts. Retry the form.
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="act-due">
                    {activityKind === "meeting" ? "Meeting date and time" : "Due"}
                  </Label>
                  <Input
                    id="act-due"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Uses your browser's local timezone; external calendar synchronization is not yet
                    enabled.
                  </p>
                  {!dueIsValid || (needsDue && !dueAt) ? (
                    <p role="alert" className="text-xs text-destructive">
                      A valid meeting date and time is required.
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={
                      createMutation.isPending ||
                      !subject.trim() ||
                      !relatedId ||
                      !dueIsValid ||
                      (needsDue && !dueAt) ||
                      (relatedType === "lead"
                        ? leads.isLoading || leads.isError
                        : relatedType === "opportunity"
                          ? opportunities.isLoading || opportunities.isError
                          : accounts.isLoading || accounts.isError)
                    }
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending
                      ? "Saving…"
                      : activityKind === "meeting"
                        ? "Save meeting"
                        : activityKind === "task"
                          ? "Save task"
                          : "Save activity"}
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
              onRetry={() => activities.refetch()}
            />
          ) : null}
          {activities.isSuccess && rows.length === 0 ? (
            <EmptyState
              title={
                sectionKey === "calendar"
                  ? "No meetings"
                  : sectionKey === "tasks"
                    ? "No open tasks"
                    : "No activities"
              }
              description="Create a task, meeting or activity linked to a lead or opportunity."
            />
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
                      <TableCell>
                        <CrmStatusBadge status={row.status} />
                      </TableCell>
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
          {activities.isSuccess && sectionKey !== "calendar" && (page > 0 || hasNextPage) ? (
            <nav
              aria-label="Activity list pages"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">Page {page + 1}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page === 0 || activities.isFetching}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!hasNextPage || activities.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
