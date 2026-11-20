import { getRouteApi } from "@tanstack/react-router";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  Upload,
  Settings2,
  Users,
  Filter,
  Bookmark,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import {
  listContacts,
  countContacts,
  getContactsDirectorySummary,
  exportContactsCsv,
  listContactGroups,
  listContactTags,
  bulkAddContactLabel,
  bulkRemoveContactLabel,
  upsertContactGroup,
  upsertContactTag,
} from "@/lib/contacts/contacts.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import {
  DEFAULT_CONTACT_ADVANCED_FILTERS,
  normalizeContactSavedViews,
  countActiveContactFilters,
  type ContactSavedView,
  type ContactAdvancedFilters,
} from "@/lib/contacts/contact-advanced-filters";
import {
  buildContactsCsv,
  nextContactSort,
  type ContactSortField,
} from "@/lib/contacts/contact-helpers";
import {
  CONTACT_DIRECTORY_COLUMNS,
  DEFAULT_CONTACT_DIRECTORY_COLUMNS,
  normalizeContactDirectoryColumns,
  selectedContactsOnPage,
  toggleContactDirectoryColumn,
  type ContactDirectoryColumnId,
} from "@/lib/contacts/contact-directory-columns";
import {
  getContactDirectoryPreferences,
  saveContactDirectoryPreference,
} from "@/lib/contacts/contact-directory-preferences.functions";
import type { ContactPreferenceKind } from "@/lib/contacts/contact-directory-preferences";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ListSkeleton, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import {
  encodeContactsReturnContext,
  parseContactDirectoryView,
  parseContactsDirectorySearch,
  type ContactsDirectorySearch,
} from "@/lib/contacts/contact-view-navigation";
import { ContactFollowUpsPanel } from "@/components/contacts/ContactFollowUpsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/common/table-card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const routeApi = getRouteApi("/_authenticated/contacts/");

type ContactRow = {
  id: string;
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
  payment_terms_days: number;
  account_number: string | null;
  is_active: boolean;
  archived_at?: string | null;
} & Partial<Record<ContactDirectoryColumnId, string | number | boolean | null>>;

const PAGE_SIZE = 50;

function SortableContactHead({
  label,
  field,
  sort,
  view,
  onSort,
}: {
  label: string;
  field: ContactSortField;
  sort: string;
  view: string;
  onSort: (field: ContactSortField) => void;
}) {
  const effectiveSort =
    sort === "default" && view !== "recent" && view !== "updated" ? "name_asc" : sort;
  const direction =
    effectiveSort === `${field}_asc`
      ? "ascending"
      : effectiveSort === `${field}_desc`
        ? "descending"
        : "none";
  const nextDirection = direction === "ascending" ? "descending" : "ascending";

  return (
    <TableHead aria-sort={direction}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-sm py-1 text-left font-semibold hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => onSort(field)}
        aria-label={`Sort ${label} ${nextDirection}`}
      >
        {label}
        {direction === "ascending" ? (
          <ArrowUp className="size-3.5" aria-hidden="true" />
        ) : direction === "descending" ? (
          <ArrowDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}

function formattedContactValue(
  contact: ContactRow,
  column: ContactDirectoryColumnId,
  currency: string,
): string {
  if (column === "is_active") {
    return contact.archived_at ? "Archived" : contact.is_active ? "Active" : "Inactive";
  }
  const raw = contact[column];
  if (raw === null || raw === undefined || raw === "") return "—";
  if (column === "payment_terms_days") return `${raw}d`;
  if (column === "kind") return raw === "both" ? "Customer & supplier" : String(raw);
  if (column === "credit_limit_minor") {
    const contactCurrency =
      typeof contact.default_currency === "string" && contact.default_currency.trim()
        ? contact.default_currency
        : currency;
    try {
      return `${fromMinorUnits(BigInt(String(raw)), contactCurrency)} ${contactCurrency}`;
    } catch {
      return "—";
    }
  }
  if (column === "created_at" || column === "updated_at") {
    const date = new Date(String(raw));
    return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString();
  }
  return String(raw);
}

function ConfirmContactLabelRemoval({
  kind,
  name,
  count,
  disabled,
  onConfirm,
}: {
  kind: "group" | "tag";
  name: string;
  count: number;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={`Remove selected ${kind}`}
        >
          Remove {kind}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {kind} from selected contacts?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {name} from up to {count} selected contacts on this page. Contact
            records, transactions and all other groups and tags will remain unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Remove {kind}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ContactDirectoryCell({
  contact,
  column,
  currency,
}: {
  contact: ContactRow;
  column: ContactDirectoryColumnId;
  currency: string;
}) {
  if (column === "name") {
    const initials =
      contact.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] ?? "")
        .join("")
        .toUpperCase() || "?";
    const tones = [
      "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
      "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-100",
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    ];
    const tone = tones[contact.name.charCodeAt(0) % tones.length];
    return (
      <TableCell>
        <ContactRecordLink contactId={contact.id}>
          <span className="inline-flex min-w-40 items-center gap-3 font-medium">
            <span
              aria-hidden="true"
              className={`flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${tone}`}
            >
              {initials}
            </span>
            <span>{contact.name}</span>
          </span>
        </ContactRecordLink>
      </TableCell>
    );
  }
  if (column === "is_active") {
    const lifecycleStatus = contact.archived_at
      ? "archived"
      : contact.is_active
        ? "active"
        : "inactive";
    return (
      <TableCell>
        <ContactRecordLink contactId={contact.id}>
          <StatusBadge status={lifecycleStatus} />
        </ContactRecordLink>
      </TableCell>
    );
  }
  if (column === "kind") {
    return (
      <TableCell>
        <ContactRecordLink contactId={contact.id}>
          <Badge variant="neutral" className="capitalize">
            {formattedContactValue(contact, column, currency)}
          </Badge>
        </ContactRecordLink>
      </TableCell>
    );
  }
  return (
    <TableCell className="max-w-72 break-words text-muted-foreground">
      <ContactRecordLink contactId={contact.id}>
        {formattedContactValue(contact, column, currency)}
      </ContactRecordLink>
    </TableCell>
  );
}

function ContactRecordLink({ contactId, children }: { contactId: string; children: ReactNode }) {
  const search = routeApi.useSearch();
  const returnContext = encodeContactsReturnContext(search);
  return (
    <Link
      to="/contacts/$contactId"
      params={{ contactId }}
      search={{
        ...(search.view && search.view !== "all"
          ? { fromView: parseContactDirectoryView(search.view) }
          : {}),
        ...(returnContext ? { returnContext } : {}),
      }}
      className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}

export function ContactsPage({ initialKind = "customer" }: { initialKind?: string } = {}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetch = useServerFn(listContacts);
  const fetchCount = useServerFn(countContacts);
  const fetchSummary = useServerFn(getContactsDirectorySummary);
  const exportFn = useServerFn(exportContactsCsv);
  const fetchGroups = useServerFn(listContactGroups);
  const fetchTags = useServerFn(listContactTags);
  const bulkAdd = useServerFn(bulkAddContactLabel);
  const bulkRemove = useServerFn(bulkRemoveContactLabel);
  const createGroup = useServerFn(upsertContactGroup);
  const createTag = useServerFn(upsertContactTag);
  const getCloudPreferences = useServerFn(getContactDirectoryPreferences);
  const persistCloudPreference = useServerFn(saveContactDirectoryPreference);
  const canManage = useCanDo("contacts.manage");

  const directorySearch = routeApi.useSearch();
  const view = directorySearch.view ?? "all";
  const page = directorySearch.page ?? 0;
  const q = directorySearch.q ?? "";
  const sort = directorySearch.sort ?? "default";
  const patchDirectory = (patch: Partial<ContactsDirectorySearch>, replace = false) => {
    void navigate({
      to: "/contacts",
      search: (previous) => parseContactsDirectorySearch({ ...previous, ...patch }),
      replace,
      resetScroll: false,
    });
  };
  const setPage = (next: number | ((current: number) => number)) =>
    patchDirectory({ page: typeof next === "function" ? next(page) : next });
  const setQ = (value: string) => patchDirectory({ q: value, page: 0 }, true);
  const setSort = (value: string) => patchDirectory({ sort: value, page: 0 });
  const [filters, setFilters] = useState<ContactAdvancedFilters>({
    ...DEFAULT_CONTACT_ADVANCED_FILTERS,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [savedViewName, setSavedViewName] = useState("");
  const [selectedSavedViewId, setSelectedSavedViewId] = useState("");
  const [savedViewPreferences, setSavedViewPreferences] = useState<{
    companyId: string | undefined;
    views: ContactSavedView[];
  }>({ companyId: undefined, views: [] });
  const [newGroupName, setNewGroupName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const savedViews = savedViewPreferences.companyId === companyId ? savedViewPreferences.views : [];
  const filterCount = countActiveContactFilters(filters);
  const filterScope = JSON.stringify(filters);
  const [columnPreferences, setColumnPreferences] = useState<{
    companyId: string | undefined;
    columns: ContactDirectoryColumnId[];
  }>({ companyId: undefined, columns: [...DEFAULT_CONTACT_DIRECTORY_COLUMNS] });
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope: "",
    ids: [],
  });
  const [groupId, setGroupId] = useState("");
  const [tagId, setTagId] = useState("");
  const [legacyPreferences, setLegacyPreferences] = useState<{
    companyId: string | undefined;
    columns: ContactDirectoryColumnId[] | null;
    views: ContactSavedView[] | null;
  }>({ companyId: undefined, columns: null, views: null });
  const preferenceKey = companyId ? `linkbooks:contact-columns:${companyId}` : "";
  const visibleColumns =
    columnPreferences.companyId === companyId
      ? columnPreferences.columns
      : DEFAULT_CONTACT_DIRECTORY_COLUMNS;
  const scope = `${companyId ?? ""}|${view}|${q}|${sort}|${filterScope}|${page}`;

  const cloudPreferencesQ = useQuery({
    queryKey: ["contact-directory-preferences", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getCloudPreferences({ data: { companyId: companyId! } }),
  });

  const saveCloudM = useMutation({
    mutationFn: (input: { kind: ContactPreferenceKind; value: unknown }) =>
      persistCloudPreference({
        data: { companyId: companyId!, kind: input.kind, value: input.value },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact-directory-preferences", companyId] });
    },
    onError: () =>
      toast.error("Account sync failed. The browser copy is retained; retry saving to sync."),
  });

  const importLegacyM = useMutation({
    mutationFn: async () => {
      if (!companyId || legacyPreferences.companyId !== companyId) return 0;
      let imported = 0;
      // Import only missing account settings; never overwrite another device's saved data.
      if (cloudPreferencesQ.data?.columns === null && legacyPreferences.columns) {
        await persistCloudPreference({
          data: { companyId, kind: "columns", value: legacyPreferences.columns },
        });
        imported += 1;
      }
      if (cloudPreferencesQ.data?.views === null && legacyPreferences.views) {
        await persistCloudPreference({
          data: { companyId, kind: "views", value: legacyPreferences.views },
        });
        imported += 1;
      }
      return imported;
    },
    onSuccess: async (count) => {
      await qc.invalidateQueries({ queryKey: ["contact-directory-preferences", companyId] });
      if (count > 0) toast.success("Browser preferences imported to your account");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const preferenceBusy =
    cloudPreferencesQ.isPending ||
    cloudPreferencesQ.isFetching ||
    saveCloudM.isPending ||
    importLegacyM.isPending;
  const cloudPrefsReady = cloudPreferencesQ.isSuccess && !cloudPreferencesQ.isError;
  const preferenceSyncBlocked = preferenceBusy || !cloudPrefsReady;
  const canImportBrowserPreferences =
    legacyPreferences.companyId === companyId &&
    cloudPrefsReady &&
    ((cloudPreferencesQ.data?.columns === null && legacyPreferences.columns !== null) ||
      (cloudPreferencesQ.data?.views === null && legacyPreferences.views !== null));

  useEffect(() => {
    if (!companyId) return;
    let stored: unknown = null;
    try {
      const raw = window.localStorage.getItem(`linkbooks:contact-columns:${companyId}`);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      // Private browsing may disable storage: keep the standard columns available.
    }
    setColumnPreferences({
      companyId,
      columns: normalizeContactDirectoryColumns(stored),
    });
    setLegacyPreferences((previous) => ({
      ...previous,
      companyId,
      columns: stored === null ? null : normalizeContactDirectoryColumns(stored),
    }));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let stored: unknown = null;
    try {
      const raw = window.localStorage.getItem(`linkbooks:contact-saved-views:${companyId}`);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      // Stored views are optional; contacts remain fully usable without browser storage.
    }
    setSavedViewPreferences({ companyId, views: normalizeContactSavedViews(stored) });
    setLegacyPreferences((previous) => ({
      ...previous,
      companyId,
      views: stored === null ? null : normalizeContactSavedViews(stored),
    }));
    setSelectedSavedViewId("");
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !cloudPreferencesQ.isSuccess || !cloudPreferencesQ.data) return;
    if (cloudPreferencesQ.data.columns !== null) {
      setColumnPreferences({
        companyId,
        columns: normalizeContactDirectoryColumns(cloudPreferencesQ.data.columns),
      });
    }
    if (cloudPreferencesQ.data.views !== null) {
      setSavedViewPreferences({
        companyId,
        views: normalizeContactSavedViews(cloudPreferencesQ.data.views),
      });
    }
  }, [companyId, cloudPreferencesQ.isSuccess, cloudPreferencesQ.data]);

  const saveViewPreferences = (views: ContactSavedView[], confirmation: string) => {
    if (preferenceSyncBlocked) return;
    const next = normalizeContactSavedViews(views);
    setSavedViewPreferences({ companyId, views: next });
    if (companyId) {
      try {
        window.localStorage.setItem(
          `linkbooks:contact-saved-views:${companyId}`,
          JSON.stringify(next),
        );
      } catch {
        toast.message(
          "Saved views are available for this session, but browser storage is disabled",
        );
      }
    }
    saveCloudM.mutate(
      { kind: "views", value: next },
      { onSuccess: () => toast.success(confirmation) },
    );
  };

  const updateFilter = (key: keyof ContactAdvancedFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    setSelectedSavedViewId("");
  };

  const saveCurrentView = () => {
    if (preferenceSyncBlocked) return;
    const name = savedViewName.trim().slice(0, 60);
    if (!name) return;
    const existing = savedViews.find((saved) => saved.name.toLowerCase() === name.toLowerCase());
    if (!existing && savedViews.length >= 20) {
      toast.error("You can save up to 20 contact views per organisation");
      return;
    }
    const saved: ContactSavedView = {
      id: existing?.id ?? `${Date.now()}`,
      name,
      view,
      query: q,
      sort,
      filters,
    };
    saveViewPreferences(
      existing
        ? savedViews.map((item) => (item.id === existing.id ? saved : item))
        : [...savedViews, saved],
      existing ? "Saved view updated across your devices" : "Contact view synced across devices",
    );
    setSelectedSavedViewId(saved.id);
    setSavedViewName("");
  };

  const applySavedView = (id: string) => {
    const selected = savedViews.find((saved) => saved.id === id);
    if (!selected) return;
    setFilters(selected.filters);
    setSelectedSavedViewId(id);
    patchDirectory({
      view: selected.view,
      q: selected.query,
      sort: selected.sort,
      page: 0,
    });
  };

  const deleteSavedView = () => {
    if (!selectedSavedViewId || preferenceSyncBlocked) return;
    saveViewPreferences(
      savedViews.filter((saved) => saved.id !== selectedSavedViewId),
      "Saved view removed from your account",
    );
    setSelectedSavedViewId("");
  };

  const saveColumns = (columns: ContactDirectoryColumnId[]) => {
    if (preferenceBusy) return;
    const next = normalizeContactDirectoryColumns(columns);
    setColumnPreferences({ companyId, columns: next });
    if (preferenceKey) {
      try {
        window.localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {
        toast.message("Columns changed for this session; browser storage is unavailable");
      }
    }
    // Fail-closed: never push to account until cloud preferences loaded successfully.
    if (!cloudPrefsReady) return;
    saveCloudM.mutate({ kind: "columns", value: next });
  };
  const kindForApi = useMemo(() => {
    if (view === "customers") return "customers";
    if (view === "suppliers") return "suppliers";
    return "all";
  }, [view]);

  const query = useQuery({
    queryKey: ["contacts", companyId, view, q, sort, filters, page],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetch({
        data: {
          companyId: companyId!,
          kind: kindForApi,
          view,
          ...(q ? { q } : {}),
          filters,
          includeInactive: view === "inactive" || view === "archived",
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          ...(sort !== "default" ? { sort } : {}),
        },
      }),
  });

  const countQ = useQuery({
    queryKey: ["contacts-count", companyId, view, q, filters],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchCount({
        data: { companyId: companyId!, kind: kindForApi, view, ...(q ? { q } : {}), filters },
      }),
  });

  const pageRows = (query.data ?? []) as ContactRow[];
  const pageIds = pageRows.map((contact) => contact.id);
  const selectedIds = selectedContactsOnPage(
    selection.scope === scope ? selection.ids : [],
    pageIds,
  );
  const selectedRows = pageRows.filter((contact) => selectedIds.includes(contact.id));
  const selectionIsActive = selectedRows.every(
    (contact) => contact.is_active && !contact.archived_at,
  );
  const allSelected = pageRows.length > 0 && selectedIds.length === pageRows.length;
  const someSelected = selectedIds.length > 0;

  const togglePageSelection = (checked: boolean) => {
    setSelection({ scope, ids: checked ? pageIds : [] });
  };
  const toggleRowSelection = (contactId: string, checked: boolean) => {
    setSelection((previous) => {
      const ids = previous.scope === scope ? previous.ids : [];
      return {
        scope,
        ids: checked ? [...new Set([...ids, contactId])] : ids.filter((id) => id !== contactId),
      };
    });
  };

  const groupsQ = useQuery({
    queryKey: ["contact-groups", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchGroups({ data: { companyId: companyId! } }),
  });
  const tagsQ = useQuery({
    queryKey: ["contact-tags", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchTags({ data: { companyId: companyId! } }),
  });
  const groups = (
    (groupsQ.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>
  ).filter((group) => group.is_active);
  const tags = (
    (tagsQ.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>
  ).filter((tag) => tag.is_active);

  const bulkM = useMutation({
    mutationFn: (input: { labelKind: "group" | "tag"; labelId: string }) =>
      bulkAdd({
        data: {
          companyId: companyId!,
          contactIds: selectedIds,
          labelKind: input.labelKind,
          labelId: input.labelId,
        },
      }),
    onSuccess: async (result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts-count", companyId] }),
      ]);
      const label = input.labelKind === "group" ? "group" : "tag";
      toast.success(
        `Applied ${label} to ${result.selected} selected contacts (${result.added} new memberships)`,
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const bulkRemoveM = useMutation({
    mutationFn: (input: { labelKind: "group" | "tag"; labelId: string }) =>
      bulkRemove({
        data: {
          companyId: companyId!,
          contactIds: selectedIds,
          labelKind: input.labelKind,
          labelId: input.labelId,
          confirm: true,
        },
      }),
    onSuccess: async (result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts-count", companyId] }),
      ]);
      toast.success(
        `Removed ${input.labelKind} membership from ${result.removed} of ${result.selected} selected contacts`,
      );
      setSelection({ scope, ids: [] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const createAndAssignM = useMutation({
    mutationFn: async ({ labelKind, name }: { labelKind: "group" | "tag"; name: string }) => {
      if (!canManage || !selectionIsActive || !selectedIds.length) {
        throw new Error("Select active contacts before creating a group or tag");
      }
      const created =
        labelKind === "group"
          ? await createGroup({ data: { companyId: companyId!, name } })
          : await createTag({ data: { companyId: companyId!, name } });
      try {
        const assignment = await bulkAdd({
          data: {
            companyId: companyId!,
            contactIds: selectedIds,
            labelKind,
            labelId: created.id,
          },
        });
        return { id: created.id, assignment };
      } catch (error) {
        throw new Error(
          `The ${labelKind} was created, but assigning contacts failed: ${friendlyAuthError(error)}`,
        );
      }
    },
    onSuccess: async ({ id, assignment }, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact-groups", companyId] }),
        qc.invalidateQueries({ queryKey: ["contact-tags", companyId] }),
        qc.invalidateQueries({ queryKey: ["contact", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts-count", companyId] }),
      ]);
      if (input.labelKind === "group") {
        setGroupId(id);
        setNewGroupName("");
      } else {
        setTagId(id);
        setNewTagName("");
      }
      toast.success(`Created ${input.labelKind} and assigned ${assignment.selected} contacts`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const exportSelected = () => {
    const headers = visibleColumns.map(
      (column) => CONTACT_DIRECTORY_COLUMNS.find((item) => item.id === column)!.label,
    );
    const records = selectedRows.map((contact) =>
      Object.fromEntries(
        visibleColumns.map((column, index) => [
          headers[index]!,
          formattedContactValue(contact, column, currency),
        ]),
      ),
    );
    const csv = buildContactsCsv(records, headers);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-selected-contacts.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedRows.length} selected contacts`);
  };

  const summaryQ = useQuery({
    queryKey: ["contacts-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSummary({ data: { companyId: companyId! } }),
  });

  const exportM = useMutation({
    mutationFn: () =>
      exportFn({
        data: { companyId: companyId!, kind: kindForApi, view, ...(q ? { q } : {}), filters },
      }),
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linkbooks-contacts-${view}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} contacts`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const summary = summaryQ.data;

  return (
    <ListWorkspace
      title="Contacts"
      description="One directory for customers and suppliers — shared with sales, purchases and statements."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link
              to="/contacts/new"
              search={{
                kind: "customer",
                returnContext: encodeContactsReturnContext(directorySearch) || undefined,
              }}
            >
              New contact
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/contacts/import">
              <Upload className="mr-1 size-4" /> Import
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exportM.isPending || !query.isSuccess || query.isError}
            onClick={() => exportM.mutate()}
          >
            <Download className="mr-1 size-4" /> Export
          </Button>
          <Button variant="outline" size="sm" asChild>
            <SettingsDestinationLink destination={{ to: "/contacts/settings" }}>
              <Settings2 className="mr-1 size-4" /> Settings
            </SettingsDestinationLink>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/contacts/duplicates">Duplicates</Link>
          </Button>
        </div>
      }
    >
      {summary ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Active contacts" value={String(summary.activeContactCount)} />
          <Metric
            label={`Receivables (${summary.baseCurrency})`}
            value={fromMinorUnits(summary.receivableMinor, summary.baseCurrency)}
            hint={otherCurrencies(summary.receivableByCurrency, summary.baseCurrency)}
          />
          <Metric
            label={`Payables (${summary.baseCurrency})`}
            value={fromMinorUnits(summary.payableMinor, summary.baseCurrency)}
            hint={otherCurrencies(summary.payableByCurrency, summary.baseCurrency)}
          />
          <Metric
            label="Overdue receivables"
            value={fromMinorUnits(summary.overdueReceivableMinor, summary.baseCurrency)}
          />
          <Metric
            label="Overdue payables"
            value={fromMinorUnits(summary.overduePayableMinor, summary.baseCurrency)}
          />
        </div>
      ) : null}

      <ContactFollowUpsPanel companyId={companyId} />

      <Tabs value={view}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList onKeyDown={handleNativeTabKeyDown} className="flex h-auto flex-wrap">
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "all"}
              data-state={view === "all" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "all", page: 0 })
              }
            >
              All
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "customers"}
              data-state={view === "customers" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "customers", page: 0 })
              }
            >
              Customers
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "suppliers"}
              data-state={view === "suppliers" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "suppliers", page: 0 })
              }
            >
              Suppliers
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "both"}
              data-state={view === "both" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "both", page: 0 })
              }
            >
              Both roles
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "recent"}
              data-state={view === "recent" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "recent", page: 0 })
              }
            >
              Recently added
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "updated"}
              data-state={view === "updated" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "updated", page: 0 })
              }
            >
              Recently updated
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "inactive"}
              data-state={view === "inactive" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "inactive", page: 0 })
              }
            >
              Inactive
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "archived"}
              data-state={view === "archived" ? "active" : "inactive"}
              to="/contacts"
              search={(previous) =>
                parseContactsDirectorySearch({ ...previous, view: "archived", page: 0 })
              }
            >
              Archived
            </Link>
          </TabsList>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto">
            <RecordLookupSelect
              value={sort}
              onValueChange={(value) => {
                setSort(value);
              }}
            >
              <SelectTrigger className="w-52" aria-label="Sort contacts">
                <SelectValue placeholder="Sort contacts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default order</SelectItem>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="name_desc">Name Z–A</SelectItem>
                <SelectItem value="account_asc">Account number A–Z</SelectItem>
                <SelectItem value="account_desc">Account number Z–A</SelectItem>
                <SelectItem value="roles_asc">Role A–Z</SelectItem>
                <SelectItem value="roles_desc">Role Z–A</SelectItem>
                <SelectItem value="email_asc">Email A–Z</SelectItem>
                <SelectItem value="email_desc">Email Z–A</SelectItem>
                <SelectItem value="phone_asc">Phone A–Z</SelectItem>
                <SelectItem value="phone_desc">Phone Z–A</SelectItem>
                <SelectItem value="terms_asc">Payment terms shortest</SelectItem>
                <SelectItem value="terms_desc">Payment terms longest</SelectItem>
                <SelectItem value="recent">Newest first</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
              </SelectContent>
            </RecordLookupSelect>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Columns (${visibleColumns.length})`}
                >
                  <Columns3 className="mr-1 size-4" />
                  Columns ({visibleColumns.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-96 w-60 overflow-y-auto">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {CONTACT_DIRECTORY_COLUMNS.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={visibleColumns.includes(column.id)}
                    disabled={column.id === "name" || preferenceBusy}
                    onCheckedChange={(checked) =>
                      saveColumns(
                        toggleContactDirectoryColumn(visibleColumns, column.id, checked === true),
                      )
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={preferenceBusy}
                  onSelect={() => saveColumns([...DEFAULT_CONTACT_DIRECTORY_COLUMNS])}
                >
                  Reset to default
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {cloudPreferencesQ.isError
                    ? "Cloud unavailable — browser preferences only"
                    : preferenceBusy
                      ? "Loading or syncing preferences…"
                      : !cloudPrefsReady
                        ? "Waiting for account preferences…"
                        : "Column preferences sync to your account"}
                </DropdownMenuLabel>
                {canImportBrowserPreferences ? (
                  <DropdownMenuItem
                    disabled={preferenceSyncBlocked}
                    onSelect={() => importLegacyM.mutate()}
                  >
                    Import this browser's settings
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Advanced contact filters">
                  <Filter className="mr-1 size-4" />
                  Filters{filterCount ? ` (${filterCount})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
                <h3 className="font-medium">Advanced filters</h3>
                <p className="text-xs text-muted-foreground">
                  Filters apply to every page, the total count and full CSV export.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="contact-filter-city">Billing city</Label>
                  <Input
                    id="contact-filter-city"
                    value={filters.city}
                    placeholder="Contains..."
                    onChange={(event) => updateFilter("city", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="contact-filter-region">Billing state / region</Label>
                  <Input
                    id="contact-filter-region"
                    value={filters.region}
                    placeholder="Contains..."
                    onChange={(event) => updateFilter("region", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="contact-filter-country">Billing country</Label>
                  <Input
                    id="contact-filter-country"
                    value={filters.country}
                    placeholder="Contains..."
                    onChange={(event) => updateFilter("country", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Group membership</Label>
                  {groupsQ.isError ? null : groupsQ.isSuccess ? (
                    <RecordLookupSelect
                      required
                      value={filters.groupId || "any"}
                      onValueChange={(value) =>
                        updateFilter("groupId", value === "any" ? "" : value)
                      }
                    >
                      <SelectTrigger aria-label="Filter contacts by group">
                        <SelectValue placeholder="Any group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any group</SelectItem>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading groups…</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Tag membership</Label>
                  {tagsQ.isError ? null : tagsQ.isSuccess ? (
                    <RecordLookupSelect
                      required
                      value={filters.tagId || "any"}
                      onValueChange={(value) => updateFilter("tagId", value === "any" ? "" : value)}
                    >
                      <SelectTrigger aria-label="Filter contacts by tag">
                        <SelectValue placeholder="Any tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any tag</SelectItem>
                        {tags.map((tag) => (
                          <SelectItem key={tag.id} value={tag.id}>
                            {tag.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading tags…</p>
                  )}
                </div>
                {groupsQ.isError || tagsQ.isError ? (
                  <QueryErrorState
                    queries={[groupsQ, tagsQ]}
                    title="Could not load groups or tags"
                  />
                ) : null}
                <div className="space-y-1">
                  <Label>Contact currency override</Label>
                  <RecordLookupSelect
                    value={filters.currency || "any"}
                    onValueChange={(value) =>
                      updateFilter("currency", value === "any" ? "" : value)
                    }
                  >
                    {/* lookup-fixed-enum: Currency filter uses the fixed supported currency-code enumeration. */}

                    <SelectTrigger aria-label="Filter by contact currency override">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any currency</SelectItem>
                      {["GBP", "USD", "EUR", "AUD", "NZD", "INR", "CAD", "SGD", "AED", "ZAR"].map(
                        (code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="space-y-1">
                  <Label>Payment terms</Label>
                  <RecordLookupSelect
                    value={filters.terms}
                    onValueChange={(value) => updateFilter("terms", value)}
                  >
                    <SelectTrigger aria-label="Filter by payment terms">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any payment terms</SelectItem>
                      <SelectItem value="immediate">Due immediately (0 days)</SelectItem>
                      <SelectItem value="up_to_30">1 to 30 days</SelectItem>
                      <SelectItem value="over_30">More than 30 days</SelectItem>
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="flex justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!filterCount}
                    onClick={() => {
                      setFilters({ ...DEFAULT_CONTACT_ADVANCED_FILTERS });
                      setPage(0);
                      setSelectedSavedViewId("");
                    }}
                  >
                    Clear filters
                  </Button>
                  <Button size="sm" onClick={() => setFilterOpen(false)}>
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Bookmark className="mr-1 size-4" /> Saved views
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
                <h3 className="font-medium">Saved contact views</h3>
                <p className="text-xs text-muted-foreground">
                  Save search, filters, sort and role tab for your account across devices.
                </p>
                {cloudPreferencesQ.isError ? (
                  <QueryErrorState
                    queries={[cloudPreferencesQ]}
                    title="Cloud settings could not be loaded"
                    description="Browser-only views remain available."
                  />
                ) : null}
                {canImportBrowserPreferences ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">
                      Older settings from this browser can be imported without replacing existing
                      account preferences.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={preferenceSyncBlocked}
                      onClick={() => importLegacyM.mutate()}
                    >
                      Import browser settings
                    </Button>
                  </div>
                ) : null}
                {cloudPrefsReady ? (
                  <div className="space-y-1">
                    <Label>Open saved view</Label>
                    <RecordLookupSelect
                      required
                      value={selectedSavedViewId || "none"}
                      onValueChange={(value) => {
                        if (value === "none") {
                          setSelectedSavedViewId("");
                        } else {
                          applySavedView(value);
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Open a saved contact view">
                        <SelectValue placeholder="Choose saved view" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose a view</SelectItem>
                        {savedViews.map((saved) => (
                          <SelectItem key={saved.id} value={saved.id}>
                            {saved.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="contact-save-view-name">Save current view as</Label>
                  <Input
                    id="contact-save-view-name"
                    maxLength={60}
                    value={savedViewName}
                    placeholder="e.g. UK suppliers, 30-day terms"
                    onChange={(event) => setSavedViewName(event.target.value)}
                    disabled={!cloudPrefsReady}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!savedViewName.trim() || preferenceSyncBlocked}
                    onClick={saveCurrentView}
                  >
                    Save view
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedSavedViewId || preferenceSyncBlocked}
                    onClick={deleteSavedView}
                  >
                    Delete selected
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Input
              placeholder="Search name, email, phone, account #, tax ID…"
              className="lg:max-w-sm"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
              }}
              aria-label="Search contacts"
            />
          </div>
        </div>
        <TabsContent value={view} className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="text-sm" aria-live="polite">
              <span className="font-medium">{selectedIds.length} contacts selected</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Selection applies to this page only (maximum 50)
              </span>
            </div>
            {someSelected ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportSelected}>
                  <Download className="mr-1 size-4" /> Export selected
                </Button>
                {canManage ? (
                  <>
                    <RecordLookupSelect required value={groupId} onValueChange={setGroupId}>
                      <SelectTrigger className="w-44" aria-label="Choose a contact group">
                        <SelectValue placeholder="Choose group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        bulkM.isPending ||
                        query.isFetching ||
                        !selectionIsActive ||
                        !groups.some((group) => group.id === groupId)
                      }
                      onClick={() => bulkM.mutate({ labelKind: "group", labelId: groupId })}
                    >
                      Add to group
                    </Button>
                    <ConfirmContactLabelRemoval
                      kind="group"
                      name={groups.find((group) => group.id === groupId)?.name ?? "this group"}
                      count={selectedIds.length}
                      disabled={
                        bulkM.isPending ||
                        bulkRemoveM.isPending ||
                        createAndAssignM.isPending ||
                        query.isFetching ||
                        !selectionIsActive ||
                        !groups.some((group) => group.id === groupId)
                      }
                      onConfirm={() => bulkRemoveM.mutate({ labelKind: "group", labelId: groupId })}
                    />
                    <RecordLookupSelect required value={tagId} onValueChange={setTagId}>
                      <SelectTrigger className="w-44" aria-label="Choose a contact tag">
                        <SelectValue placeholder="Choose tag" />
                      </SelectTrigger>
                      <SelectContent>
                        {tags.map((tag) => (
                          <SelectItem key={tag.id} value={tag.id}>
                            {tag.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        bulkM.isPending ||
                        query.isFetching ||
                        !selectionIsActive ||
                        !tags.some((tag) => tag.id === tagId)
                      }
                      onClick={() => bulkM.mutate({ labelKind: "tag", labelId: tagId })}
                    >
                      Add tag
                    </Button>
                    <ConfirmContactLabelRemoval
                      kind="tag"
                      name={tags.find((tag) => tag.id === tagId)?.name ?? "this tag"}
                      count={selectedIds.length}
                      disabled={
                        bulkM.isPending ||
                        bulkRemoveM.isPending ||
                        createAndAssignM.isPending ||
                        query.isFetching ||
                        !selectionIsActive ||
                        !tags.some((tag) => tag.id === tagId)
                      }
                      onConfirm={() => bulkRemoveM.mutate({ labelKind: "tag", labelId: tagId })}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            bulkM.isPending ||
                            createAndAssignM.isPending ||
                            query.isFetching ||
                            !selectionIsActive
                          }
                        >
                          <Plus className="mr-1 size-4" /> New group / tag
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 space-y-4">
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium">Create group and assign</h3>
                          <p className="text-xs text-muted-foreground">
                            Creates a group and adds all selected contacts without replacing
                            existing groups.
                          </p>
                          <Label htmlFor="contact-new-bulk-group">Group name</Label>
                          <Input
                            id="contact-new-bulk-group"
                            maxLength={80}
                            value={newGroupName}
                            onChange={(event) => setNewGroupName(event.target.value)}
                            placeholder="e.g. Wholesale customers"
                          />
                          <Button
                            size="sm"
                            disabled={
                              !newGroupName.trim() || createAndAssignM.isPending || bulkM.isPending
                            }
                            onClick={() =>
                              createAndAssignM.mutate({
                                labelKind: "group",
                                name: newGroupName.trim(),
                              })
                            }
                          >
                            Create and assign group
                          </Button>
                        </div>
                        <div className="space-y-2 border-t pt-3">
                          <h3 className="text-sm font-medium">Create tag and assign</h3>
                          <Label htmlFor="contact-new-bulk-tag">Tag name</Label>
                          <Input
                            id="contact-new-bulk-tag"
                            maxLength={60}
                            value={newTagName}
                            onChange={(event) => setNewTagName(event.target.value)}
                            placeholder="e.g. priority"
                          />
                          <Button
                            size="sm"
                            disabled={
                              !newTagName.trim() || createAndAssignM.isPending || bulkM.isPending
                            }
                            onClick={() =>
                              createAndAssignM.mutate({ labelKind: "tag", name: newTagName.trim() })
                            }
                          >
                            Create and assign tag
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Link
                      to="/contacts/settings"
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      Manage groups & tags
                    </Link>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={bulkM.isPending}
                  onClick={() => setSelection({ scope, ids: [] })}
                >
                  Clear selection
                </Button>
              </div>
            ) : null}
            {someSelected && !selectionIsActive && canManage ? (
              <p className="w-full text-xs text-muted-foreground">
                Only active, unarchived contacts can be added to groups or tags.
              </p>
            ) : null}
            {someSelected && canManage && (groupsQ.isError || tagsQ.isError) ? (
              <QueryErrorState
                queries={[groupsQ, tagsQ]}
                title="Could not load groups or tags"
              />
            ) : null}
          </div>
          {query.isPending ? (
            <ListSkeleton />
          ) : query.isError ? (
            <QueryErrorState queries={[query]} title="Could not load contacts" />
          ) : !query.isSuccess ? (
            <ListSkeleton />
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts"
              description="Use New contact to create a contact, or import a CSV."
              action={
                <Button size="sm" asChild>
                  <Link to="/contacts/new" search={{ kind: "customer" }}>
                    New contact
                  </Link>
                </Button>
              }
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all contacts on this page"
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={(value) => togglePageSelection(value === true)}
                      />
                    </TableHead>
                    {visibleColumns.map((columnId) => {
                      const column = CONTACT_DIRECTORY_COLUMNS.find((item) => item.id === columnId);
                      if (!column) return null;
                      return "sortField" in column ? (
                        <SortableContactHead
                          key={column.id}
                          label={column.label}
                          field={column.sortField}
                          sort={sort}
                          view={view}
                          onSort={(key) => {
                            setSort(nextContactSort(sort, key, view));
                          }}
                        />
                      ) : (
                        <TableHead key={column.id}>{column.label}</TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((contact) => (
                    <TableRow
                      key={contact.id}
                      data-state={selectedIds.includes(contact.id) ? "selected" : undefined}
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          aria-label={`Select ${contact.name}`}
                          checked={selectedIds.includes(contact.id)}
                          onCheckedChange={(value) =>
                            toggleRowSelection(contact.id, value === true)
                          }
                        />
                      </TableCell>
                      {visibleColumns.map((columnId) => (
                        <ContactDirectoryCell
                          key={columnId}
                          contact={contact}
                          column={columnId}
                          currency={currency}
                        />
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
          {!query.isPending &&
          !query.isError &&
          (page > 0 ||
            (countQ.data?.count ?? (query.data ?? []).length) > PAGE_SIZE ||
            (countQ.isError && (query.data ?? []).length === PAGE_SIZE)) ? (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(query.data ?? []).length ? page * PAGE_SIZE + 1 : 0}–
                {page * PAGE_SIZE + (query.data ?? []).length}
                {countQ.data ? ` of ${countQ.data.count}` : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    countQ.data
                      ? (page + 1) * PAGE_SIZE >= countQ.data.count
                      : (query.data ?? []).length < PAGE_SIZE
                  }
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </ListWorkspace>
  );
}

function otherCurrencies(
  rows: Array<{ currency: string; outstandingMinor: number }> | undefined,
  base: string,
): string | undefined {
  const others = (rows ?? []).filter((r) => r.currency !== base.toUpperCase());
  if (!others.length) return undefined;
  return `Also ${others.map((r) => `${fromMinorUnits(r.outstandingMinor, r.currency)} ${r.currency}`).join(", ")}`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
