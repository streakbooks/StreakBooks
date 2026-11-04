import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "@/lib/contacts/contacts.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
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
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, ListSkeleton, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/contacts/")({
  validateSearch: (search: Record<string, unknown>): { view?: string | undefined } => ({
    view: [
      "all",
      "customers",
      "suppliers",
      "both",
      "recent",
      "updated",
      "inactive",
      "archived",
    ].includes(String(search["view"]))
      ? String(search["view"])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contacts — LinkBooks" },
      { name: "description", content: "LinkBooks contact directory for customers and suppliers." },
    ],
  }),
  component: ContactsPage,
});

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
  if (column === "kind" || column === "is_active") {
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
  return (
    <Link
      to="/contacts/$contactId"
      params={{ contactId }}
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
  const fetch = useServerFn(listContacts);
  const fetchCount = useServerFn(countContacts);
  const fetchSummary = useServerFn(getContactsDirectorySummary);
  const exportFn = useServerFn(exportContactsCsv);
  const fetchGroups = useServerFn(listContactGroups);
  const fetchTags = useServerFn(listContactTags);
  const bulkAdd = useServerFn(bulkAddContactLabel);
  const canManage = useCanDo("contacts.manage");

  const { view: requestedView } = Route.useSearch();
  const view = requestedView ?? "all";
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("default");
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
  const preferenceKey = companyId ? `linkbooks:contact-columns:${companyId}` : "";
  const visibleColumns =
    columnPreferences.companyId === companyId
      ? columnPreferences.columns
      : DEFAULT_CONTACT_DIRECTORY_COLUMNS;
  const scope = `${companyId ?? ""}|${view}|${q}|${sort}|${page}`;

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
  }, [companyId]);

  const saveColumns = (columns: ContactDirectoryColumnId[]) => {
    const next = normalizeContactDirectoryColumns(columns);
    setColumnPreferences({ companyId, columns: next });
    if (preferenceKey) {
      try {
        window.localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {
        toast.message("Columns changed for this session; browser storage is unavailable");
      }
    }
  };
  const kindForApi = useMemo(() => {
    if (view === "customers") return "customers";
    if (view === "suppliers") return "suppliers";
    return "all";
  }, [view]);

  const query = useQuery({
    queryKey: ["contacts", companyId, view, q, sort, page],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetch({
        data: {
          companyId: companyId!,
          kind: kindForApi,
          view,
          ...(q ? { q } : {}),
          includeInactive: view === "inactive" || view === "archived",
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          ...(sort !== "default" ? { sort } : {}),
        },
      }),
  });

  const countQ = useQuery({
    queryKey: ["contacts-count", companyId, view, q],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchCount({ data: { companyId: companyId!, kind: kindForApi, view, ...(q ? { q } : {}) } }),
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
    enabled: Boolean(companyId && canManage && someSelected),
    queryFn: () => fetchGroups({ data: { companyId: companyId! } }),
  });
  const tagsQ = useQuery({
    queryKey: ["contact-tags", companyId],
    enabled: Boolean(companyId && canManage && someSelected),
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
      await qc.invalidateQueries({ queryKey: ["contact", companyId] });
      const label = input.labelKind === "group" ? "group" : "tag";
      toast.success(
        `Applied ${label} to ${result.selected} selected contacts (${result.added} new memberships)`,
      );
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
        data: { companyId: companyId!, kind: kindForApi, view, ...(q ? { q } : {}) },
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
    <>
      <PageHeader
        title="Contacts"
        description="One directory for customers and suppliers — shared with sales, purchases and statements."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/contacts/new" search={{ kind: "customer" }}>
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
              disabled={exportM.isPending}
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
      />

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

      <Tabs value={view}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList onKeyDown={handleNativeTabKeyDown} className="flex h-auto flex-wrap">
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "all"}
              data-state={view === "all" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "all" }}
              onClick={() => setPage(0)}
            >
              All
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "customers"}
              data-state={view === "customers" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "customers" }}
              onClick={() => setPage(0)}
            >
              Customers
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "suppliers"}
              data-state={view === "suppliers" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "suppliers" }}
              onClick={() => setPage(0)}
            >
              Suppliers
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "both"}
              data-state={view === "both" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "both" }}
              onClick={() => setPage(0)}
            >
              Both roles
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "recent"}
              data-state={view === "recent" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "recent" }}
              onClick={() => setPage(0)}
            >
              Recently added
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "updated"}
              data-state={view === "updated" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "updated" }}
              onClick={() => setPage(0)}
            >
              Recently updated
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "inactive"}
              data-state={view === "inactive" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "inactive" }}
              onClick={() => setPage(0)}
            >
              Inactive
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "archived"}
              data-state={view === "archived" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "archived" }}
              onClick={() => setPage(0)}
            >
              Archived
            </Link>
          </TabsList>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto">
            <Select
              value={sort}
              onValueChange={(value) => {
                setSort(value);
                setPage(0);
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
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Choose visible contact columns">
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
                    disabled={column.id === "name"}
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
                  onSelect={() => saveColumns([...DEFAULT_CONTACT_DIRECTORY_COLUMNS])}
                >
                  Reset to default
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              placeholder="Search name, email, phone, account #, tax ID…"
              className="lg:max-w-sm"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
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
                    <Select value={groupId} onValueChange={setGroupId}>
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
                    </Select>
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
                    <Select value={tagId} onValueChange={setTagId}>
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
                    </Select>
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
              <p role="alert" className="w-full text-xs text-destructive">
                Could not load groups or tags. Refresh Contacts and try again.
              </p>
            ) : null}
          </div>
          {query.isPending ? (
            <ListSkeleton />
          ) : query.isError ? (
            <ErrorState
              title="Could not load contacts"
              description={friendlyAuthError(query.error)}
            />
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts"
              description="Use New contact to create a contact, or import a CSV."
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
                            setPage(0);
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
    </>
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
