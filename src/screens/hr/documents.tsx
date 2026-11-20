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
import { FILE_INPUT_ACCEPT } from "@/lib/documents/attachments";
import { registerAttachment } from "@/lib/documents/attachments.functions";
import { uploadCompanyDocument } from "@/lib/documents/upload-client";
import { listHrEmployees } from "@/lib/hr/hr.functions";
import { listHrEmployeeDocuments, upsertHrEmployeeDocument } from "@/lib/hr/people.functions";
import { HR_DOCUMENT_STATUSES, HR_DOCUMENT_TYPES } from "@/lib/hr/people-types";

export function HrDocumentsPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.employees.manage");
  const queryClient = useQueryClient();
  const fetchDocs = useServerFn(listHrEmployeeDocuments);
  const fetchEmployees = useServerFn(listHrEmployees);
  const saveDoc = useServerFn(upsertHrEmployeeDocument);
  const register = useServerFn(registerAttachment);

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [documentType, setDocumentType] = useState("contract");
  const [title, setTitle] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const docsQ = useQuery({
    queryKey: ["hr-documents", company?.id],
    queryFn: () => fetchDocs({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const employeesQ = useQuery({
    queryKey: ["hr-employees-for-docs", company?.id],
    queryFn: () => fetchEmployees({ data: { companyId: company!.id, status: "active" } }),
    enabled: Boolean(company?.id) && open,
    retry: false,
  });

  const saveM = useMutation({
    mutationFn: async () => {
      let storagePath: string | null = null;
      if (file) {
        const uploaded = await uploadCompanyDocument({
          file,
          companyId: company!.id,
          entityType: "payroll_employee",
          entityId: employeeId,
          register,
        });
        storagePath = uploaded.storagePath;
      }
      return saveDoc({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            employeeId,
            documentType,
            title: title.trim(),
            documentNumber: documentNumber.trim() || null,
            issuedOn: issuedOn || null,
            expiresOn: expiresOn || null,
            status,
            storagePath,
            notes: notes.trim() || null,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Document saved");
      setOpen(false);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["hr-documents", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["hr-dashboard-kpis", company?.id] });
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canView) {
    return (
      <ListWorkspace
        title="Employee Documents"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Documents" }]}
        subnav={<HrSubnav current="documents" />}
      >
        <EmptyState title="No access" description="You need hr.view to open documents." />
      </ListWorkspace>
    );
  }

  const items = docsQ.data?.items ?? [];
  const employees = employeesQ.data?.items ?? [];

  return (
    <ListWorkspace
      title="Employee Documents"
      description="Contracts, IDs and certificates with expiry tracking. Files store in the private company-documents bucket."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employee Documents" }]}
      actions={
        canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEmployeeId("");
              setDocumentType("contract");
              setTitle("");
              setDocumentNumber("");
              setIssuedOn("");
              setExpiresOn("");
              setStatus("active");
              setNotes("");
              setFile(null);
              setOpen(true);
            }}
          >
            Add document
          </Button>
        ) : undefined
      }
      subnav={<HrSubnav current="documents" />}
    >
      {typeof docsQ.data?.expiringSoon === "number" && docsQ.data.expiringSoon > 0 ? (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
          {docsQ.data.expiringSoon} document(s) expire within 30 days.
        </p>
      ) : null}
      {docsQ.isPending ? (
        <LoadingState />
      ) : docsQ.isError ? (
        <QueryErrorState queries={[docsQ]} title="Could not load documents" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Register contracts and IDs against the shared employee identity."
          action={
            canManage ? (
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setEmployeeId("");
                  setDocumentType("contract");
                  setTitle("");
                  setDocumentNumber("");
                  setIssuedOn("");
                  setExpiresOn("");
                  setStatus("active");
                  setNotes("");
                  setFile(null);
                  setOpen(true);
                }}
              >
                Add document
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
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">{row.employeeNumber}</div>
                  </TableCell>
                  <TableCell>{row.documentType}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.expiresOn ?? "—"}</TableCell>
                  <TableCell>{row.storagePath ? "Attached" : "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee document</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              {employeesQ.isPending ? (
                <LoadingState />
              ) : employeesQ.isError ? (
                <QueryErrorState queries={[employeesQ]} title="Could not load employees" />
              ) : employeesQ.isSuccess ? (
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
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <RecordLookupSelect value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Document number</Label>
              <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Issued</Label>
                <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Expires</Label>
                <Input
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <RecordLookupSelect value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_DOCUMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>File (optional)</Label>
              <Input
                type="file"
                accept={FILE_INPUT_ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !employeeId || !title.trim() || saveM.isPending || !employeesQ.isSuccess
              }
              onClick={() => saveM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
