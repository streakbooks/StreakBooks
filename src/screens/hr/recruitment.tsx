import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listHrApplications,
  listHrRequisitions,
  upsertHrApplication,
  upsertHrInterview,
  upsertHrOffer,
  upsertHrRequisition,
} from "@/lib/hr/lifecycle.functions";
import {
  HR_APPLICATION_STATUSES,
  HR_OFFER_STATUSES,
  HR_REQUISITION_STATUSES,
} from "@/lib/hr/lifecycle-types";

export function HrRecruitmentPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.recruitment.manage");
  const queryClient = useQueryClient();
  const fetchReqs = useServerFn(listHrRequisitions);
  const fetchApps = useServerFn(listHrApplications);
  const saveReq = useServerFn(upsertHrRequisition);
  const saveApp = useServerFn(upsertHrApplication);
  const saveInterview = useServerFn(upsertHrInterview);
  const saveOffer = useServerFn(upsertHrOffer);

  const [reqOpen, setReqOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [reqStatus, setReqStatus] = useState("draft");
  const [headcount, setHeadcount] = useState(1);
  const [description, setDescription] = useState("");
  const [selectedReqId, setSelectedReqId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [appStatus, setAppStatus] = useState("applied");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [offerStatus, setOfferStatus] = useState("draft");
  const [offerStart, setOfferStart] = useState("");

  const reqsQ = useQuery({
    queryKey: ["hr-requisitions", company?.id],
    queryFn: () => fetchReqs({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const appsQ = useQuery({
    queryKey: ["hr-applications", company?.id],
    queryFn: () => fetchApps({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-requisitions", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-applications", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["hr-dashboard-kpis", company?.id] });
  };

  const reqMut = useMutation({
    mutationFn: () =>
      saveReq({
        data: {
          companyId: company!.id,
          payload: {
            title,
            status: reqStatus,
            headcount,
            description: description || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Requisition saved");
      setReqOpen(false);
      setTitle("");
      setDescription("");
      setReqStatus("draft");
      setHeadcount(1);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const appMut = useMutation({
    mutationFn: () =>
      saveApp({
        data: {
          companyId: company!.id,
          payload: {
            requisitionId: selectedReqId,
            candidateFirstName: firstName,
            candidateLastName: lastName,
            candidateEmail: email || null,
            status: appStatus,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Application saved");
      setAppOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setAppStatus("applied");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const interviewMut = useMutation({
    mutationFn: () =>
      saveInterview({
        data: {
          companyId: company!.id,
          payload: {
            applicationId: selectedAppId,
            scheduledAt: new Date(interviewAt).toISOString(),
            mode: "video",
            status: "scheduled",
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Interview scheduled");
      setInterviewOpen(false);
      setInterviewAt("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const offerMut = useMutation({
    mutationFn: () =>
      saveOffer({
        data: {
          companyId: company!.id,
          payload: {
            applicationId: selectedAppId,
            status: offerStatus,
            proposedStartDate: offerStart || null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Offer saved");
      setOfferOpen(false);
      setOfferStatus("draft");
      setOfferStart("");
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
      <ListWorkspace title="Recruitment" description="ATS">
        <EmptyState title="No HR access" description="Ask an administrator for hr.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Recruitment"
      description="Requisitions, applications, interviews and offers — LLM lifecycle states enforced in Supabase."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Recruitment" }]}
      actions={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setReqOpen(true)}>
              New requisition
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!reqsQ.isSuccess || !(reqsQ.data?.items.length ?? 0)}
              onClick={() => setAppOpen(true)}
            >
              New application
            </Button>
          </div>
        ) : undefined
      }
      subnav={<HrSubnav current="recruitment" />}
    >
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Job requisitions
        </h2>
        {reqsQ.isPending ? (
          <LoadingState />
        ) : reqsQ.isError ? (
          <QueryErrorState queries={[reqsQ]} title="Could not load requisitions" />
        ) : !reqsQ.data?.items.length ? (
          <EmptyState
            title="No requisitions yet"
            description="Create an open requisition before adding candidates."
            action={
              canManage ? (
                <Button type="button" onClick={() => setReqOpen(true)}>
                  New requisition
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Headcount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqsQ.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.requisitionNumber}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell className="tabular-nums">{row.headcount}</TableCell>
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Applications
          </h2>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedAppId}
                onClick={() => setInterviewOpen(true)}
              >
                Schedule interview
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedAppId}
                onClick={() => setOfferOpen(true)}
              >
                Create offer
              </Button>
            </div>
          ) : null}
        </div>
        {appsQ.isPending ? (
          <LoadingState />
        ) : appsQ.isError ? (
          <QueryErrorState queries={[appsQ]} title="Could not load applications" />
        ) : !appsQ.data?.items.length ? (
          <EmptyState
            title="No applications yet"
            description="Add candidates against an open or draft requisition."
            action={
              canManage ? (
                <Button size="sm" type="button" variant="outline" onClick={() => setAppOpen(true)}>
                  Add candidate
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Number</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Requisition</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appsQ.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="radio"
                        name="selected-application"
                        aria-label={`Select ${row.applicationNumber}`}
                        checked={selectedAppId === row.id}
                        onChange={() => setSelectedAppId(row.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{row.applicationNumber}</TableCell>
                    <TableCell>
                      {row.candidateFirstName} {row.candidateLastName}
                    </TableCell>
                    <TableCell>{row.requisitionTitle ?? "—"}</TableCell>
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

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New requisition</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="req-title">Title</Label>
              <Input id="req-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <RecordLookupSelect value={reqStatus} onValueChange={setReqStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_REQUISITION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-hc">Headcount</Label>
              <Input
                id="req-hc"
                type="number"
                min={1}
                value={headcount}
                onChange={(e) => setHeadcount(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-desc">Description</Label>
              <Textarea
                id="req-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReqOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!title.trim() || reqMut.isPending}
              onClick={() => reqMut.mutate()}
            >
              {reqMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={appOpen} onOpenChange={setAppOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New application</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Requisition</Label>
              {reqsQ.isPending ? (
                <LoadingState />
              ) : reqsQ.isError ? (
                <QueryErrorState queries={[reqsQ]} title="Could not load requisitions" />
              ) : reqsQ.isSuccess ? (
                <RecordLookupSelect value={selectedReqId} onValueChange={setSelectedReqId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select requisition" />
                  </SelectTrigger>
                  <SelectContent>
                    {(reqsQ.data?.items ?? []).map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.requisitionNumber} — {row.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cand-first">First name</Label>
                <Input
                  id="cand-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cand-last">Last name</Label>
                <Input
                  id="cand-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cand-email">Email</Label>
              <Input
                id="cand-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <RecordLookupSelect value={appStatus} onValueChange={setAppStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_APPLICATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAppOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !selectedReqId ||
                !firstName.trim() ||
                !lastName.trim() ||
                appMut.isPending ||
                !reqsQ.isSuccess
              }
              onClick={() => appMut.mutate()}
            >
              {appMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={interviewOpen} onOpenChange={setInterviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="iv-at">Date and time</Label>
            <Input
              id="iv-at"
              type="datetime-local"
              value={interviewAt}
              onChange={(e) => setInterviewAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInterviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedAppId || !interviewAt || interviewMut.isPending}
              onClick={() => interviewMut.mutate()}
            >
              {interviewMut.isPending ? "Saving…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <RecordLookupSelect value={offerStatus} onValueChange={setOfferStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_OFFER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="offer-start">Proposed start date</Label>
              <Input
                id="offer-start"
                type="date"
                value={offerStart}
                onChange={(e) => setOfferStart(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOfferOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedAppId || offerMut.isPending}
              onClick={() => offerMut.mutate()}
            >
              {offerMut.isPending ? "Saving…" : "Save offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
