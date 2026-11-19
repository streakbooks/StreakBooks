import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, History, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { type AttachmentEntityType, formatFileSize } from "@/lib/documents/attachments";
import {
  downloadFileVersion,
  listFileVersions,
  registerFileVersion,
} from "@/lib/documents/file-versions.functions";
import { validateVersionReplacement } from "@/lib/documents/file-versions";
import { uploadDocumentVersion } from "@/lib/documents/upload-client";
import { openSignedDownload } from "@/lib/documents/ui";

/** Old versions never overwrite the current one; read access follows document RLS. */
export function DocumentVersionHistory({
  companyId,
  attachmentId,
  entityType,
  entityId,
  currentName,
  canManage,
}: {
  companyId: string;
  attachmentId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  currentName: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fetchHistory = useServerFn(listFileVersions);
  const register = useServerFn(registerFileVersion);
  const fetchVersion = useServerFn(downloadFileVersion);

  const history = useQuery({
    queryKey: ["file-versions", companyId, attachmentId],
    queryFn: () => fetchHistory({ data: { companyId, attachmentId } }),
    retry: false,
  });
  const upload = useMutation({
    mutationFn: ({ file, expectedVersion }: { file: File; expectedVersion: number }) =>
      uploadDocumentVersion({
        file,
        companyId,
        attachmentId,
        entityType,
        entityId,
        currentName,
        expectedVersion,
        register: register as never,
      }),
    onSuccess: async ({ version }) => {
      setPendingFile(null);
      if (picker.current) picker.current.value = "";
      await Promise.all([
        client.invalidateQueries({ queryKey: ["file-versions", companyId, attachmentId] }),
        client.invalidateQueries({ queryKey: ["company-file-details", companyId, attachmentId] }),
        client.invalidateQueries({ queryKey: ["company-file-preview", companyId, attachmentId] }),
        client.invalidateQueries({ queryKey: ["company-files", companyId] }),
      ]);
      toast.success(`Document version ${version} created. Older versions remain available.`);
    },
    onError: (error) => {
      setPendingFile(null);
      if (picker.current) picker.current.value = "";
      void history.refetch();
      toast.error(friendlyAuthError(error));
    },
  });
  const download = useMutation({
    mutationFn: (version: number) => fetchVersion({ data: { companyId, attachmentId, version } }),
    onSuccess: (response) => openSignedDownload(response.url, response.fileName),
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const chooseReplacement = (files: FileList | null) => {
    const file = files?.item(0);
    if (!file || !canManage || upload.isPending || !history.data) return;
    try {
      validateVersionReplacement(currentName, file, history.data.currentVersion);
      setPendingFile(file);
    } catch (error) {
      toast.error(friendlyAuthError(error));
      if (picker.current) picker.current.value = "";
    }
  };

  return (
    <section aria-label="Document version history" className="mt-4 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4" /> Version history
        </h3>
        {canManage && history.data ? (
          <>
            <input
              ref={picker}
              type="file"
              className="hidden"
              aria-label="Select replacement version"
              accept={`.${currentName.split(".").pop() ?? ""}`}
              onChange={(event) => chooseReplacement(event.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending || history.data.currentVersion >= 50}
              onClick={() => picker.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-1 size-4" />
              )}
              Upload new version
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Replacements keep the same file extension and the existing LinkBooks document link. Previous
        versions are preserved in private Storage and cannot be edited. Maximum 50 versions per
        file.
      </p>
      {history.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading version history…
        </p>
      ) : history.isError ? (
        <QueryErrorState queries={[history]} title="Could not load version history" />
      ) : history.data ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Current version: {history.data.currentVersion}
          </p>
          <ol className="max-h-64 space-y-2 overflow-y-auto">
            {history.data.versions.map((item) => (
              <li
                key={item.version}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-all font-medium">
                    Version {item.version}
                    {item.isCurrent ? " · Current" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()} · {formatFileSize(item.sizeBytes)}
                    {item.uploadedBy ? " · Recorded uploader" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={download.isPending}
                  onClick={() => download.mutate(item.version)}
                >
                  {download.isPending ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <Download className="mr-1 size-4" />
                  )}
                  Download v{item.version}
                </Button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(pendingFile)}
        onOpenChange={(open) => !open && !upload.isPending && setPendingFile(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload a new document version?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingFile?.name}” will become version {(history.data?.currentVersion ?? 0) + 1}.
              Your existing file link will point to the new content, but older versions will remain
              downloadable. The selected document must still be awaiting review if it belongs to the
              document-review queue. This does not post accounting entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={upload.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={upload.isPending || !pendingFile || !history.data}
              onClick={() => {
                if (pendingFile && history.data)
                  upload.mutate({
                    file: pendingFile,
                    expectedVersion: history.data.currentVersion,
                  });
              }}
            >
              {upload.isPending ? "Uploading…" : "Create new version"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
