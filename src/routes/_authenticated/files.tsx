import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
  ArrowUpDown,
  X,
  FolderPlus,
  Folder,
  Pencil,
  FolderInput,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { DocumentReviewQueue } from "@/components/documents/DocumentReviewQueue";
import {
  deleteAttachment,
  getAttachmentDownload,
  getAttachmentPreview,
  listCompanyFiles,
  registerAttachment,
} from "@/lib/documents/attachments.functions";
import {
  ATTACHMENT_ENTITIES,
  ATTACHMENT_ENTITY_TYPES,
  FILE_INPUT_ACCEPT,
  MAX_FILE_BYTES,
  formatFileSize,
  validateUpload,
} from "@/lib/documents/attachments";
import {
  listDocumentFolders,
  createDocumentFolder,
  updateDocumentFolder,
  deleteDocumentFolder,
  moveDocumentToFolder,
} from "@/lib/documents/folders.functions";
import { folderAncestors, possibleParentFolders } from "@/lib/documents/folder-tree";
import { downloadBase64, uploadCompanyDocument } from "@/lib/documents/upload-client";
import { openSignedDownload } from "@/lib/documents/ui";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/files")({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { folder?: string | undefined; file?: string | undefined } => ({
    ...(typeof raw["folder"] === "string" && raw["folder"]
      ? { folder: raw["folder"] as string }
      : {}),
    ...(typeof raw["file"] === "string" && raw["file"] ? { file: raw["file"] as string } : {}),
  }),
  head: () => ({ meta: [{ title: "Files — LinkBooks" }] }),
  component: FilesPage,
});

const PAGE_SIZE = 25;

function FilesPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const { can } = useCan();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchFiles = useServerFn(listCompanyFiles);
  const register = useServerFn(registerAttachment);
  const fetchDownload = useServerFn(getAttachmentDownload);
  const fetchPreview = useServerFn(getAttachmentPreview);
  const remove = useServerFn(deleteAttachment);
  const inputRef = useRef<HTMLInputElement>(null);
  const getFolders = useServerFn(listDocumentFolders);
  const createFolder = useServerFn(createDocumentFolder);
  const updateFolder = useServerFn(updateDocumentFolder);
  const deleteFolder = useServerFn(deleteDocumentFolder);
  const moveFile = useServerFn(moveDocumentToFolder);
  const { folder, file } = Route.useSearch();
  const navigate = Route.useNavigate();
  const folderId = folder ?? null;
  const selectedFile = file ?? null;
  const setFolderId = (id: string | null) =>
    void navigate({
      to: "/files",
      search: (previous) => ({ ...previous, folder: id ?? undefined, file: undefined }),
    });
  const setSelectedFile = (id: string | null) =>
    void navigate({ to: "/files", search: (previous) => ({ ...previous, file: id ?? undefined }) });
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [pendingFolderMove, setPendingFolderMove] = useState<{
    id: string;
    name: string;
    parentId: string | null;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "oldest" | "name" | "largest">("newest");
  const [view, setView] = useState<"all" | "to-file" | "review">("all");
  const activeView = folderId ? "all" : view;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTarget, setBulkTarget] = useState("unfiled");
  const [inlinePreviewUrl, setInlinePreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  // Folder navigation temporarily shows all files without discarding the chosen workspace view.
  const canUpload = ATTACHMENT_ENTITIES.company.manage.some((p) => can(p));

  const foldersQ = useQuery({
    queryKey: ["document-folders", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getFolders({ data: { companyId: companyId! } }),
  });
  type FolderRow = { id: string; name: string; parent_id: string | null };
  const folders = (foldersQ.data ?? []) as FolderRow[];
  const activeFolder = folders.find((f) => f.id === folderId);
  const breadcrumbs = folderAncestors(folders, folderId);
  const folderM = useMutation({
    mutationFn: async (name: string) =>
      createFolder({ data: { companyId: companyId!, name, parentId: folderId } }),
    onSuccess: async () => {
      setNewFolderName("");
      setShowNewFolder(false);
      await queryClient.invalidateQueries({ queryKey: ["document-folders", companyId] });
      toast.success("Folder created");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const renameFolderM = useMutation({
    mutationFn: async ({
      id,
      name,
      parentId,
    }: {
      id: string;
      name: string;
      parentId: string | null;
    }) => updateFolder({ data: { companyId: companyId!, folderId: id, name, parentId } }),
    onSuccess: async () => {
      setRenameFolderOpen(false);
      setPendingFolderMove(null);
      await queryClient.invalidateQueries({ queryKey: ["document-folders", companyId] });
      toast.success("Folder updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const removeFolderM = useMutation({
    mutationFn: (id: string) => deleteFolder({ data: { companyId: companyId!, folderId: id } }),
    onSuccess: async () => {
      setFolderId(null);
      await queryClient.invalidateQueries({ queryKey: ["document-folders", companyId] });
      toast.success("Empty folder deleted");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const moveM = useMutation({
    mutationFn: ({ attachmentId, targetId }: { attachmentId: string; targetId: string | null }) =>
      moveFile({ data: { companyId: companyId!, attachmentId, folderId: targetId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-files", companyId] });
      toast.success("File moved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const filesQ = useQuery({
    queryKey: ["company-files", companyId, debounced, type, folderId, page, sort, view],
    enabled: Boolean(companyId) && activeView !== "review",
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchFiles({
        data: {
          companyId: companyId!,
          search: debounced,
          entityType: activeView === "to-file" ? "company" : type,
          folderId: activeView === "to-file" ? null : folderId,
          unfiledOnly: activeView === "to-file",
          sort,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const previewQ = useQuery({
    queryKey: ["company-file-preview", companyId, selectedFile],
    enabled: Boolean(companyId && selectedFile),
    queryFn: () => fetchPreview({ data: { companyId: companyId!, attachmentId: selectedFile! } }),
    retry: false,
  });
  useEffect(() => {
    const data = previewQ.data;
    if (data?.kind !== "inline") {
      setInlinePreviewUrl(null);
      return;
    }
    const raw = atob(data.contentBase64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: data.contentType }));
    setInlinePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewQ.data]);
  // Selection is deliberately limited to the current result page and its permissions.
  useEffect(() => setSelectedIds([]), [companyId, debounced, type, folderId, page, sort, view]);

  const uploadM = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await uploadCompanyDocument({
          file,
          companyId: companyId!,
          entityType: "company",
          entityId: companyId!,
          folderId,
          register: register as never,
        });
      }
      return files.length;
    },
    onSuccess: async (n) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["company-files", companyId] });
      toast.success(n === 1 ? "File uploaded" : `${n} files uploaded`);
    },
    onError: async (e) => {
      setError(friendlyAuthError(e));
      await queryClient.invalidateQueries({ queryKey: ["company-files", companyId] });
    },
  });

  const downloadM = useMutation({
    mutationFn: (id: string) =>
      fetchDownload({ data: { companyId: companyId!, attachmentId: id } }),
    onSuccess: (r) => {
      if (r.kind === "url") openSignedDownload(r.url, r.fileName);
      else downloadBase64(r.fileName, r.contentType, r.contentBase64);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => remove({ data: { companyId: companyId!, attachmentId: id } }),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["company-files", companyId] });
      toast.success("File deleted");
    },
    onError: (e) => {
      setPendingDelete(null);
      toast.error(friendlyAuthError(e));
    },
  });

  const bulkMoveM = useMutation({
    mutationFn: async ({ ids, targetId }: { ids: string[]; targetId: string | null }) => {
      let moved = 0;
      for (const attachmentId of ids) {
        try {
          await moveFile({ data: { companyId: companyId!, attachmentId, folderId: targetId } });
          moved += 1;
        } catch (error) {
          throw new Error(`Moved ${moved} of ${ids.length} files. ${friendlyAuthError(error)}`);
        }
      }
      return moved;
    },
    onSuccess: async (count) => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["company-files", companyId] });
      toast.success(`Moved ${count} file${count === 1 ? "" : "s"}`);
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: ["company-files", companyId] });
      toast.error(friendlyAuthError(error));
    },
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const onPick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    for (const f of files) {
      const check = validateUpload({ fileName: f.name, sizeBytes: f.size, contentType: f.type });
      if (!check.ok) {
        setError(`${f.name}: ${check.error}`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }
    setError(null);
    uploadM.mutate(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const data = filesQ.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selected = data?.files.find((file) => file.id === selectedFile) ?? null;
  const canManage = (entityType: string) =>
    (entityType in ATTACHMENT_ENTITIES
      ? ATTACHMENT_ENTITIES[entityType as keyof typeof ATTACHMENT_ENTITIES].manage
      : []
    ).some((permission) => can(permission));
  const selectableIds = (data?.files ?? [])
    .filter((file) => canManage(file.entity_type))
    .map((file) => file.id);
  const currentSelection = selectedIds.filter((id) => selectableIds.includes(id));
  const allSelected = selectableIds.length > 0 && currentSelection.length === selectableIds.length;
  const preview = previewQ.data;
  const previewUrl =
    preview?.kind === "url" ? preview.url : preview?.kind === "inline" ? inlinePreviewUrl : null;

  if (activeView === "review") {
    return (
      <ListWorkspace
        title="Document review"
        description="Organise and approve uploaded documents without changing accounting records."
        actions={
          <Button size="sm" variant="outline" onClick={() => setView("all")}>
            Back to Files
          </Button>
        }
      >
        <DocumentReviewQueue companyId={companyId} onClose={() => setView("all")} />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Files"
      description="Everything attached to invoices, bills, contacts and journals, plus files you upload here. You only see files for records you are allowed to view."
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setView("review");
              setFolderId(null);
            }}
          >
            <ClipboardCheck className="mr-1 size-4" />
            Document review
          </Button>
          {canUpload ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                accept={FILE_INPUT_ACCEPT}
                aria-label="Choose files to upload"
                onChange={(e) => onPick(e.target.files)}
              />
              <Button
                size="sm"
                disabled={uploadM.isPending}
                onClick={() => inputRef.current?.click()}
              >
                {uploadM.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 size-4" />
                )}
                Upload files
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div
        className={`lb-files-dropzone mb-4 rounded-xl border-2 border-dashed px-5 py-6 text-sm transition-[background-color,border-color,box-shadow] ${dragActive ? "border-primary bg-primary/10 shadow-sm" : "border-border/85 bg-muted/20"}`}
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragActive(false);
          onPick(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center gap-2">
          <Upload className="size-4" />
          {canUpload
            ? "Drop files here or use Upload files. Maximum 20 MB per file."
            : "Files available to your organisation."}
        </div>
      </div>
      <section
        aria-label="Document folders"
        className="mb-5 rounded-2xl border border-border/85 bg-card p-4 shadow-card sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Folder className="size-4" />
            <Link
              to="/files"
              search={{ folder: undefined, file: undefined }}
              className="text-sm underline"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                  setPage(0);
                  setView("all");
                }
              }}
            >
              All files
            </Link>
            {breadcrumbs.map((crumb) => (
              <Link
                to="/files"
                search={{ folder: crumb.id }}
                key={crumb.id}
                className="text-sm underline"
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) setPage(0);
                }}
              >
                / {crumb.name}
              </Link>
            ))}
          </div>
          {canUpload ? (
            <Button size="sm" variant="outline" onClick={() => setShowNewFolder((v) => !v)}>
              <FolderPlus className="mr-2 size-4" />
              New folder
            </Button>
          ) : null}
        </div>
        {showNewFolder ? (
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolderName.trim()) folderM.mutate(newFolderName);
            }}
          >
            <Input
              aria-label="New folder name"
              placeholder="Folder name"
              maxLength={120}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={folderM.isPending || !newFolderName.trim()}>
              Create
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
          </form>
        ) : null}
        {foldersQ.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Folder loading failed: {friendlyAuthError(foldersQ.error)}. Apply the document folders
            migration if it is pending.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {activeFolder?.parent_id ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/files"
                search={{ folder: activeFolder.parent_id }}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) setPage(0);
                }}
              >
                Parent folder
              </Link>
            </Button>
          ) : null}
          {folders
            .filter((f) => f.parent_id === folderId)
            .map((folder) => (
              <Button key={folder.id} size="sm" variant="outline" asChild>
                <Link
                  to="/files"
                  search={{ folder: folder.id }}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) setPage(0);
                  }}
                >
                  <Folder className="mr-2 size-4" />
                  {folder.name}
                </Link>
              </Button>
            ))}
        </div>
        {activeFolder && canUpload ? (
          <div className="mt-3 flex gap-2">
            <Dialog open={renameFolderOpen} onOpenChange={setRenameFolderOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={renameFolderM.isPending}
                  onClick={() => setRenameFolderName(activeFolder.name)}
                >
                  <Pencil className="mr-1 size-4" aria-hidden="true" />
                  Rename
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = renameFolderName.trim();
                    if (!name || name === activeFolder.name || renameFolderM.isPending) return;
                    renameFolderM.mutate({
                      id: activeFolder.id,
                      name,
                      parentId: activeFolder.parent_id,
                    });
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Rename folder</DialogTitle>
                    <DialogDescription>
                      Update the name of “{activeFolder.name}”. Files and subfolders remain attached
                      to the same folder.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <label htmlFor="files-folder-rename" className="text-sm font-medium">
                      Folder name
                    </label>
                    <Input
                      id="files-folder-rename"
                      autoFocus
                      required
                      maxLength={120}
                      value={renameFolderName}
                      onChange={(event) => setRenameFolderName(event.target.value)}
                      disabled={renameFolderM.isPending}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRenameFolderOpen(false)}
                      disabled={renameFolderM.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        renameFolderM.isPending ||
                        !renameFolderName.trim() ||
                        renameFolderName.trim() === activeFolder.name
                      }
                    >
                      {renameFolderM.isPending ? "Saving…" : "Save folder name"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <RecordLookupSelect
              value={activeFolder.parent_id ?? "root"}
              onValueChange={(value) => {
                const parentId = value === "root" ? null : value;
                if (parentId === activeFolder.parent_id || renameFolderM.isPending) return;
                setPendingFolderMove({
                  id: activeFolder.id,
                  name: activeFolder.name,
                  parentId,
                });
              }}
            >
              <SelectTrigger
                className="w-48"
                aria-label="Move current folder to"
                disabled={renameFolderM.isPending}
              >
                <FolderInput className="mr-1 size-4" />
                <SelectValue placeholder="Move folder to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Root</SelectItem>
                {possibleParentFolders(folders, activeFolder.id).map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
            <AlertDialog
              open={pendingFolderMove !== null}
              onOpenChange={(open) => {
                if (!open && !renameFolderM.isPending) setPendingFolderMove(null);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Move folder “{pendingFolderMove?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This moves the folder and everything inside it to{" "}
                    {pendingFolderMove?.parentId
                      ? `“${folders.find((folder) => folder.id === pendingFolderMove?.parentId)?.name ?? "selected folder"}”`
                      : "the root folder"}
                    . Existing files remain attached to the same documents.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={renameFolderM.isPending}>
                    Keep current location
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={renameFolderM.isPending || !pendingFolderMove}
                    onClick={() => {
                      if (!pendingFolderMove) return;
                      renameFolderM.mutate(pendingFolderMove);
                    }}
                  >
                    Confirm move
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="sm" variant="ghost" disabled={removeFolderM.isPending}>
                  <Trash2 className="mr-1 size-4" aria-hidden="true" />
                  Delete empty folder
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete folder “{activeFolder.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the empty folder from the current organisation. Folders containing
                    files or child folders cannot be deleted. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={removeFolderM.isPending}>
                    Keep folder
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={removeFolderM.isPending}
                    onClick={() => removeFolderM.mutate(activeFolder.id)}
                  >
                    Delete empty folder
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </section>
      <div
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/25 p-2"
        aria-label="Files workspace views"
      >
        <Button
          size="sm"
          variant={activeView === "all" ? "default" : "outline"}
          onClick={() => {
            setView("all");
            setPage(0);
          }}
        >
          All files
        </Button>
        <Button
          size="sm"
          variant={activeView === "to-file" ? "default" : "outline"}
          onClick={() => {
            setView("to-file");
            setPage(0);
            setFolderId(null);
          }}
        >
          To file
        </Button>
        <span className="text-xs text-muted-foreground">
          To file shows unlinked uploads that have not been assigned a folder. Email intake is not
          configured here.
        </span>
      </div>
      <div className="mb-5 flex flex-wrap gap-3 rounded-xl border border-border/75 bg-card p-3 shadow-xs">
        <Input
          className="w-64"
          placeholder="Search file names"
          aria-label="Search file names"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={type}
          disabled={activeView === "to-file"}
          onValueChange={(v) => {
            setType(v);
            setPage(0);
          }}
        >
          {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

          <SelectTrigger className="w-52" aria-label="Filter by record type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            {ATTACHMENT_ENTITY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ATTACHMENT_ENTITIES[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v as typeof sort);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Sort files">
            <ArrowUpDown className="mr-2 size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">File name A–Z</SelectItem>
            <SelectItem value="largest">Largest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected ? (
        <section
          aria-label="Selected file details"
          className="mb-5 rounded-2xl border border-primary/20 bg-card p-5 shadow-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <FileText className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <h2 className="break-all text-base font-bold tracking-[-0.02em]">
                  {selected.file_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Attached to: {selected.entityLabel}
                  {selected.entityRef ? ` · ${selected.entityRef}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Size: {formatFileSize(selected.size_bytes)} · Uploaded:{" "}
                  {fmt.dateTime(selected.created_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Type: {selected.content_type || "Unknown"}
                </p>
                {selected.entityPath && selected.entity_type !== "company" ? (
                  <a className="text-sm underline" href={selected.entityPath}>
                    Open linked record
                  </a>
                ) : null}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close file details"
              onClick={() => setSelectedFile(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={downloadM.isPending}
              onClick={() => downloadM.mutate(selected.id)}
            >
              <Download className="mr-1 size-4" />
              Download
            </Button>
          </div>
          {previewQ.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading secure preview…</p>
          ) : previewQ.isError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Preview unavailable: {friendlyAuthError(previewQ.error)}
            </p>
          ) : preview?.kind === "unsupported" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Preview is not available for this format. Download to view it.
            </p>
          ) : previewUrl ? (
            (preview?.kind === "url" || preview?.kind === "inline") &&
            preview.previewType === "image" ? (
              <img
                src={previewUrl}
                alt={`Preview of ${selected.file_name}`}
                className="mt-3 max-h-96 max-w-full rounded border object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <iframe
                src={previewUrl}
                title={`Preview of ${selected.file_name}`}
                sandbox=""
                referrerPolicy="no-referrer"
                className="mt-3 h-96 w-full rounded border bg-white"
              />
            )
          ) : null}
        </section>
      ) : null}

      {filesQ.isPending ? (
        <LoadingState />
      ) : filesQ.isError ? (
        <ErrorState
          title="Could not load files"
          description={friendlyAuthError(filesQ.error)}
          onRetry={() => filesQ.refetch()}
        />
      ) : filesQ.data.files.length === 0 ? (
        <EmptyState
          title="No files"
          description={
            debounced || type !== "all"
              ? "No files match this search."
              : activeView === "to-file"
                ? "No unlinked, unfiled uploads need organising."
                : canUpload
                  ? `Upload a file here or attach one to an invoice or bill. Up to ${formatFileSize(MAX_FILE_BYTES)} each.`
                  : "No files have been added yet."
          }
        />
      ) : (
        <>
          {currentSelection.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
              <span className="text-sm font-medium">{currentSelection.length} selected</span>
              <RecordLookupSelect value={bulkTarget} onValueChange={setBulkTarget}>
                <SelectTrigger className="w-52" aria-label="Bulk move destination">
                  <FolderInput className="mr-1 size-4" />
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unfiled">Unfiled</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
              <Button
                size="sm"
                disabled={bulkMoveM.isPending}
                onClick={() =>
                  bulkMoveM.mutate({
                    ids: currentSelection,
                    targetId: bulkTarget === "unfiled" ? null : bulkTarget,
                  })
                }
              >
                {bulkMoveM.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <FolderInput className="mr-1 size-4" />
                )}
                Move selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear selection
              </Button>
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all manageable files on this page"
                    checked={allSelected}
                    disabled={selectableIds.length === 0 || bulkMoveM.isPending}
                    onChange={(e) => setSelectedIds(e.target.checked ? selectableIds : [])}
                  />
                </TableHead>
                <TableHead>File</TableHead>
                <TableHead>Attached to</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filesQ.data.files.map((f) => {
                const manageable = canManage(f.entity_type);
                return (
                  <TableRow key={f.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${f.file_name}`}
                        checked={currentSelection.includes(f.id)}
                        disabled={!manageable || bulkMoveM.isPending}
                        onChange={(e) =>
                          setSelectedIds((previous) =>
                            e.target.checked
                              ? [...previous.filter((id) => id !== f.id), f.id]
                              : previous.filter((id) => id !== f.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <Link
                        to="/files"
                        search={(previous) => ({ ...previous, file: f.id }) as never}
                        className="block max-w-xs truncate text-left font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={`View details for ${f.file_name}`}
                      >
                        {f.file_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {f.entityPath && f.entity_type !== "company" ? (
                        <a href={f.entityPath} className="underline">
                          {f.entityLabel}
                          {f.entityRef ? ` · ${f.entityRef}` : ""}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{f.entityLabel}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {manageable ? (
                        <RecordLookupSelect
                          value={f.folder_id ?? "unfiled"}
                          onValueChange={(v) =>
                            moveM.mutate({
                              attachmentId: f.id,
                              targetId: v === "unfiled" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-40"
                            aria-label={`Move ${f.file_name} to folder`}
                          >
                            <FolderInput className="mr-1 size-4" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unfiled">Unfiled</SelectItem>
                            {folders.map((folder) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </RecordLookupSelect>
                      ) : (
                        (folders.find((folder) => folder.id === f.folder_id)?.name ?? "Unfiled")
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.size_bytes != null ? formatFileSize(f.size_bytes) : "—"}
                    </TableCell>
                    <TableCell>{fmt.dateTime(f.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Download ${f.file_name}`}
                        disabled={downloadM.isPending}
                        onClick={() => downloadM.mutate(f.id)}
                      >
                        <Download className="size-4" />
                      </Button>
                      {manageable ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${f.file_name}`}
                          onClick={() => setPendingDelete({ id: f.id, name: f.file_name })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filesQ.data.total} file{filesQ.data.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span>
                Page {page + 1} of {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” will be removed permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteM.isPending}
              onClick={() => pendingDelete && deleteM.mutate(pendingDelete.id)}
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListWorkspace>
  );
}
