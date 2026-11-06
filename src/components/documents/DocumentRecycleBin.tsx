import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArchiveRestore, Clock3, LockKeyhole, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { ATTACHMENT_ENTITIES, type AttachmentEntityType, formatFileSize } from "@/lib/documents/attachments";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { canOfferPermanentPurge, validateRetentionDays } from "@/lib/documents/recycle-bin-rules";
import {
  getDocumentRetentionSettings, listRecycleBinFiles, listStorageCleanupJobs,
  purgeRecycleBinFile, restoreRecycleBinFile, retryDocumentStorageCleanup,
  setRecycleBinRetentionHold, updateDocumentRetentionSettings,
} from "@/lib/documents/recycle-bin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DocumentRecycleBin({
  companyId, onClose,
}: { companyId: string; onClose: () => void }) {
  const { can } = useCan();
  const canManageCompany = ATTACHMENT_ENTITIES.company.manage.some((permission) => can(permission));
  const canManageFile = (entityType: string) => (
    entityType in ATTACHMENT_ENTITIES &&
    ATTACHMENT_ENTITIES[entityType as AttachmentEntityType].manage.some((permission) => can(permission))
  );
  const client = useQueryClient();
  const list = useServerFn(listRecycleBinFiles);
  const getPolicy = useServerFn(getDocumentRetentionSettings);
  const savePolicy = useServerFn(updateDocumentRetentionSettings);
  const restore = useServerFn(restoreRecycleBinFile);
  const hold = useServerFn(setRecycleBinRetentionHold);
  const purge = useServerFn(purgeRecycleBinFile);
  const listCleanup = useServerFn(listStorageCleanupJobs);
  const retryCleanup = useServerFn(retryDocumentStorageCleanup);

  const [page, setPage] = useState(0);
  const [daysInput, setDaysInput] = useState("30");
  const [pendingPurge, setPendingPurge] = useState<{ id: string; fileName: string } | null>(null);

  const trash = useQuery({
    queryKey: ["recycle-bin-files", companyId, page],
    queryFn: () => list({ data: { companyId, page } }),
    retry: false,
  });
  const policy = useQuery({
    queryKey: ["document-retention-settings", companyId],
    queryFn: () => getPolicy({ data: { companyId } }),
    retry: false,
  });
  const cleanup = useQuery({
    queryKey: ["document-storage-cleanup", companyId],
    enabled: canManageCompany,
    queryFn: () => listCleanup({ data: { companyId } }),
    retry: false,
  });
  useEffect(() => {
    if (policy.data) setDaysInput(String(policy.data.retentionDays));
  }, [policy.data]);
  const refresh = async () => Promise.all([
    client.invalidateQueries({ queryKey: ["recycle-bin-files", companyId] }),
    client.invalidateQueries({ queryKey: ["company-files", companyId] }),
    client.invalidateQueries({ queryKey: ["document-review-queue", companyId] }),
    client.invalidateQueries({ queryKey: ["document-storage-cleanup", companyId] }),
  ]);
  const policyM = useMutation({
    mutationFn: (days: number) => savePolicy({ data: { companyId, retentionDays: days } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["document-retention-settings", companyId] });
      toast.success("Retention period updated. Previously recycled files keep their existing dates.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const restoreM = useMutation({
    mutationFn: (attachmentId: string) => restore({ data: { companyId, attachmentId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("File restored to its previous folder and linked records");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const holdM = useMutation({
    mutationFn: ({ attachmentId, enabled }: { attachmentId: string; enabled: boolean }) =>
      hold({ data: { companyId, attachmentId, enabled } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Retention protection updated");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const purgeM = useMutation({
    mutationFn: (attachmentId: string) => purge({ data: { companyId, attachmentId } }),
    onSuccess: async (result) => {
      setPendingPurge(null);
      await refresh();
      if (result.cleanupComplete) toast.success("File permanently purged and Storage cleaned");
      else toast.warning("Metadata permanently purged. Storage cleanup is queued for retry.");
    },
    onError: (error) => {
      setPendingPurge(null);
      toast.error(friendlyAuthError(error));
    },
  });
  const cleanupM = useMutation({
    mutationFn: (jobId: string) => retryCleanup({ data: { companyId, jobId } }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["document-storage-cleanup", companyId] });
      if (result.completed) toast.success("Storage cleanup completed");
      else toast.warning("Storage object remains. Administrator recovery may be needed.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <section aria-label="Documents Recycle Bin" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ArchiveRestore className="size-5" /> Recycle Bin
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleted documents stay recoverable for at least their assigned retention period.
            Restoring preserves file history, folders, tags, and linked records.
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>Back to Files</Button>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <Clock3 className="size-4" /> Organisation retention policy
        </h3>
        {policy.isError ? (
          <p role="alert" className="text-sm text-destructive">{friendlyAuthError(policy.error)}</p>
        ) : policy.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">Loading retention settings…</p>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              try { policyM.mutate(validateRetentionDays(daysInput)); }
              catch (error) { toast.error(friendlyAuthError(error)); }
            }}
          >
            <label className="space-y-1 text-sm" htmlFor="document-retention-days">
              <span>Keep recycled documents for at least (days)</span>
              <Input
                id="document-retention-days"
                type="number"
                min={7}
                max={3650}
                step={1}
                className="w-44"
                disabled={!canManageCompany}
                value={daysInput}
                onChange={(event) => setDaysInput(event.target.value)}
              />
            </label>
            {canManageCompany ? (
              <Button size="sm" type="submit" disabled={policyM.isPending}>Save policy</Button>
            ) : null}
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          Default 30 days; configurable between 7 and 3,650 days. Changing the policy
          never shortens retention already assigned to recycled documents. There is no
          automatic scheduled purge; authorized users must confirm permanent deletion after
          the retention date. Retention protection blocks it completely until removed.
        </p>
      </div>

      {trash.isError ? (
        <div role="alert" className="space-y-2 rounded-lg border p-3 text-sm text-destructive">
          {friendlyAuthError(trash.error)}
          <Button size="sm" variant="outline" onClick={() => void trash.refetch()}>Retry</Button>
        </div>
      ) : trash.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Loading recycled files…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {trash.data.total} recycled file(s) visible to your account
          </p>
          {trash.data.rows.length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              No recycled files on this page.
            </p>
          ) : trash.data.rows.map((file) => {
            const allowed = canManageFile(file.entity_type);
            const eligible = canOfferPermanentPurge(file, Date.now());
            return (
              <div key={file.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{file.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size_bytes)} · Recycled{" "}
                      {new Date(file.deleted_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Earliest permanent deletion: {new Date(file.purge_after).toLocaleString()}
                      {file.retention_hold ? " · Protected from purge" : ""}
                    </p>
                  </div>
                  {allowed ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm" variant="outline"
                        disabled={restoreM.isPending || purgeM.isPending}
                        onClick={() => restoreM.mutate(file.id)}
                      ><RotateCcw className="mr-1 size-4" /> Restore</Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={holdM.isPending}
                        onClick={() => holdM.mutate({
                          attachmentId: file.id,
                          enabled: !file.retention_hold,
                        })}
                      ><LockKeyhole className="mr-1 size-4" />
                        {file.retention_hold ? "Remove protection" : "Protect"}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={!eligible || purgeM.isPending || restoreM.isPending}
                        onClick={() => setPendingPurge({ id: file.id, fileName: file.file_name })}
                      ><Trash2 className="mr-1 size-4" /> Purge permanently</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-sm">
            <Button
              size="sm" variant="outline" disabled={page === 0}
              onClick={() => setPage(Math.max(0,page-1))}
            >Previous</Button>
            <span>Page {page + 1} of {Math.max(1, Math.ceil(trash.data.total / trash.data.pageSize))}</span>
            <Button
              size="sm" variant="outline"
              disabled={(page + 1) * trash.data.pageSize >= trash.data.total}
              onClick={() => setPage(page+1)}
            >Next</Button>
          </div>
        </div>
      )}

      {canManageCompany ? (
        <section aria-label="Storage cleanup recovery" className="space-y-2 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">Storage cleanup recovery</h3>
          <p className="text-xs text-muted-foreground">
            Permanent deletion can finish in the database before private Storage removal.
            Failed cleanup remains in a durable queue. Retrying verifies actual object removal.
          </p>
          {cleanup.isPending ? (
            <p role="status" className="text-xs text-muted-foreground">Loading cleanup backlog…</p>
          ) : cleanup.isError ? (
            <p role="alert" className="text-xs text-destructive">{friendlyAuthError(cleanup.error)}</p>
          ) : cleanup.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending cleanup jobs.</p>
          ) : cleanup.data.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-2">
              <p className="text-xs text-muted-foreground">
                {job.objects} Storage object(s) · Requested {new Date(job.createdAt).toLocaleString()}
              </p>
              <Button
                size="sm" variant="outline"
                disabled={cleanupM.isPending}
                onClick={() => cleanupM.mutate(job.id)}
              >Retry cleanup</Button>
            </div>
          ))}
        </section>
      ) : null}

      <AlertDialog
        open={Boolean(pendingPurge)}
        onOpenChange={(open) => !open && !purgeM.isPending && setPendingPurge(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete the recycled document?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingPurge?.fileName}” will lose its metadata, file history, tags and review
              records permanently. Stored copies will be removed or queued for administrator
              cleanup. This cannot be undone. Confirm only when retention obligations permit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingPurge || purgeM.isPending}
              onClick={() => pendingPurge && purgeM.mutate(pendingPurge.id)}
            >{purgeM.isPending ? "Purging…" : "Permanently purge"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
