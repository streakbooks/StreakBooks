import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
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
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  listHrTraining,
  upsertHrTrainingCourse,
  upsertHrTrainingEnrollment,
} from "@/lib/hr/talent.functions";

export function HrTrainingPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.performance.manage");
  const qc = useQueryClient();
  const fetch = useServerFn(listHrTraining);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveCourse = useServerFn(upsertHrTrainingCourse);
  const saveEnroll = useServerFn(upsertHrTrainingEnrollment);
  const [courseOpen, setCourseOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const dataQ = useQuery({
    queryKey: ["hr-training", company?.id],
    queryFn: () => fetch({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const empQ = useQuery({
    queryKey: ["hr-emp-train", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && enrollOpen,
    retry: false,
  });
  const inv = async () => {
    await qc.invalidateQueries({ queryKey: ["hr-training", company?.id] });
  };
  const courseM = useMutation({
    mutationFn: () =>
      saveCourse({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            code: code.trim(),
            name: name.trim(),
            provider: null,
            isActive: true,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Course saved");
      setCourseOpen(false);
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const enrollM = useMutation({
    mutationFn: () =>
      saveEnroll({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            courseId,
            employeeId,
            status: "planned",
            enrolledOn: null,
            completedOn: null,
            certificateName: null,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Enrollment saved");
      setEnrollOpen(false);
      await inv();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canView)
    return (
      <ListWorkspace
        title="Training & Development"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Training & Development" }]}
        subnav={<HrSubnav current="training" />}
      >
        <EmptyState title="No access" description="You need hr.view." />
      </ListWorkspace>
    );

  const courses = dataQ.data?.courses ?? [];
  const enrollments = dataQ.data?.enrollments ?? [];
  const employees = empQ.data?.items ?? [];
  const active = courses.filter((c) => c.isActive);

  return (
    <ListWorkspace
      title="Training & Development"
      description="Courses, enrollments and certifications."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Training & Development" }]}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCode("");
                setName("");
                setCourseOpen(true);
              }}
            >
              New course
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCourseId(active[0]?.id ?? "");
                setEmployeeId("");
                setEnrollOpen(true);
              }}
            >
              Enroll
            </Button>
          </div>
        ) : undefined
      }
      subnav={<HrSubnav current="training" />}
    >
      {dataQ.isPending ? (
        <LoadingState />
      ) : dataQ.isError ? (
        <ErrorState
          title="Could not load training"
          description={friendlyAuthError(dataQ.error)}
          onRetry={() => void dataQ.refetch()}
        />
      ) : (
        <>
          <section className="mb-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Courses
            </h2>
            {courses.length === 0 ? (
              <EmptyState
                title="No courses"
                description="Create a course catalogue entry."
                action={
                  canManage ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        setCode("");
                        setName("");
                        setCourseOpen(true);
                      }}
                    >
                      New course
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>
                          <StatusBadge status={r.isActive ? "active" : "inactive"} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Enrollments
            </h2>
            {enrollments.length === 0 ? (
              <EmptyState
                title="No enrollments"
                description="Enroll employees into active courses."
                action={
                  canManage && active.length > 0 ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        setCourseId(active[0]?.id ?? "");
                        setEmployeeId("");
                        setEnrollOpen(true);
                      }}
                    >
                      Enroll
                    </Button>
                  ) : canManage ? (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCode("");
                        setName("");
                        setCourseOpen(true);
                      }}
                    >
                      New course first
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enrolled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.employeeName ?? "—"}</TableCell>
                        <TableCell>{r.courseCode}</TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>{r.enrolledOn}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            )}
          </section>
        </>
      )}
      <Dialog open={courseOpen} onOpenChange={setCourseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCourseOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || courseM.isPending}
              onClick={() => courseM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll employee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Course</Label>
              <RecordLookupSelect value={courseId} onValueChange={setCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {active.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              <RecordLookupSelect value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.employeeNumber} — {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnrollOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!courseId || !employeeId || enrollM.isPending}
              onClick={() => enrollM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
