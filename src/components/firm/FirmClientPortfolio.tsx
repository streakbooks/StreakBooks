import { useEffect, useMemo, useState } from "react";
import { Columns3 } from "lucide-react";
import { FirmBulkClientActions } from "@/components/firm/FirmBulkClientActions";
import { FirmServiceCatalogPanel } from "@/components/firm/FirmServiceCatalogPanel";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  CLIENT_STATUSES,
  listFirmClientProfiles,
  saveFirmClientProfile,
  type FirmClientProfileInput,
  type FirmClientStatus,
} from "@/lib/firm/client-profiles.functions";
import {
  STATUS_LABELS,
  DEFAULT_FIRM_CLIENT_COLUMNS,
  FIRM_CLIENT_COLUMNS,
  filterFirmClients,
  firmClientCsv,
  firmClientReviewState,
  firstFiftyFirmClientIds,
  selectedVisibleFirmClients,
  getFirmClientName,
  localFirmDate,
  normalizeFirmClientColumns,
  toggleFirmClientColumn,
  type FirmClientColumn,
  type FirmClientReviewFilter,
  type FirmClientSort,
  type FirmClientRow,
} from "@/lib/firm/client-portfolio";
import {
  getFirmDirectoryPreferences,
  saveFirmDirectoryPreference,
} from "@/lib/firm/firm-directory-preferences.functions";
import {
  normalizeFirmSavedViews,
  replaceFirmSavedView,
  type FirmSavedView,
  type FirmDirectoryPreferenceKind,
  type FirmDirectoryPreferences,
} from "@/lib/firm/firm-directory-preferences";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Draft = Omit<FirmClientProfileInput, "firmId" | "companyId" | "tags" | "expectedVersion"> & {
  tags: string;
};
const emptyDraft: Draft = {
  status: "active",
  primary_contact_name: "",
  primary_contact_email: "",
  industry: "",
  service_line: "",
  notes: "",
  tags: "",
  next_review_date: null,
};

export function FirmClientPortfolio({
  firmId,
  clients,
  canManage,
  busy,
  onOpen,
  onRevoke,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
  busy: boolean;
  onOpen: (companyId: string) => void;
  onRevoke: (companyId: string) => void;
}) {
  const list = useServerFn(listFirmClientProfiles);
  const save = useServerFn(saveFirmClientProfile);
  const getPreferences = useServerFn(getFirmDirectoryPreferences);
  const savePreference = useServerFn(saveFirmDirectoryPreference);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FirmClientStatus | "all">("all");
  const [review, setReview] = useState<FirmClientReviewFilter>("all");
  const [sort, setSort] = useState<FirmClientSort>("name");
  const [savedViewName, setSavedViewName] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [localViews, setLocalViews] = useState<{ firmId: string; views: FirmSavedView[] } | null>(
    null,
  );
  const [savedColumns, setSavedColumns] = useState<{
    firmId: string;
    columns: FirmClientColumn[];
  } | null>(null);
  const visibleColumns =
    savedColumns?.firmId === firmId ? savedColumns.columns : DEFAULT_FIRM_CLIENT_COLUMNS;
  const cloudPreferencesQ = useQuery({
    queryKey: ["firm-directory-preferences", firmId],
    queryFn: () => getPreferences({ data: { firmId } }),
    enabled: Boolean(firmId),
    retry: false,
  });
  const preferenceM = useMutation({
    mutationFn: (input: { kind: FirmDirectoryPreferenceKind; value: unknown }) =>
      savePreference({ data: { firmId, ...input } }),
    onSuccess: (saved) => {
      qc.setQueryData<FirmDirectoryPreferences>(
        ["firm-directory-preferences", firmId],
        (previous) => ({
          columns: previous?.columns ?? null,
          views: previous?.views ?? null,
          [saved.kind]: saved.value,
        }),
      );
    },
    onError: (error) =>
      toast.error("Cloud preferences could not be saved: " + friendlyAuthError(error)),
  });
  const preferenceBusy = cloudPreferencesQ.isPending || preferenceM.isPending;
  const savedViews =
    localViews?.firmId === firmId ? localViews.views : (cloudPreferencesQ.data?.views ?? []);
  useEffect(() => {
    if (!cloudPreferencesQ.isSuccess || !cloudPreferencesQ.data) return;
    if (cloudPreferencesQ.data.columns !== null) {
      setSavedColumns({
        firmId,
        columns: normalizeFirmClientColumns(cloudPreferencesQ.data.columns),
      });
    }
    if (cloudPreferencesQ.data.views !== null) {
      setLocalViews({
        firmId,
        views: normalizeFirmSavedViews(cloudPreferencesQ.data.views),
      });
    }
  }, [firmId, cloudPreferencesQ.isSuccess, cloudPreferencesQ.data]);

  useEffect(() => {
    let saved: unknown = null;
    try {
      const raw = window.localStorage.getItem("linkbooks:firm-client-columns:" + firmId);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      // Browser preferences are optional; never prevent access to the directory.
    }
    setSavedColumns({ firmId, columns: normalizeFirmClientColumns(saved) });
  }, [firmId]);

  function setColumns(columns: FirmClientColumn[]) {
    if (preferenceBusy) return;
    const next = normalizeFirmClientColumns(columns);
    setSavedColumns({ firmId, columns: next });
    try {
      window.localStorage.setItem("linkbooks:firm-client-columns:" + firmId, JSON.stringify(next));
    } catch {
      toast.message("Columns changed for this session; browser storage is unavailable");
    }
    if (!cloudPreferencesQ.isError) {
      preferenceM.mutate({ kind: "columns", value: next });
    } else {
      toast.message("Cloud unavailable; layout saved to this browser only");
    }
  }

  function saveCurrentView() {
    if (preferenceBusy || cloudPreferencesQ.isError) return;
    const name = savedViewName.trim().slice(0, 60);
    if (!name) return;
    const existing = savedViews.find(
      (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!existing && savedViews.length >= 20) {
      toast.error("You can save up to 20 views per firm");
      return;
    }
    const next = replaceFirmSavedView(savedViews, {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      query: search,
      status,
      review,
      sort,
    });
    preferenceM.mutate(
      { kind: "views", value: next },
      {
        onSuccess: () => {
          setLocalViews({ firmId, views: next });
          setSelectedViewId(next.find((item) => item.name === name)?.id ?? "");
          toast.success(
            existing ? "Client view updated in your account" : "Client view saved across devices",
          );
        },
      },
    );
  }

  function applySavedView(id: string) {
    const selected = savedViews.find((item) => item.id === id);
    if (!selected) return;
    setSearch(selected.query);
    setStatus(selected.status);
    setReview(selected.review);
    setSort(selected.sort);
    setSelectedViewId(selected.id);
    setSavedViewName(selected.name);
  }

  function deleteSavedView() {
    if (!selectedViewId || preferenceBusy || cloudPreferencesQ.isError) return;
    const next = savedViews.filter((item) => item.id !== selectedViewId);
    preferenceM.mutate(
      { kind: "views", value: next },
      {
        onSuccess: () => {
          setLocalViews({ firmId, views: next });
          setSelectedViewId("");
          setSavedViewName("");
          toast.success("Saved client view removed");
        },
      },
    );
  }

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setReview("all");
    setSort("name");
    setSelectedViewId("");
  }

  const [editing, setEditing] = useState<FirmClientRow | null>(null);
  const [editingVersion, setEditingVersion] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const profilesQ = useQuery({
    queryKey: ["firm-client-profiles", firmId],
    queryFn: () => list({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const profiles = useMemo(() => profilesQ.data ?? [], [profilesQ.data]);
  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.company_id, profile])),
    [profiles],
  );
  const filtered = useMemo(
    () => filterFirmClients(clients, profiles, search, status, { review, sort }),
    [clients, profiles, search, status, review, sort],
  );
  const eligibleClients = filtered.filter((client) => Boolean(client.companies));
  const visibleSelection = selectedVisibleFirmClients(filtered, selectedIds);
  const firstFiftyIds = firstFiftyFirmClientIds(filtered);
  const allFirstFiftySelected =
    firstFiftyIds.length > 0 && firstFiftyIds.every((id) => selectedIds.includes(id));

  function toggleSelectedClient(companyId: string, checked: boolean) {
    const eligible = new Set(eligibleClients.map((client) => client.company_id));
    const current = selectedIds.filter((id) => eligible.has(id));
    if (checked && !current.includes(companyId) && current.length >= 50) {
      toast.error("Bulk edits are limited to 50 clients at a time");
      return;
    }
    setSelectedIds(
      checked ? [...new Set([...current, companyId])] : current.filter((id) => id !== companyId),
    );
  }
  const saveM = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Select a client");
      const tags = [
        ...new Set(
          draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      const input: FirmClientProfileInput = {
        ...draft,
        tags,
        firmId,
        companyId: editing.company_id,
        expectedVersion: editingVersion,
      };
      return save({ data: input });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-client-profiles", firmId] });
      setEditing(null);
      toast.success("Client practice profile saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  function editClient(client: FirmClientRow) {
    const profile = profileMap.get(client.company_id);
    setEditing(client);
    setEditingVersion(profile?.version ?? 0);
    setDraft(
      profile
        ? {
            status: profile.status,
            primary_contact_name: profile.primary_contact_name,
            primary_contact_email: profile.primary_contact_email,
            industry: profile.industry,
            service_line: profile.service_line,
            notes: profile.notes,
            tags: profile.tags.join(", "),
            next_review_date: profile.next_review_date,
          }
        : { ...emptyDraft },
    );
  }

  function exportVisible() {
    const csv = firmClientCsv(filtered, profiles);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "firm-client-portfolio.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const active = clients.filter((client) => {
    const record = profileMap.get(client.company_id);
    return !record || record.status === "active";
  }).length;
  const onboarding = clients.filter(
    (client) => profileMap.get(client.company_id)?.status === "onboarding",
  ).length;
  const today = localFirmDate();
  const profileUnavailable = profilesQ.isPending || profilesQ.isError;
  const needsReview = clients.filter(
    (client) =>
      firmClientReviewState(profileMap.get(client.company_id)?.next_review_date, today) === "due",
  ).length;

  return (
    <section aria-label="Client portfolio" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Linked clients</p>
          <p className="text-2xl font-semibold tabular-nums">{clients.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active in practice</p>
          <p className="text-2xl font-semibold tabular-nums">{profileUnavailable ? "—" : active}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Onboarding / Reviews due</p>
          <p className="text-2xl font-semibold tabular-nums">
            {profileUnavailable ? "—" : `${onboarding} / ${needsReview}`}
          </p>
          <Button
            size="sm"
            variant="link"
            className="h-auto p-0"
            disabled={profileUnavailable || !needsReview}
            onClick={() => setReview("due")}
          >
            Show reviews due
          </Button>
        </div>
      </div>

      {profilesQ.isError ? (
        <QueryErrorState
          queries={[profilesQ]}
          title="Client profile details unavailable"
          description="Apply the firm-client-profiles database migration, or refresh to retry. Existing linked clients and book access remain available."
        />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Client directory</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {clients.length} linked clients shown. Practice status does not
            change accounting access.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!filtered.length || profileUnavailable}
          onClick={exportVisible}
        >
          Export filtered clients (CSV)
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_200px]">
        <div className="space-y-1">
          <Label htmlFor="firm-client-search">Search clients</Label>
          <Input
            id="firm-client-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Client, contact, service, industry or tag"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="firm-client-status">Practice status</Label>
          <Select
            value={status}
            disabled={profileUnavailable}
            onValueChange={(value) => setStatus(value as FirmClientStatus | "all")}
          >
            {/* lookup-fixed-enum: Practice status filter uses fixed lifecycle values. */}
            <SelectTrigger id="firm-client-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CLIENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="firm-client-review">Review schedule</Label>
          <Select
            value={review}
            disabled={profileUnavailable}
            onValueChange={(value) => setReview(value as FirmClientReviewFilter)}
          >
            {/* lookup-fixed-enum: Review filter uses fixed operational values. */}
            <SelectTrigger id="firm-client-review">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All review dates</SelectItem>
              <SelectItem value="due">Due or overdue</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="unscheduled">Not scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="firm-client-sort">Sort clients</Label>
          <Select value={sort} onValueChange={(value) => setSort(value as FirmClientSort)}>
            {/* lookup-fixed-enum: Sort uses fixed directory fields. */}
            <SelectTrigger id="firm-client-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="name_desc">Name Z–A</SelectItem>
              <SelectItem value="review">Review date: earliest</SelectItem>
              <SelectItem value="review_desc">Review date: latest</SelectItem>
              <SelectItem value="status">Practice status</SelectItem>
              <SelectItem value="service">Primary service</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Columns (${visibleColumns.length + 1})`}
            >
              <Columns3 className="mr-2 size-4" />
              Columns ({visibleColumns.length + 1})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 w-60 overflow-y-auto">
            <DropdownMenuLabel>Visible columns (client name always shown)</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FIRM_CLIENT_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={visibleColumns.includes(column.id)}
                disabled={preferenceBusy}
                onCheckedChange={(checked) =>
                  setColumns(toggleFirmClientColumn(visibleColumns, column.id, checked === true))
                }
                onSelect={(event) => event.preventDefault()}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={preferenceBusy}
              onSelect={() => setColumns([...DEFAULT_FIRM_CLIENT_COLUMNS])}
            >
              Reset columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {(search || status !== "all" || review !== "all" || sort !== "name") && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            Clear filters and sorting
          </Button>
        )}
        {profilesQ.isError && (
          <Button size="sm" variant="outline" onClick={() => void profilesQ.refetch()}>
            Retry client profiles
          </Button>
        )}
        {cloudPreferencesQ.isError && (
          <Button size="sm" variant="outline" onClick={() => void cloudPreferencesQ.refetch()}>
            Retry cloud preferences
          </Button>
        )}
        {cloudPreferencesQ.isError && (
          <p className="text-xs text-muted-foreground">
            Cloud preferences unavailable. Columns remain stored only in this browser.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="min-w-40 flex-1 space-y-1">
          <Label>Saved client views</Label>
          <RecordLookupSelect
            required
            value={selectedViewId || "none"}
            disabled={
              preferenceBusy ||
              !cloudPreferencesQ.isSuccess ||
              cloudPreferencesQ.isError ||
              savedViews.length === 0
            }
            onValueChange={(value) => {
              if (value !== "none") applySavedView(value);
            }}
          >
            {/* record-lookup: View items come from authenticated user-owned preferences. */}
            <SelectTrigger aria-label="Choose saved client view">
              <SelectValue placeholder="Choose a saved view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose a saved view</SelectItem>
              {savedViews.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </RecordLookupSelect>
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="firm-view-name">View name</Label>
          <Input
            id="firm-view-name"
            maxLength={60}
            placeholder="E.g. Payroll reviews due"
            value={savedViewName}
            onChange={(event) => setSavedViewName(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={
            preferenceBusy ||
            !cloudPreferencesQ.isSuccess ||
            cloudPreferencesQ.isError ||
            !savedViewName.trim()
          }
          onClick={saveCurrentView}
        >
          {preferenceM.isPending ? "Saving…" : "Save view"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={
            preferenceBusy ||
            !cloudPreferencesQ.isSuccess ||
            cloudPreferencesQ.isError ||
            !selectedViewId
          }
          onClick={deleteSavedView}
        >
          Delete view
        </Button>
      </div>

      {canManage && (
        <div className="space-y-2">
          <FirmServiceCatalogPanel firmId={firmId} canManage={canManage} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <p className="text-sm" aria-live="polite">
              <span className="font-medium">{visibleSelection.length} clients selected</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Selection is limited to the current filtered view (maximum 50).
              </span>
            </p>
            {visibleSelection.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear selection
              </Button>
            )}
          </div>
          <FirmBulkClientActions
            firmId={firmId}
            clients={clients}
            selectedClients={visibleSelection}
            profiles={profiles}
            disabled={profileUnavailable || busy}
            onComplete={() => setSelectedIds([])}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match these filters.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select up to 50 filtered clients"
                      checked={allFirstFiftySelected}
                      disabled={profileUnavailable || busy || !firstFiftyIds.length}
                      onCheckedChange={(checked) =>
                        setSelectedIds(checked === true ? firstFiftyIds : [])
                      }
                    />
                  </TableHead>
                )}
                <TableHead>Client</TableHead>
                {visibleColumns.map((column) => (
                  <TableHead key={column}>
                    {FIRM_CLIENT_COLUMNS.find((item) => item.id === column)?.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => {
                const profile = profileMap.get(client.company_id);
                return (
                  <TableRow key={client.id}>
                    {canManage && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${getFirmClientName(client)}`}
                          checked={visibleSelection.some(
                            (item) => item.company_id === client.company_id,
                          )}
                          disabled={profileUnavailable || busy || !client.companies}
                          onCheckedChange={(checked) =>
                            toggleSelectedClient(client.company_id, checked === true)
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="font-medium">{getFirmClientName(client)}</div>
                    </TableCell>
                    {visibleColumns.map((column) => (
                      <TableCell key={column} className="max-w-56">
                        {column === "status" ? (
                          <StatusBadge
                            status={profile?.status ?? "active"}
                            label={STATUS_LABELS[profile?.status ?? "active"]}
                          />
                        ) : column === "contact" ? (
                          <span className="block truncate">
                            {profile?.primary_contact_name || "—"}
                          </span>
                        ) : column === "email" ? (
                          profile?.primary_contact_email ? (
                            <a
                              className="block truncate underline-offset-2 hover:underline"
                              href={"mailto:" + profile.primary_contact_email}
                            >
                              {profile.primary_contact_email}
                            </a>
                          ) : (
                            "—"
                          )
                        ) : column === "service" ? (
                          <span className="block truncate">{profile?.service_line || "—"}</span>
                        ) : column === "industry" ? (
                          <span className="block truncate">{profile?.industry || "—"}</span>
                        ) : column === "tags" ? (
                          <span className="block truncate">{profile?.tags.join(", ") || "—"}</span>
                        ) : column === "access" ? (
                          client.access_level
                        ) : column === "review" ? (
                          <span
                            className={
                              firmClientReviewState(profile?.next_review_date, today) === "due"
                                ? "font-medium text-destructive"
                                : ""
                            }
                          >
                            {profile?.next_review_date ?? "—"}
                            {profile?.next_review_date &&
                            firmClientReviewState(profile.next_review_date, today) === "due"
                              ? " (due)"
                              : ""}
                          </span>
                        ) : null}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !client.companies}
                          onClick={() => onOpen(client.company_id)}
                        >
                          Open books
                        </Button>
                        {canManage ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                profilesQ.isError || profilesQ.isPending || !client.companies
                              }
                              onClick={() => editClient(client)}
                            >
                              Profile
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => onRevoke(client.company_id)}
                            >
                              Revoke
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !saveM.isPending) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Client practice profile</DialogTitle>
            <DialogDescription>
              {editing ? getFirmClientName(editing) : "Client"} — Firm-owned information. Changes
              here do not edit the client's legal or accounting records.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveM.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="client-status">Practice status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, status: value as FirmClientStatus }))
                  }
                >
                  {/* lookup-fixed-enum: Practice status uses fixed lifecycle values. */}
                  <SelectTrigger id="client-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="client-review">Next review date</Label>
                <Input
                  id="client-review"
                  type="date"
                  value={draft.next_review_date ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      next_review_date: event.target.value || null,
                    }))
                  }
                />
              </div>
              {(
                [
                  ["primary_contact_name", "Primary contact"],
                  ["primary_contact_email", "Contact email"],
                  ["industry", "Industry"],
                  ["service_line", "Primary service"],
                ] as const
              ).map(([field, title]) => (
                <div key={field} className="space-y-1">
                  <Label htmlFor={field}>{title}</Label>
                  <Input
                    id={field}
                    type={field === "primary_contact_email" ? "email" : "text"}
                    maxLength={field === "primary_contact_email" ? 254 : 120}
                    value={draft[field]}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-tags">Tags (comma-separated, up to 12)</Label>
              <Input
                id="client-tags"
                value={draft.tags}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tags: event.target.value }))
                }
                placeholder="Monthly, Payroll, Advisory"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-notes">Internal practice notes</Label>
              <textarea
                id="client-notes"
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                maxLength={3000}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveM.isPending}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveM.isPending}>
                {saveM.isPending ? "Saving…" : "Save client profile"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
