import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { parseFilesListSearch, type FilesListSearch } from "@/lib/documents/files-navigation";
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
  Link2,
  ArchiveRestore,
  LockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { DocumentReviewQueue } from "@/components/documents/DocumentReviewQueue";
import { DocumentEmailInbox } from "@/components/documents/DocumentEmailInbox";
import { DocumentClassificationPanel } from "@/components/documents/DocumentClassificationPanel";
import { DocumentVersionHistory } from "@/components/documents/DocumentVersionHistory";
import { DocumentRecycleBin } from "@/components/documents/DocumentRecycleBin";
import { setRecycleBinRetentionHold } from "@/lib/documents/recycle-bin.functions";
import { listDocumentTags } from "@/lib/documents/file-classification.functions";
import {
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  type FileCategory,
} from "@/lib/documents/file-classification";
import {
  checkPossibleFileDuplicates,
  deleteAttachment,
  getAttachmentDownload,
  getAttachmentPreview,
  listCompanyFiles,
  getCompanyFile,
  renameAttachment,
  registerAttachment,
} from "@/lib/documents/attachments.functions";
import {
  ATTACHMENT_ENTITIES,
  ATTACHMENT_ENTITY_TYPES,
  COMPANY_DOCUMENTS_BUCKET,
  FILE_INPUT_ACCEPT,
  isAttachmentEntityType,
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
import {
  folderAncestors,
  indexFolderPaths,
  possibleParentFolders,
} from "@/lib/documents/folder-tree";
import {
  combinePossibleDuplicateFlags,
  internalFileUrl,
  lastFilePage,
  repeatedUploadFlags,
  selectUploadIndexes,
  type FileFormat,
} from "@/lib/documents/file-workspace";
import { MAX_FILES_PER_BATCH, runFileBatch } from "@/lib/documents/file-batch";
import { downloadBase64, uploadCompanyDocument } from "@/lib/documents/upload-client";
import { openSignedDownload } from "@/lib/documents/ui";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState, LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
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
  validateSearch: parseFilesListSearch,
  head: () => ({ meta: [{ title: "Files — LinkBooks" }] }),
  component: FilesPage,
});

const PAGE_SIZE = 25;
type UploadInput = {
  files: File[];
  sourceCompanyId: string;
  targetFolderId: string | null;
};

type UploadReview = UploadInput & {
  flags: boolean[];
  scanFailed: boolean;
};

function FilesPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const { can } = useCan();
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchFiles = useServerFn(listCompanyFiles);
  const checkDuplicates = useServerFn(checkPossibleFileDuplicates);
  const fetchTags = useServerFn(listDocumentTags);
  const fetchFileDetails = useServerFn(getCompanyFile);
  const renameFile = useServerFn(renameAttachment);
  const register = useServerFn(registerAttachment);
  const fetchDownload = useServerFn(getAttachmentDownload);
  const fetchPreview = useServerFn(getAttachmentPreview);
  const remove = useServerFn(deleteAttachment);
  const setHold = useServerFn(setRecycleBinRetentionHold);
  const inputRef = useRef<HTMLInputElement>(null);
  const getFolders = useServerFn(listDocumentFolders);
  const createFolder = useServerFn(createDocumentFolder);
  const updateFolder = useServerFn(updateDocumentFolder);
  const deleteFolder = useServerFn(deleteDocumentFolder);
  const moveFile = useServerFn(moveDocumentToFolder);
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const folderId = routeSearch.folder ?? null;
  const selectedFile = routeSearch.file ?? null;
  const search = routeSearch.q ?? "";
  const type = routeSearch.type ?? "all";
  const page = routeSearch.page ?? 0;
  const sort = routeSearch.sort ?? "newest";
  const view = routeSearch.view ?? "all";
  const patchFiles = useCallback(
    (patch: Partial<FilesListSearch>, replace = false) => {
      void navigate({
        to: "/files",
        search: (previous) => parseFilesListSearch({ ...previous, ...patch }),
        replace,
        resetScroll: false,
      });
    },
    [navigate],
  );
  const setFolderId = (id: string | null) =>
    patchFiles({ folder: id ?? undefined, file: undefined, page: 0 });
  const setSelectedFile = (id: string | null) => patchFiles({ file: id ?? undefined });
  const setSearch = (value: string) => patchFiles({ q: value, page: 0 }, true);
  const setType = (value: string) =>
    patchFiles({ type: value as FilesListSearch["type"], page: 0 });
  const setSort = (value: FilesListSearch["sort"]) => patchFiles({ sort: value, page: 0 });
  const setView = (value: NonNullable<FilesListSearch["view"]>) =>
    patchFiles({
      view: value,
      folder: value === "all" ? (folderId ?? undefined) : undefined,
      file: undefined,
      page: 0,
    });
  const setPage = useCallback(
    (next: number | ((current: number) => number)) =>
      patchFiles({ page: typeof next === "function" ? next(page) : next }),
    [patchFiles, page],
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [pendingFolderMove, setPendingFolderMove] = useState<{
    id: string;
    name: string;
    parentId: string | null;
  } | null>(null);
  const [showRenameFile, setShowRenameFile] = useState(false);
  const [renameFileName, setRenameFileName] = useState("");

  const [debounced, setDebounced] = useState(search.trim());
  const [error, setError] = useState<string | null>(null);
  const [fileFormat, setFileFormat] = useState<FileFormat>("all");
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | "all">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [includeSubfolders, setIncludeSubfolders] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const activeView = folderId ? "all" : view;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTarget, setBulkTarget] = useState("unfiled");
  const [inlinePreviewUrl, setInlinePreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(null);
  const [pendingUploadReview, setPendingUploadReview] = useState<UploadReview | null>(null);
  const [failedDeleteBatch, setFailedDeleteBatch] = useState<{
    companyId: string;
    ids: string[];
  } | null>(null);
  const [failedMoveBatch, setFailedMoveBatch] = useState<{
    companyId: string;
    ids: string[];
    targetId: string | null;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  // Folder navigation temporarily shows all files without discarding the chosen workspace view.
  const canUpload = ATTACHMENT_ENTITIES.company.manage.some((p) => can(p));

  const tagsQ = useQuery({
    queryKey: ["document-tags", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchTags({ data: { companyId: companyId! } }),
    retry: false,
  });
  useEffect(() => {
    setTagFilter("all");
    setCategoryFilter("all");
  }, [companyId]);

  const foldersQ = useQuery({
    queryKey: ["document-folders", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getFolders({ data: { companyId: companyId! } }),
  });
  type FolderRow = { id: string; name: string; parent_id: string | null };
  const folders = useMemo(() => (foldersQ.data ?? []) as FolderRow[], [foldersQ.data]);
  const activeFolder = folders.find((f) => f.id === folderId);
  const breadcrumbs = folderAncestors(folders, folderId);
  const folderPaths = useMemo(() => indexFolderPaths(folders), [folders]);
  const folderMatches = useMemo(() => {
    const searchTerm = folderSearch.trim().toLocaleLowerCase("en-US");
    if (!searchTerm) return [];
    return folders
      .filter((folder) =>
        (folderPaths.get(folder.id) ?? "").toLocaleLowerCase("en-US").includes(searchTerm),
      )
      .slice(0, 20);
  }, [folders, folderPaths, folderSearch]);
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
      setPendingFolderDelete(null);
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
    queryKey: [
      "company-files",
      companyId,
      debounced,
      type,
      folderId,
      page,
      sort,
      view,
      fileFormat,
      includeSubfolders,
      categoryFilter,
      tagFilter,
    ],
    enabled:
      Boolean(companyId) &&
      activeView !== "review" &&
      activeView !== "inbox" &&
      activeView !== "trash",
    queryFn: () =>
      fetchFiles({
        data: {
          companyId: companyId!,
          search: debounced,
          entityType: activeView === "to-file" ? "company" : type,
          format: fileFormat,
          category: categoryFilter,
          ...(tagFilter !== "all" ? { tagId: tagFilter } : {}),
          includeSubfolders: folderId !== null && includeSubfolders,
          folderId: activeView === "to-file" ? null : folderId,
          unfiledOnly: activeView === "to-file",
          sort,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  useEffect(() => {
    if (!filesQ.data) return;
    const last = lastFilePage(filesQ.data.total, filesQ.data.pageSize);
    if (page > last) setPage(last);
  }, [filesQ.data, page, setPage]);

  const fileDetailsQ = useQuery({
    queryKey: ["company-file-details", companyId, selectedFile],
    enabled: Boolean(companyId && selectedFile),
    queryFn: () =>
      fetchFileDetails({ data: { companyId: companyId!, attachmentId: selectedFile! } }),
    retry: false,
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
  useEffect(
    () => setSelectedIds([]),
    [
      companyId,
      debounced,
      type,
      folderId,
      page,
      sort,
      view,
      fileFormat,
      includeSubfolders,
      categoryFilter,
      tagFilter,
    ],
  );
  useEffect(() => setShowRenameFile(false), [companyId, selectedFile]);
  useEffect(() => {
    setPendingBulkDelete(null);
    setPendingUploadReview(null);
    setFailedDeleteBatch(null);
    setFailedMoveBatch(null);
  }, [companyId]);

  const uploadM = useMutation({
    mutationFn: async ({ files, sourceCompanyId, targetFolderId }: UploadInput) => {
      let uploaded = 0;
      for (const file of files) {
        try {
          await uploadCompanyDocument({
            file,
            companyId: sourceCompanyId,
            entityType: "company",
            entityId: sourceCompanyId,
            folderId: targetFolderId,
            register: register as never,
          });
          uploaded += 1;
        } catch (error) {
          throw new Error(
            `Uploaded ${uploaded} of ${files.length} files before stopping. ${friendlyAuthError(error)}`,
          );
        }
      }
      return uploaded;
    },
    onSuccess: async (n, input) => {
      if (companyId === input.sourceCompanyId) {
        setError(null);
        setPage(0);
      }
      await queryClient.invalidateQueries({ queryKey: ["company-files", input.sourceCompanyId] });
      toast.success(n === 1 ? "File uploaded" : `${n} files uploaded`);
    },
    onError: async (e, input) => {
      if (companyId === input.sourceCompanyId) setError(friendlyAuthError(e));
      await queryClient.invalidateQueries({ queryKey: ["company-files", input.sourceCompanyId] });
    },
  });

  const duplicateCheckM = useMutation({
    mutationFn: (input: UploadInput) =>
      checkDuplicates({
        data: {
          companyId: input.sourceCompanyId,
          candidates: input.files.map((file) => ({ fileName: file.name, sizeBytes: file.size })),
        },
      }),
    onSuccess: (result, input) => {
      if (companyId !== input.sourceCompanyId) return;
      const localFlags = repeatedUploadFlags(input.files);
      if (result.possibleMatches.length !== input.files.length) {
        setPendingUploadReview({ ...input, flags: localFlags, scanFailed: true });
        return;
      }
      const flags = combinePossibleDuplicateFlags(localFlags, result.possibleMatches);
      if (flags.some(Boolean)) setPendingUploadReview({ ...input, flags, scanFailed: false });
      else uploadM.mutate(input);
    },
    onError: (_error, input) => {
      if (companyId !== input.sourceCompanyId) return;
      // Never silently upload when the existing-file check could not be completed.
      setPendingUploadReview({
        ...input,
        flags: repeatedUploadFlags(input.files),
        scanFailed: true,
      });
    },
  });

  const renameFileM = useMutation({
    mutationFn: (fileName: string) =>
      renameFile({ data: { companyId: companyId!, attachmentId: selectedFile!, fileName } }),
    onSuccess: async () => {
      setShowRenameFile(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-files", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["company-file-details", companyId] }),
      ]);
      toast.success("File renamed");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
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

  const holdM = useMutation({
    mutationFn: ({ attachmentId, enabled }: { attachmentId: string; enabled: boolean }) =>
      setHold({ data: { companyId: companyId!, attachmentId, enabled } }),
    onSuccess: async ({ enabled }) => {
      await queryClient.invalidateQueries({ queryKey: ["company-file-details", companyId] });
      toast.success(enabled ? "File retention protection enabled" : "File protection removed");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => remove({ data: { companyId: companyId!, attachmentId: id } }),
    onSuccess: async (_result, deletedId) => {
      setPendingDelete(null);
      if (selectedFile === deletedId) setSelectedFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-files", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["company-file-details", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["company-file-preview", companyId] }),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["recycle-bin-files", companyId] });
      toast.success("File moved to Recycle Bin. You can restore it during retention.");
    },
    onError: (e) => {
      setPendingDelete(null);
      toast.error(friendlyAuthError(e));
    },
  });

  const bulkDeleteM = useMutation({
    mutationFn: async ({ ids, sourceCompanyId }: { ids: string[]; sourceCompanyId: string }) => ({
      ...(await runFileBatch(ids, (attachmentId) =>
        remove({ data: { companyId: sourceCompanyId, attachmentId } }),
      )),
      sourceCompanyId,
    }),
    onSuccess: async ({ completedIds, failedIds, firstError, sourceCompanyId }) => {
      setPendingBulkDelete(null);
      if (companyId === sourceCompanyId) {
        setSelectedIds(failedIds);
        setFailedDeleteBatch(
          failedIds.length ? { companyId: sourceCompanyId, ids: failedIds } : null,
        );
        if (selectedFile && completedIds.includes(selectedFile)) setSelectedFile(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-files", sourceCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ["company-file-details", sourceCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ["company-file-preview", sourceCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ["recycle-bin-files", sourceCompanyId] }),
      ]);
      if (completedIds.length)
        toast.success(
          `Moved ${completedIds.length} file${completedIds.length === 1 ? "" : "s"} to Recycle Bin`,
        );
      if (failedIds.length)
        toast.error(
          `${failedIds.length} file${failedIds.length === 1 ? "" : "s"} could not be deleted. ${friendlyAuthError(firstError)}`,
        );
    },
    onError: (error) => {
      setPendingBulkDelete(null);
      toast.error(friendlyAuthError(error));
    },
  });

  const bulkMoveM = useMutation({
    mutationFn: ({
      ids,
      targetId,
      sourceCompanyId,
    }: {
      ids: string[];
      targetId: string | null;
      sourceCompanyId: string;
    }) =>
      runFileBatch(ids, (attachmentId) =>
        moveFile({ data: { companyId: sourceCompanyId, attachmentId, folderId: targetId } }),
      ).then((result) => ({ ...result, sourceCompanyId, targetId })),
    onSuccess: async ({ completedIds, failedIds, firstError, sourceCompanyId, targetId }) => {
      if (companyId === sourceCompanyId) {
        setSelectedIds(failedIds);
        setFailedMoveBatch(
          failedIds.length ? { companyId: sourceCompanyId, ids: failedIds, targetId } : null,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["company-files", sourceCompanyId] });
      if (completedIds.length)
        toast.success(`Moved ${completedIds.length} file${completedIds.length === 1 ? "" : "s"}`);
      if (failedIds.length)
        toast.error(
          `${failedIds.length} file${failedIds.length === 1 ? "" : "s"} could not be moved. ${friendlyAuthError(firstError)}`,
        );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const copyInternalFileLink = async (attachmentId: string) => {
    try {
      await navigator.clipboard.writeText(internalFileUrl(window.location.origin, attachmentId));
      toast.success("Private LinkBooks file link copied");
    } catch {
      toast.error("Could not copy the link. Your browser may block clipboard access.");
    }
  };

  const onPick = (list: FileList | null) => {
    if (
      !list ||
      list.length === 0 ||
      !companyId ||
      !canUpload ||
      uploadM.isPending ||
      duplicateCheckM.isPending ||
      pendingUploadReview
    )
      return;
    const files = Array.from(list);
    if (files.length > MAX_FILES_PER_BATCH) {
      setError(`Upload up to ${MAX_FILES_PER_BATCH} files at a time.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    for (const f of files) {
      const check = validateUpload({ fileName: f.name, sizeBytes: f.size, contentType: f.type });
      if (!check.ok) {
        setError(`${f.name}: ${check.error}`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }
    setError(null);
    duplicateCheckM.mutate({
      files,
      sourceCompanyId: companyId,
      targetFolderId: folderId,
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmReviewedUpload = (includePossibleDuplicates: boolean) => {
    const review = pendingUploadReview;
    if (!review || review.sourceCompanyId !== companyId || uploadM.isPending) return;
    const indexes = selectUploadIndexes(review.flags, includePossibleDuplicates);
    setPendingUploadReview(null);
    if (!indexes.length) {
      toast.info("No files selected for upload after skipping possible duplicates.");
      return;
    }
    uploadM.mutate({
      files: indexes.map((index) => review.files[index]!),
      sourceCompanyId: review.sourceCompanyId,
      targetFolderId: review.targetFolderId,
    });
  };

  const data = filesQ.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selected =
    fileDetailsQ.data ?? data?.files.find((file) => file.id === selectedFile) ?? null;
  const canManage = (entityType: string) =>
    (entityType in ATTACHMENT_ENTITIES
      ? ATTACHMENT_ENTITIES[entityType as keyof typeof ATTACHMENT_ENTITIES].manage
      : []
    ).some((permission) => can(permission));
  const selectableIds = (data?.files ?? [])
    .filter((file) => canManage(file.entity_type))
    .map((file) => file.id);
  const currentSelection = selectedIds.filter((id) => selectableIds.includes(id));
  const currentSelectionSet = new Set(currentSelection);
  const allSelected = selectableIds.length > 0 && currentSelection.length === selectableIds.length;
  const bulkDestination = bulkTarget === "unfiled" ? null : bulkTarget;
  const movingIds = currentSelection.filter(
    (id) => data?.files.find((row) => row.id === id)?.folder_id !== bulkDestination,
  );
  const preview = previewQ.data;
  const previewUrl =
    preview?.kind === "url" ? preview.url : preview?.kind === "inline" ? inlinePreviewUrl : null;

  if (activeView === "trash") {
    return (
      <DocumentRecycleBin key={companyId} companyId={companyId} onClose={() => setView("all")} />
    );
  }

  if (activeView === "inbox") {
    return <DocumentEmailInbox companyId={companyId} onClose={() => setView("all")} />;
  }

  if (activeView === "review") {
    return (
      <ListWorkspace
        title="Document review"
        description="Organise and approve uploaded documents without changing accounting records."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/files" search={{ ...routeSearch, view: "all", file: undefined, page: 0 }}>
              Back to Files
            </Link>
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
          <Button size="sm" variant="outline" asChild>
            <Link
              to="/files"
              search={{
                ...routeSearch,
                view: "review",
                folder: undefined,
                file: undefined,
                page: 0,
              }}
            >
              <ClipboardCheck className="mr-1 size-4" />
              Document review
            </Link>
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
      {uploadM.isPending ? (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Uploading files to secure company storage…
        </p>
      ) : null}
      {duplicateCheckM.isPending ? (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Checking the selected files for possible duplicates…
        </p>
      ) : null}
      {failedDeleteBatch?.companyId === companyId && failedDeleteBatch.ids.length ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
        >
          {failedDeleteBatch.ids.length} failed file deletion(s) are available for retry, even if
          the file list has shifted to another page.
          <Button
            size="sm"
            variant="outline"
            disabled={bulkDeleteM.isPending || bulkMoveM.isPending}
            onClick={() => setPendingBulkDelete(failedDeleteBatch.ids)}
          >
            Review and retry deletion
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFailedDeleteBatch(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {failedMoveBatch?.companyId === companyId && failedMoveBatch.ids.length ? (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
        >
          {failedMoveBatch.ids.length} failed file move(s) can be retried.
          <Button
            size="sm"
            variant="outline"
            disabled={bulkDeleteM.isPending || bulkMoveM.isPending}
            onClick={() =>
              bulkMoveM.mutate({
                ids: failedMoveBatch.ids,
                targetId: failedMoveBatch.targetId,
                sourceCompanyId: failedMoveBatch.companyId,
              })
            }
          >
            Retry failed moves
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFailedMoveBatch(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
      <div
        className={`lb-files-dropzone mb-4 rounded-xl border-2 border-dashed px-5 py-6 text-sm transition-[background-color,border-color,box-shadow] ${dragActive ? "border-primary bg-primary/10 shadow-sm" : "border-border/85 bg-muted/20"}`}
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          if (!uploadM.isPending && !duplicateCheckM.isPending && !pendingUploadReview)
            setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragActive(false);
          if (!uploadM.isPending && !duplicateCheckM.isPending && !pendingUploadReview)
            onPick(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center gap-2">
          <Upload className="size-4" />
          {canUpload
            ? "Drop files here or use Upload files. Maximum 20 MB per file, 25 files per batch."
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
              search={{ ...routeSearch, folder: undefined, file: undefined, view: "all", page: 0 }}
              className="text-sm underline"
            >
              All files
            </Link>
            {breadcrumbs.map((crumb) => (
              <Link
                to="/files"
                search={{ ...routeSearch, folder: crumb.id, file: undefined, page: 0 }}
                key={crumb.id}
                className="text-sm underline"
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
          <QueryErrorState
            queries={[foldersQ]}
            title="Could not load folders"
            description={`${friendlyAuthError(foldersQ.error)} Apply the document folders migration if it is pending.`}
          />
        ) : null}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            className="w-full max-w-sm"
            aria-label="Find a document folder"
            placeholder="Find a folder by name or path"
            value={folderSearch}
            onChange={(e) => setFolderSearch(e.target.value)}
          />
          {folderSearch ? (
            <Button size="sm" variant="ghost" onClick={() => setFolderSearch("")}>
              Clear folder search
            </Button>
          ) : null}
        </div>
        {folderSearch.trim() ? (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Matching folders">
            {folderMatches.length ? (
              folderMatches.map((matched) => (
                <Button key={matched.id} size="sm" variant="outline" asChild>
                  <Link
                    to="/files"
                    search={{ folder: matched.id }}
                    onClick={(e) => {
                      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        setPage(0);
                        setFolderSearch("");
                      }
                    }}
                  >
                    <Folder className="mr-2 size-4" />
                    {folderPaths.get(matched.id)}
                  </Link>
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No matching folders.</p>
            )}
            {folderMatches.length === 20 ? (
              <p className="basis-full text-xs text-muted-foreground">
                Showing up to 20 folder matches. Refine your search to narrow the results.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {activeFolder?.parent_id ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/files"
                search={{
                  ...routeSearch,
                  folder: activeFolder.parent_id,
                  file: undefined,
                  page: 0,
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
                  search={{ ...routeSearch, folder: folder.id, file: undefined, page: 0 }}
                >
                  <Folder className="mr-2 size-4" />
                  {folder.name}
                </Link>
              </Button>
            ))}
        </div>
        {activeFolder ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(e) => {
                setIncludeSubfolders(e.target.checked);
                setPage(0);
              }}
            />
            Include files in nested subfolders
          </label>
        ) : null}
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
                {possibleParentFolders(folders, activeFolder.id).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {folderPaths.get(f.id)}
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
      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Files workspace views">
        <Button size="sm" variant={activeView === "all" ? "default" : "outline"} asChild>
          <Link
            to="/files"
            search={{ ...routeSearch, view: "all", file: undefined, page: 0 }}
            aria-current={activeView === "all" ? "page" : undefined}
          >
            All files
          </Link>
        </Button>
        <Button size="sm" variant={activeView === "to-file" ? "default" : "outline"} asChild>
          <Link
            to="/files"
            search={{
              ...routeSearch,
              view: "to-file",
              folder: undefined,
              file: undefined,
              page: 0,
            }}
            aria-current={activeView === "to-file" ? "page" : undefined}
          >
            To file
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFolderId(null);
            setView("inbox");
            setPage(0);
          }}
        >
          Email inbox
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFolderId(null);
            setView("trash");
            setPage(0);
          }}
        >
          <ArchiveRestore className="mr-1 size-4" /> Recycle Bin
        </Button>
        <span className="text-xs text-muted-foreground">
          To file shows unlinked, unfiled uploads. Email inbox imports attachments into Document
          review.
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
        <RecordLookupSelect
          value={type}
          disabled={activeView === "to-file"}
          onValueChange={(v) => setType(v)}
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
        </RecordLookupSelect>
        <RecordLookupSelect
          value={fileFormat}
          onValueChange={(v) => {
            setFileFormat(v as FileFormat);
            setPage(0);
          }}
        >
          {/* lookup-fixed-enum: File content categories map to fixed MIME allowlists. */}
          <SelectTrigger className="w-48" aria-label="Filter by file format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All file formats</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="images">Images</SelectItem>
            <SelectItem value="spreadsheets">Spreadsheets &amp; CSV</SelectItem>
            <SelectItem value="word">Word documents</SelectItem>
            <SelectItem value="text">Text files</SelectItem>
          </SelectContent>
        </RecordLookupSelect>
        <RecordLookupSelect
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v as FileCategory | "all");
            setPage(0);
          }}
        >
          {/* lookup-fixed-enum: These labels never change accounting classification. */}
          <SelectTrigger className="w-48" aria-label="Filter by document category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {FILE_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {FILE_CATEGORY_LABELS[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </RecordLookupSelect>
        <RecordLookupSelect
          value={tagFilter}
          onValueChange={(value) => {
            setTagFilter(value);
            setPage(0);
          }}
          disabled={tagsQ.isError || !tagsQ.isSuccess || !(tagsQ.data?.length)}
        >
          <SelectTrigger className="w-48" aria-label="Filter by company document tag">
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {(tagsQ.isSuccess ? (tagsQ.data ?? []) : []).map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </RecordLookupSelect>
        <RecordLookupSelect value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
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
        </RecordLookupSelect>
        {(search ||
          type !== "all" ||
          fileFormat !== "all" ||
          categoryFilter !== "all" ||
          tagFilter !== "all" ||
          sort !== "newest") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setDebounced("");
              setType("all");
              setFileFormat("all");
              setCategoryFilter("all");
              setTagFilter("all");
              setSort("newest");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      {filesQ.isSuccess ? (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          Showing {filesQ.data.files.length} of {filesQ.data.total} matching files
          {folderId && includeSubfolders ? " (including nested folders)" : ""}
        </p>
      ) : null}

      {selectedFile && fileDetailsQ.isError && !selected ? (
        <div className="mb-4 space-y-2">
          <QueryErrorState queries={[fileDetailsQ]} title="Could not load file details" />
          <Button size="sm" variant="outline" onClick={() => setSelectedFile(null)}>
            Close
          </Button>
        </div>
      ) : null}
      {selectedFile && fileDetailsQ.isPending && !selected ? (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Loading file details…
        </p>
      ) : null}

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
          <DocumentClassificationPanel
            key={`${companyId}:${selected.id}`}
            companyId={companyId}
            attachmentId={selected.id}
            canManage={canManage(selected.entity_type)}
          />
          {selected.storage_bucket === COMPANY_DOCUMENTS_BUCKET &&
          isAttachmentEntityType(selected.entity_type) ? (
            <DocumentVersionHistory
              key={`versions:${companyId}:${selected.id}`}
              companyId={companyId}
              attachmentId={selected.id}
              entityType={selected.entity_type}
              entityId={selected.entity_id}
              currentName={selected.file_name}
              canManage={canManage(selected.entity_type)}
            />
          ) : null}
          {canManage(selected.entity_type) ? (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={holdM.isPending}
              onClick={() =>
                holdM.mutate({
                  attachmentId: selected.id,
                  enabled: !selected.retention_hold,
                })
              }
            >
              <LockKeyhole className="mr-1 size-4" />
              {selected.retention_hold ? "Remove retention protection" : "Protect from deletion"}
            </Button>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={downloadM.isPending}
              onClick={() => downloadM.mutate(selected.id)}
            >
              <Download className="mr-1 size-4" />
              Download
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copyInternalFileLink(selected.id)}
            >
              <Link2 className="mr-1 size-4" />
              Copy file link
            </Button>
            {canManage(selected.entity_type) ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRenameFileName(selected.file_name);
                    setShowRenameFile(true);
                  }}
                >
                  <Pencil className="mr-1 size-4" />
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deleteM.isPending}
                  onClick={() => setPendingDelete({ id: selected.id, name: selected.file_name })}
                >
                  <Trash2 className="mr-1 size-4" />
                  Move to Recycle Bin
                </Button>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Copied links open inside LinkBooks. The recipient must sign in and already have
            permission to access this file; this does not create a public share.
          </p>
          {showRenameFile && canManage(selected.entity_type) ? (
            <form
              aria-label="Rename selected file"
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (renameFileName.trim() && renameFileName.trim() !== selected.file_name)
                  renameFileM.mutate(renameFileName);
              }}
            >
              <Input
                aria-label="New file name"
                className="min-w-48 flex-1"
                value={renameFileName}
                maxLength={255}
                autoFocus
                onChange={(e) => setRenameFileName(e.target.value)}
              />
              <Button
                size="sm"
                type="submit"
                disabled={
                  renameFileM.isPending ||
                  !renameFileName.trim() ||
                  renameFileName.trim() === selected.file_name
                }
              >
                Save name
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setShowRenameFile(false)}
              >
                Cancel
              </Button>
              <p className="basis-full text-xs text-muted-foreground">
                Keep the original file extension. The stored file and linked records will not move.
              </p>
            </form>
          ) : null}
          {previewQ.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading secure preview…</p>
          ) : previewQ.isError ? (
            <div className="mt-3">
              <QueryErrorState queries={[previewQ]} title="Could not load file preview" />
            </div>
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
        <QueryErrorState queries={[filesQ]} title="Could not load files" />
      ) : !filesQ.isSuccess ? null : filesQ.data.files.length === 0 ? (
        <EmptyState
          title="No files"
          description={
            debounced || type !== "all" || fileFormat !== "all"
              ? "No files match these filters."
              : activeView === "to-file"
                ? "No unlinked, unfiled uploads need organising."
                : folderId && !includeSubfolders
                  ? "This folder has no directly assigned files. Enable Include files in nested subfolders to search its children."
                  : canUpload
                    ? `Upload a file here or attach one to an invoice or bill. Up to ${formatFileSize(MAX_FILE_BYTES)} each.`
                    : "No files have been added yet."
          }
        />
      ) : (
        <>
          {bulkDeleteM.isPending ? (
            <p role="status" className="mb-3 text-sm text-muted-foreground">
              Deleting selected files individually. Some files may be deleted before the operation
              finishes.
            </p>
          ) : null}
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
                      {folderPaths.get(folder.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
              <Button
                size="sm"
                disabled={bulkMoveM.isPending || bulkDeleteM.isPending || movingIds.length === 0}
                onClick={() =>
                  bulkMoveM.mutate({
                    ids: movingIds,
                    targetId: bulkDestination,
                    sourceCompanyId: companyId!,
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
              <Button
                size="sm"
                variant="outline"
                disabled={bulkMoveM.isPending || bulkDeleteM.isPending}
                onClick={() => setPendingBulkDelete(currentSelection)}
              >
                <Trash2 className="mr-1 size-4" />
                Move selected to Recycle Bin
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkMoveM.isPending || bulkDeleteM.isPending}
                onClick={() => setSelectedIds([])}
              >
                Clear selection
              </Button>
              {movingIds.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Selected files are already in this destination.
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="mb-2 text-xs text-muted-foreground sm:hidden">
            Swipe horizontally within the table to see all file columns.
          </p>
          <Table aria-label="Company files" className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all manageable files on this page"
                    checked={allSelected}
                    disabled={
                      selectableIds.length === 0 || bulkMoveM.isPending || bulkDeleteM.isPending
                    }
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
                        checked={currentSelectionSet.has(f.id)}
                        disabled={!manageable || bulkMoveM.isPending || bulkDeleteM.isPending}
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
                        search={(previous) => parseFilesListSearch({ ...previous, file: f.id })}
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
                                {folderPaths.get(folder.id)}
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {filesQ.data.total} file{filesQ.data.total === 1 ? "" : "s"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
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

      <AlertDialog
        open={Boolean(pendingUploadReview)}
        onOpenChange={(open) => {
          if (!open && !uploadM.isPending) setPendingUploadReview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUploadReview?.scanFailed
                ? "Duplicate check unavailable"
                : "Review possible duplicate files"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUploadReview?.scanFailed
                ? "The comparison with existing files could not be completed. You may cancel or explicitly continue. Repeated files in this selection are still flagged."
                : "Matching filename and byte size can indicate a duplicate, but does not prove that the contents are identical. No files have been uploaded yet."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
            {pendingUploadReview?.files.map((file, index) => (
              <div className="flex items-start justify-between gap-3" key={index}>
                <span className="min-w-0 break-all">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {pendingUploadReview?.flags[index]
                    ? "Possible duplicate"
                    : pendingUploadReview?.scanFailed
                      ? "Existing files not checked"
                      : "Not flagged"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {pendingUploadReview?.flags.filter(Boolean).length ?? 0} flagged out of{" "}
            {pendingUploadReview?.files.length ?? 0} selected. Skip flagged files or explicitly
            upload all. Existing records will not be deleted or replaced.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploadM.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={uploadM.isPending || !pendingUploadReview?.flags.some(Boolean)}
              onClick={() => confirmReviewedUpload(false)}
            >
              Upload unflagged only
            </Button>
            <Button
              type="button"
              disabled={uploadM.isPending}
              onClick={() => confirmReviewedUpload(true)}
            >
              Upload all anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingBulkDelete)}
        onOpenChange={(open) => {
          if (!open && !bulkDeleteM.isPending) setPendingBulkDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {pendingBulkDelete?.length ?? 0} selected files to Recycle Bin?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Files will be hidden from active folders and linked-record attachment lists, but
              preserved for restore during their retention period. Protected and approved documents
              cannot be recycled until their restrictions are resolved. Only selected, manageable
              files on this page are included; partial success is possible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleteM.isPending || !pendingBulkDelete?.length}
              onClick={() => {
                if (!companyId || !pendingBulkDelete?.length) return;
                bulkDeleteM.mutate({
                  ids: pendingBulkDelete,
                  sourceCompanyId: companyId,
                });
              }}
            >
              {bulkDeleteM.isPending ? "Moving…" : "Move selected to Recycle Bin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingFolderDelete)}
        onOpenChange={(open) => !open && setPendingFolderDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete empty folder?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingFolderDelete?.name}” can only be deleted when it has no files or subfolders.
              Its contents are not deleted or moved automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeFolderM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeFolderM.isPending}
              onClick={() => {
                if (pendingFolderDelete) removeFolderM.mutate(pendingFolderDelete.id);
              }}
            >
              Delete empty folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this file to Recycle Bin?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” will be hidden from active documents, but its contents,
              version history and tags remain available for restore during the retention period.
              Protected or approved evidence cannot be recycled until restrictions are resolved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteM.isPending}
              onClick={() => pendingDelete && deleteM.mutate(pendingDelete.id)}
            >
              Move to Recycle Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListWorkspace>
  );
}
