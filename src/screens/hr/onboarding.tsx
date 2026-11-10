import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrEmployees } from "@/lib/hr/hr.functions";
import {
  createHrOnboardingCase,
  getHrOnboardingCase,
  listHrOnboardingCases,
  listHrOnboardingTemplates,
  updateHrOnboardingTask,
  upsertHrOnboardingTemplate,
} from "@/lib/hr/lifecycle.functions";
import { HR_ONBOARDING_TASK_STATUSES } from "@/lib/hr/lifecycle-types";

export function HrOnboardingPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.onboarding.manage");
  const queryClient = useQueryClient();

  const fetchTemplates = useServerFn(listHrOnboardingTemplates);
  const fetchCases = useServerFn(listHrOnboardingCases);
  const fetchCase = useServerFn(getHrOnboardingCase);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveTemplate = useServerFn(upsertHrOnboardingTemplate);
  const createCase = useServerFn(createHrOnboardingCase);
  const saveTask = useServerFn(updateHrOnboardingTask);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [taskTitles, setTaskTitles] = useState("Collect documents\nIT provisioning\nOrientation");
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const templatesQ = useQuery({
    queryKey: ["hr-onboarding-templates", company?.id],
    queryFn: () => fetchTemplates({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const casesQ = useQuery({
    queryKey: ["hr-onboarding-cases", company?.id],
    queryFn: () => fetchCases({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-onboarding", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && canManage && caseOpen,
    retry: false,
  });

  const detailQ = useQuery({
    queryKey: ["hr-onboarding-case", company?.id, selectedCaseId],
    queryFn: () => fetchCase({ data: { companyId: company!.id, caseId: selectedCaseId! } }),
    enabled: Boolean(company?.id) && canView && Boolean(selectedCaseId),
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-onboarding-templates", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-onboarding-cases", company?.id] });
    if (selectedCaseId) {
      await queryClient.invalidateQueries({
        queryKey: ["hr-onboarding-case", company?.id, selectedCaseId],
      });
    }
  };

  const templateMut = useMutation({
    mutationFn: () =>
      saveTemplate({
        data: {
          companyId: company!.id,
          payload: {
            code,
            name,
            tasks: taskTitles
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((title, index) => ({
                title,
                ownerRole: index === 0 ? "hr" : index === 1 ? "it" : "manager",
                dueOffsetDays: index * 2,
                isRequired: true,
                sortOrder: (index + 1) * 100,
              })),
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Onboarding template saved");
      setTemplateOpen(false);
      setCode("");
      setName("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const caseMut = useMutation({
    mutationFn: () =>
      createCase({
        data: {
          companyId: company!.id,
          payload: {
            templateId: templateId || null,
            employeeId: employeeId || null,
            applicationId: null,
            targetJoinDate: joinDate || null,
            notes: null,
          },
        },
      }),
    onSuccess: async (detail) => {
      toast.success("Onboarding case created");
      setCaseOpen(false);
      if (detail.case.id) setSelectedCaseId(detail.case.id);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const taskMut = useMutation({
    mutationFn: (input: { taskId: string; status: string }) =>
      saveTask({
        data: {
          companyId: company!.id,
          taskId: input.taskId,
          status: input.status,
          notes: null,
        },
      }),
    onSuccess: async () => {
      toast.success("Task updated");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Onboarding" description="Checklists">
        <EmptyState title="No HR access" description="Ask an administrator for hr.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Onboarding"
      description="Templates and joining checklists with real task state transitions."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Onboarding" }]}
      actions={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setTemplateOpen(true)}>
              New template
            </Button>
            <Button type="button" onClick={() => setCaseOpen(true)}>
              Start onboarding
            </Button>
          </div>
        ) : undefined
      }
    >
      <HrSubnav current="onboarding" />

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Templates
        </h2>
        {templatesQ.isPending ? (
          <LoadingState />
        ) : templatesQ.isError ? (
          <ErrorState
            title="Could not load templates"
            description={friendlyAuthError(templatesQ.error)}
            onRetry={() => templatesQ.refetch()}
          />
        ) : !templatesQ.data?.templates.length ? (
          <EmptyState
            title="No onboarding templates"
            description="Create a template with checklist tasks before starting cases."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templatesQ.data.templates.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="tabular-nums">{row.taskCount}</TableCell>
                    <TableCell>{row.isActive ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cases
        </h2>
        {casesQ.isPending ? (
          <LoadingState />
        ) : casesQ.isError ? (
          <ErrorState
            title="Could not load onboarding cases"
            description={friendlyAuthError(casesQ.error)}
            onRetry={() => casesQ.refetch()}
          />
        ) : !casesQ.data?.items.length ? (
          <EmptyState
            title="No onboarding cases"
            description="Start an onboarding case for a hired employee using a template."
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Pending tasks</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {casesQ.data.items.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedCaseId(row.id)}
                  >
                    <TableCell className="font-medium">{row.caseNumber}</TableCell>
                    <TableCell>{row.employeeName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{row.pendingTasks}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      {selectedCaseId ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Case detail {detailQ.data?.case.caseNumber ?? ""}
          </h2>
          {detailQ.isPending ? (
            <LoadingState />
          ) : detailQ.isError ? (
            <ErrorState
              title="Could not load case"
              description={friendlyAuthError(detailQ.error)}
              onRetry={() => detailQ.refetch()}
            />
          ) : detailQ.data ? (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailQ.data.tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>{task.title}</TableCell>
                      <TableCell>{task.ownerRole}</TableCell>
                      <TableCell>{task.dueOn ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={task.status} />
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={task.status}
                            onValueChange={(status) =>
                              taskMut.mutate({ taskId: task.id, status })
                            }
                          >
                            <SelectTrigger className="w-[140px]" aria-label={`Update ${task.title}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {HR_ONBOARDING_TASK_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          ) : null}
        </section>
      ) : null}

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New onboarding template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="tpl-code">Code</Label>
              <Input id="tpl-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tpl-tasks">Tasks (one per line)</Label>
              <textarea
                id="tpl-tasks"
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={taskTitles}
                onChange={(e) => setTaskTitles(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || templateMut.isPending}
              onClick={() => templateMut.mutate()}
            >
              {templateMut.isPending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={caseOpen} onOpenChange={setCaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start onboarding</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Template</Label>
              <Select value={templateId || "__none"} onValueChange={(v) => setTemplateId(v === "__none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {(templatesQ.data?.templates ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.code} — {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={employeeId || "__none"}
                onValueChange={(v) => setEmployeeId(v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {(employeesQ.data?.items ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.employeeNumber} — {row.firstName} {row.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="join-date">Target join date</Label>
              <Input
                id="join-date"
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCaseOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={caseMut.isPending}
              onClick={() => caseMut.mutate()}
            >
              {caseMut.isPending ? "Creating…" : "Create case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
