import { useMemo, useState } from "react";
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
  filterFirmClients,
  firmClientCsv,
  getFirmClientName,
  type FirmClientRow,
} from "@/lib/firm/client-portfolio";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Draft = Omit<FirmClientProfileInput, "firmId" | "companyId" | "tags"> & {
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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FirmClientStatus | "all">("all");
  const [editing, setEditing] = useState<FirmClientRow | null>(null);
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
    () => filterFirmClients(clients, profiles, search, status),
    [clients, profiles, search, status],
  );
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
  const needsReview = clients.filter((client) => {
    const date = profileMap.get(client.company_id)?.next_review_date;
    return date !== null && date !== undefined && date <= new Date().toISOString().slice(0, 10);
  }).length;

  return (
    <section aria-label="Client portfolio" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Linked clients</p>
          <p className="text-2xl font-semibold tabular-nums">{clients.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active in practice</p>
          <p className="text-2xl font-semibold tabular-nums">{active}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Onboarding / Reviews due</p>
          <p className="text-2xl font-semibold tabular-nums">
            {onboarding} / {needsReview}
          </p>
        </div>
      </div>

      {profilesQ.isError ? (
        <Alert>
          <AlertDescription>
            Client profile details are unavailable. Apply the firm-client-profiles database
            migration, or refresh to retry. Existing linked clients and book access remain
            available. {friendlyAuthError(profilesQ.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Client directory</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {clients.length} linked clients shown. Practice status does not
            change accounting access.
          </p>
        </div>
        <Button variant="outline" disabled={!filtered.length} onClick={exportVisible}>
          Export visible clients (CSV)
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
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
          <Label>Practice status</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as FirmClientStatus | "all")}
          >
            {/* lookup-fixed-enum: Practice status filter uses fixed lifecycle values. */}
            <SelectTrigger aria-label="Filter by practice status">
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
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact / Service</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Next review</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => {
                const profile = profileMap.get(client.company_id);
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="font-medium">{getFirmClientName(client)}</div>
                      {profile?.industry ? (
                        <div className="text-xs text-muted-foreground">{profile.industry}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABELS[profile?.status ?? "active"]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-52">
                      <div className="truncate">{profile?.primary_contact_name || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {profile?.service_line || "No service assigned"}
                      </div>
                    </TableCell>
                    <TableCell>{client.access_level}</TableCell>
                    <TableCell>{profile?.next_review_date ?? "—"}</TableCell>
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
