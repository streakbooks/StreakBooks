import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { listFirmServiceCategories } from "@/lib/firm/firm-catalogue.functions";
import {
  CLIENT_STATUSES,
  bulkUpdateFirmClientProfiles,
  bulkUpdateFirmClientTags,
  listFirmClientProfileAudit,
  type FirmClientProfile,
  type FirmClientBulkInput,
} from "@/lib/firm/client-profiles.functions";
import { getFirmClientName, STATUS_LABELS, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BulkField = FirmClientBulkInput["field"] | "tags";
type TagOperation = "add" | "remove" | "replace";
function formatAuditValue(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) return value.join(", ") || "—";
  return value || "—";
}
const AUDIT_LABELS = {
  status: "Status",
  service_line: "Service",
  next_review_date: "Review date",
  tags: "Tags",
} as const;

export function FirmBulkClientActions({
  firmId,
  clients,
  selectedClients,
  profiles,
  disabled,
  onComplete,
}: {
  firmId: string;
  clients: FirmClientRow[];
  selectedClients: FirmClientRow[];
  profiles: FirmClientProfile[];
  disabled: boolean;
  onComplete: () => void;
}) {
  const qc = useQueryClient();
  const bulkUpdate = useServerFn(bulkUpdateFirmClientProfiles);
  const bulkTags = useServerFn(bulkUpdateFirmClientTags);
  const listAudit = useServerFn(listFirmClientProfileAudit);
  const listServices = useServerFn(listFirmServiceCategories);
  const [field, setField] = useState<BulkField>("status");
  const [status, setStatus] = useState<(typeof CLIENT_STATUSES)[number]>("active");
  const [service, setService] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [tagOperation, setTagOperation] = useState<TagOperation>("add");
  const [tagsText, setTagsText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const profileByCompany = new Map(profiles.map((p) => [p.company_id, p]));
  const clientNames = new Map(
    clients.map((client) => [client.company_id, getFirmClientName(client)]),
  );
  const servicesQ = useQuery({
    queryKey: ["firm-service-categories", firmId],
    queryFn: () => listServices({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const auditQ = useQuery({
    queryKey: ["firm-client-profile-audit", firmId],
    queryFn: () => listAudit({ data: { firmId } }),
    enabled: auditOpen && Boolean(firmId),
  });

  const tags = [
    ...new Set(
      tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  const value =
    field === "status" ? status : field === "service_line" ? service.trim() : reviewDate || null;
  const tagActionLabel =
    tagOperation === "add" ? "Add" : tagOperation === "remove" ? "Remove" : "Replace with";
  const fieldDescription =
    field === "status"
      ? STATUS_LABELS[status]
      : field === "service_line"
        ? service.trim() || "Clear primary service"
        : field === "tags"
          ? `${tagActionLabel}: ${tags.join(", ") || "(clear all)"}`
          : reviewDate || "Clear next review date";

  const mutation = useMutation({
    mutationFn: async () => {
      if (disabled || selectedClients.length < 1 || selectedClients.length > 50) {
        throw new Error("Select 1 to 50 accessible clients");
      }
      const items = selectedClients.map((client) => ({
        companyId: client.company_id,
        expectedVersion: profileByCompany.get(client.company_id)?.version ?? 0,
      }));
      if (field === "tags") {
        if (tags.length > 12 || (tagOperation !== "replace" && !tags.length))
          throw new Error("Enter 1 to 12 tags; replace may be empty to clear all");
        if (tags.some((tag) => tag.length > 40))
          throw new Error("Each tag must be no more than 40 characters");
        return bulkTags({ data: { firmId, items, operation: tagOperation, tags } });
      }
      return bulkUpdate({ data: { firmId, items, field, value } });
    },
    onSuccess: async (result) => {
      setConfirmOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["firm-client-profiles", firmId] }),
        qc.invalidateQueries({ queryKey: ["firm-client-profile-audit", firmId] }),
      ]);
      onComplete();
      toast.success(
        `Updated ${result.updated} client profiles` +
          (result.unchanged ? `; ${result.unchanged} already matched` : ""),
      );
    },
    onError: (error) => {
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ["firm-client-profiles", firmId] });
      onComplete();
      toast.error(friendlyAuthError(error) + " Refresh the client list before retrying.");
    },
  });

  return (
    <section aria-label="Bulk client profile actions" className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3">
          <h3 className="font-semibold">Bulk client profile update</h3>
          <p className="text-sm text-muted-foreground">
            {selectedClients.length} clients selected from the current filtered directory (maximum
            50). Only firm-owned practice details change; client books and access remain untouched.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1 space-y-1">
            <Label>Change field</Label>
            <Select
              value={field}
              onValueChange={(next) => setField(next as BulkField)}
              disabled={mutation.isPending}
            >
              {/* lookup-fixed-enum: Only validated practice profile fields are editable. */}
              <SelectTrigger aria-label="Choose bulk client field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Practice status</SelectItem>
                <SelectItem value="service_line">Primary service</SelectItem>
                <SelectItem value="next_review_date">Next review date</SelectItem>
                <SelectItem value="tags">Client tags</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field === "status" ? (
            <div className="min-w-44 flex-1 space-y-1">
              <Label>New practice status</Label>
              <Select
                value={status}
                onValueChange={(next) => setStatus(next as typeof status)}
                disabled={mutation.isPending}
              >
                {/* lookup-fixed-enum: Lifecycle statuses are defined in the profile schema. */}
                <SelectTrigger aria-label="New practice status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {STATUS_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : field === "service_line" ? (
            <div className="min-w-44 flex-1 space-y-1">
              <Label htmlFor="firm-bulk-service">Primary service (blank clears)</Label>
              <Input
                id="firm-bulk-service"
                maxLength={120}
                value={service}
                disabled={mutation.isPending}
                onChange={(event) => setService(event.target.value)}
                placeholder="Bookkeeping, Payroll, Advisory…"
                list="firm-bulk-service-category-options"
              />
              {servicesQ.isError ? (
                <QueryErrorState
                  queries={[servicesQ]}
                  title="Could not load service catalogue suggestions"
                />
              ) : servicesQ.isSuccess ? (
                <datalist id="firm-bulk-service-category-options">
                  {(servicesQ.data ?? [])
                    .filter((item) => item.is_active)
                    .map((item) => (
                      <option key={item.id} value={item.name} />
                    ))}
                </datalist>
              ) : null}
            </div>
          ) : field === "tags" ? (
            <>
              <div className="min-w-36 space-y-1">
                <Label>Tag operation</Label>
                <Select
                  value={tagOperation}
                  disabled={mutation.isPending}
                  onValueChange={(next) => setTagOperation(next as TagOperation)}
                >
                  {/* lookup-fixed-enum: Tag operations are explicitly validated. */}
                  <SelectTrigger aria-label="Choose tag operation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add tags</SelectItem>
                    <SelectItem value="remove">Remove tags</SelectItem>
                    <SelectItem value="replace">Replace all tags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor="firm-bulk-tags">Tags (comma-separated, up to 12)</Label>
                <Input
                  id="firm-bulk-tags"
                  value={tagsText}
                  disabled={mutation.isPending}
                  maxLength={500}
                  placeholder="Payroll, Monthly, Advisory"
                  onChange={(event) => setTagsText(event.target.value)}
                />
                {tagOperation === "replace" && (
                  <p className="text-xs text-muted-foreground">Leave blank to clear all tags.</p>
                )}
              </div>
            </>
          ) : (
            <div className="min-w-44 flex-1 space-y-1">
              <Label htmlFor="firm-bulk-review">Next review date (blank clears)</Label>
              <Input
                id="firm-bulk-review"
                type="date"
                value={reviewDate}
                disabled={mutation.isPending}
                onChange={(event) => setReviewDate(event.target.value)}
              />
            </div>
          )}
          <Button
            disabled={
              disabled ||
              mutation.isPending ||
              !selectedClients.length ||
              (field === "tags" &&
                (tags.length > 12 ||
                  (tagOperation !== "replace" && !tags.length) ||
                  tags.some((tag) => tag.length > 40)))
            }
            onClick={() => setConfirmOpen(true)}
          >
            Review changes ({selectedClients.length})
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk client profile update</AlertDialogTitle>
            <AlertDialogDescription>
              Set {AUDIT_LABELS[field]} to “{fieldDescription}” for {selectedClients.length}
              selected clients. This is a single transaction: if any client has changed access or
              revision, all updates will roll back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-sm">
            {selectedClients.slice(0, 10).map((client) => (
              <div key={client.company_id}>{getFirmClientName(client)}</div>
            ))}
            {selectedClients.length > 10 && (
              <p className="text-muted-foreground">And {selectedClients.length - 10} more…</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                disabled={disabled || mutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  mutation.mutate();
                }}
              >
                {mutation.isPending ? "Applying…" : "Apply to selected clients"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAuditOpen((current) => !current)}
          aria-expanded={auditOpen}
        >
          {auditOpen ? "Hide profile history" : "View recent profile history"}
        </Button>
        {auditOpen && (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            {auditQ.isPending ? (
              <p className="p-4 text-sm text-muted-foreground">Loading recent changes…</p>
            ) : auditQ.isError ? (
              <div className="p-4">
                <QueryErrorState queries={[auditQ]} title="Could not load profile history" />
              </div>
            ) : !auditQ.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">No profile changes recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Changed details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditQ.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(entry.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {clientNames.get(entry.company_id) ?? "Restricted client"}
                      </TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell className="max-w-xs text-xs">
                        {entry.changed_fields.map((key) => {
                          const fieldKey = key as keyof typeof AUDIT_LABELS;
                          if (!(fieldKey in AUDIT_LABELS)) return null;
                          const before = formatAuditValue(entry.before_values?.[fieldKey]);
                          const after = formatAuditValue(entry.after_values[fieldKey]);
                          return (
                            <p key={key}>
                              {AUDIT_LABELS[fieldKey]}: {before} → {after}
                            </p>
                          );
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
