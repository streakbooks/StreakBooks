import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tags, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  createDocumentTag,
  deleteDocumentTag,
  getFileClassification,
  listDocumentTags,
  setDocumentFileTag,
  updateFileCategory,
} from "@/lib/documents/file-classification.functions";
import {
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  suggestFileCategory,
  suggestExistingTags,
  type FileCategory,
} from "@/lib/documents/file-classification";

/** Stored tags/categories remain manual; filename hints are not OCR or automatic approvals. */
export function DocumentClassificationPanel({
  companyId,
  attachmentId,
  canManage,
}: {
  companyId: string;
  attachmentId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const fetchMeta = useServerFn(getFileClassification);
  const fetchTags = useServerFn(listDocumentTags);
  const saveCategory = useServerFn(updateFileCategory);
  const createTag = useServerFn(createDocumentTag);
  const setTag = useServerFn(setDocumentFileTag);
  const deleteTag = useServerFn(deleteDocumentTag);
  const [newTag, setNewTag] = useState("");
  const [searchTags, setSearchTags] = useState("");
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  const metadata = useQuery({
    queryKey: ["file-classification", companyId, attachmentId],
    queryFn: () => fetchMeta({ data: { companyId, attachmentId } }),
    retry: false,
  });
  const tags = useQuery({
    queryKey: ["document-tags", companyId],
    queryFn: () => fetchTags({ data: { companyId } }),
    retry: false,
  });
  const hint = metadata.data
    ? suggestFileCategory(metadata.data.fileName, metadata.data.entityType)
    : null;
  const suggestedTags = suggestExistingTags(metadata.data?.fileName ?? "", tags.data ?? []);
  const selectedTagIds = new Set(metadata.data?.tagIds ?? []);
  const visibleTags = (tags.data ?? []).filter((tag) =>
    tag.name.toLocaleLowerCase("en-US").includes(searchTags.trim().toLocaleLowerCase("en-US")),
  );
  const refreshMetadata = async () =>
    client.invalidateQueries({ queryKey: ["file-classification", companyId, attachmentId] });
  const refreshTags = async () =>
    client.invalidateQueries({ queryKey: ["document-tags", companyId] });

  const categoryMutation = useMutation({
    mutationFn: (category: FileCategory) => {
      if (!metadata.data) throw new Error("Load document metadata before editing.");
      return saveCategory({
        data: {
          companyId,
          attachmentId,
          category,
          expectedCategory: metadata.data.category,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        refreshMetadata(),
        client.invalidateQueries({ queryKey: ["company-files", companyId] }),
      ]);
      toast.success("Document category saved");
    },
    onError: (error) => {
      void refreshMetadata();
      toast.error(friendlyAuthError(error));
    },
  });
  const tagMutation = useMutation({
    mutationFn: ({ tagId, enabled }: { tagId: string; enabled: boolean }) =>
      setTag({ data: { companyId, attachmentId, tagId, enabled } }),
    onSuccess: async () => {
      await Promise.all([
        refreshMetadata(),
        client.invalidateQueries({ queryKey: ["company-files", companyId] }),
      ]);
      toast.success("Document tags updated");
    },
    onError: (error) => {
      void refreshMetadata();
      toast.error(friendlyAuthError(error));
    },
  });
  const createMutation = useMutation({
    mutationFn: (name: string) => createTag({ data: { companyId, name } }),
    onSuccess: async (tag) => {
      setNewTag("");
      await refreshTags();
      try {
        await setTag({ data: { companyId, attachmentId, tagId: tag.id, enabled: true } });
        await Promise.all([
          refreshMetadata(),
          client.invalidateQueries({ queryKey: ["company-files", companyId] }),
        ]);
        toast.success("Tag created and assigned");
      } catch (error) {
        toast.error("Tag created but could not be assigned. " + friendlyAuthError(error));
      }
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (tagId: string) => deleteTag({ data: { companyId, tagId } }),
    onSuccess: async () => {
      setPendingRemove(null);
      await Promise.all([
        refreshTags(),
        refreshMetadata(),
        client.invalidateQueries({ queryKey: ["company-files", companyId] }),
      ]);
      toast.success("Company tag deleted");
    },
    onError: (error) => {
      setPendingRemove(null);
      toast.error(friendlyAuthError(error));
    },
  });

  return (
    <section
      aria-label="Document categories and tags"
      className="mt-4 space-y-3 rounded-lg border p-3"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Tags className="size-4" /> Categories and tags
      </h3>
      {metadata.isPending || tags.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading file metadata…
        </p>
      ) : metadata.isError || tags.isError ? (
        <QueryErrorState queries={[metadata, tags]} title="Could not load categories and tags" />
      ) : metadata.data ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`file-category-${attachmentId}`} className="text-sm font-medium">
              Category
            </label>
            <RecordLookupSelect
              value={metadata.data.category}
              disabled={!canManage || categoryMutation.isPending}
              onValueChange={(category) => categoryMutation.mutate(category as FileCategory)}
            >
              <SelectTrigger
                className="w-52"
                id={`file-category-${attachmentId}`}
                aria-label="Document category"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {FILE_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
          </div>
          {hint && hint.category !== metadata.data.category ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-xs">
              <Sparkles className="size-4 shrink-0" />
              <span>
                Suggested: {FILE_CATEGORY_LABELS[hint.category]}. {hint.reason}
              </span>
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={categoryMutation.isPending}
                  onClick={() => categoryMutation.mutate(hint.category)}
                >
                  Use suggestion
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Category labels are descriptive metadata only. They do not authorize or post financial
            records.
          </p>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">
                Company tags ({selectedTagIds.size} on this file)
              </h4>
              {tags.data && tags.data.length > 10 ? (
                <Input
                  className="w-48"
                  aria-label="Find company tags"
                  placeholder="Find a tag"
                  value={searchTags}
                  onChange={(event) => setSearchTags(event.target.value)}
                />
              ) : null}
            </div>
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
              {visibleTags.map((tag) => {
                const assigned = selectedTagIds.has(tag.id);
                const suggested = suggestedTags.includes(tag.id) && !assigned;
                return (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm"
                  >
                    <input
                      aria-label={`Tag ${tag.name}`}
                      type="checkbox"
                      checked={assigned}
                      disabled={!canManage || tagMutation.isPending || createMutation.isPending}
                      onChange={(event) =>
                        tagMutation.mutate({ tagId: tag.id, enabled: event.target.checked })
                      }
                    />
                    <span>{tag.name}</span>
                    {suggested ? (
                      <span className="text-xs text-muted-foreground">(suggested)</span>
                    ) : null}
                    {canManage ? (
                      <Button
                        size="icon"
                        type="button"
                        variant="ghost"
                        aria-label={`Delete company-wide tag ${tag.name}`}
                        disabled={deleteMutation.isPending || tagMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          setPendingRemove({ id: tag.id, name: tag.name });
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    ) : null}
                  </label>
                );
              })}
              {visibleTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No matching tags. Create a company tag to organise this document.
                </p>
              ) : null}
            </div>
            {canManage ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (newTag.trim()) createMutation.mutate(newTag);
                }}
              >
                <Input
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  maxLength={50}
                  className="max-w-xs"
                  aria-label="New company tag name"
                  placeholder="New company tag, e.g. FY2026"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!newTag.trim() || createMutation.isPending || tagMutation.isPending}
                >
                  Create and assign
                </Button>
              </form>
            ) : null}
          </div>
        </>
      ) : null}
      <AlertDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag from this entire company?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingRemove?.name}” can only be deleted when it is no longer assigned to any
              company document. Remove the tag from every document first. Files and accounting
              entries are never deleted by this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => pendingRemove && deleteMutation.mutate(pendingRemove.id)}
            >
              Delete company tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
