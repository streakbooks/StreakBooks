import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
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
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import {
  listFirmEngagements,
  saveFirmEngagement,
  type EngagementInput,
  type FirmEngagement,
} from "@/lib/firm/firm-workflows.functions";

const STATUSES = ["draft", "active", "paused", "completed", "cancelled"] as const;
const FREQUENCIES = ["one_off", "monthly", "quarterly", "annual"] as const;

type Draft = Pick<
  EngagementInput,
  "name" | "status" | "frequency" | "start_date" | "end_date" | "currency_code" | "notes"
> & { agreed_fee: string };

function initialDraft(): Draft {
  return {
    name: "",
    status: "draft",
    frequency: "monthly",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    agreed_fee: "",
    currency_code: "",
    notes: "",
  };
}

export function FirmEngagementPanel({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const available = clients.filter((client) => Boolean(client.companies));
  const [selected, setSelected] = useState("");
  const clientId = available.some((client) => client.company_id === selected)
    ? selected
    : available[0]?.company_id || "";
  const [editing, setEditing] = useState<FirmEngagement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const list = useServerFn(listFirmEngagements);
  const save = useServerFn(saveFirmEngagement);
  const qc = useQueryClient();
  const queryKey = ["firm-engagements", firmId, clientId];
  const engagementsQ = useQuery({
    queryKey,
    enabled: Boolean(clientId),
    queryFn: () => list({ data: { firmId, companyId: clientId } }),
  });
  const saveM = useMutation({
    mutationFn: () => {
      const payload: EngagementInput = {
        firmId,
        companyId: clientId,
        ...(editing ? { id: editing.id, version: editing.version } : {}),
        ...draft,
        currency_code: draft.currency_code.trim().toUpperCase(),
        agreed_fee: draft.agreed_fee.trim() || null,
      };
      return save({ data: payload });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      setDialogOpen(false);
      setEditing(null);
      toast.success("Engagement record saved");
    },
    onError: async (error) => {
      await qc.invalidateQueries({ queryKey });
      toast.error(friendlyAuthError(error));
    },
  });

  function startNew() {
    setEditing(null);
    setDraft(initialDraft());
    setDialogOpen(true);
  }

  function edit(value: FirmEngagement) {
    setEditing(value);
    setDraft({
      name: value.name,
      status: value.status,
      frequency: value.frequency,
      start_date: value.start_date,
      end_date: value.end_date,
      agreed_fee: value.agreed_fee === null ? "" : String(value.agreed_fee),
      currency_code: value.currency_code,
      notes: value.notes,
    });
    setDialogOpen(true);
  }

  return (
    <section className="space-y-5" aria-label="Firm client engagements">
      <div>
        <h2 className="text-lg font-semibold">Services & engagements</h2>
        <p className="text-sm text-muted-foreground">
          Record agreed services, periods, recurrence and fee terms. These records do not create
          accounting invoices, automated charges, or legally executed signatures.
        </p>
      </div>
      {available.length === 0 ? (
        <EmptyState
          title="No accessible clients"
          description="Link a client organisation before creating a service engagement."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full max-w-md space-y-1">
              <Label>Client organisation</Label>
              <LookupSelect
                ariaLabel="Select engagement client"
                allowClear={false}
                value={clientId}
                onChange={setSelected}
                searchPlaceholder="Search clients"
                options={available.map((client) => ({
                  id: client.company_id,
                  name: getFirmClientName(client),
                  label: getFirmClientName(client),
                }))}
              />
            </div>
            {canManage ? (
              <Button size="sm" onClick={startNew}>
                New engagement
              </Button>
            ) : null}
          </div>
          {engagementsQ.isPending ? (
            <LoadingState />
          ) : engagementsQ.isError ? (
            <QueryErrorState queries={[engagementsQ]} title="Could not load engagements" />
          ) : (engagementsQ.data ?? []).length === 0 ? (
            <EmptyState
              title="No engagements yet"
              description="Create a service engagement to record your practice's agreed work."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-3 font-medium">Engagement</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Frequency</th>
                    <th className="p-3 font-medium">Fee reference</th>
                    <th className="p-3 font-medium">Period</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(engagementsQ.data ?? []).map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="p-3 capitalize">{item.frequency.replace("_", " ")}</td>
                      <td className="whitespace-nowrap p-3">
                        {item.agreed_fee === null
                          ? "Not set"
                          : item.currency_code + " " + item.agreed_fee}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {item.start_date} — {item.end_date ?? "Ongoing"}
                      </td>
                      <td className="p-3">
                        {canManage ? (
                          <Button size="sm" variant="outline" onClick={() => edit(item)}>
                            Edit
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saveM.isPending) setDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit engagement" : "New engagement"}</DialogTitle>
            <DialogDescription>
              Practice service record only. No invoice is issued by saving this form.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveM.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="engagement-name">Service or engagement name</Label>
              <Input
                id="engagement-name"
                required
                minLength={2}
                maxLength={150}
                value={draft.name}
                onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
                placeholder="Monthly bookkeeping and reporting"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      status: value as Draft["status"],
                    }))
                  }
                >
                  {/* lookup-fixed-enum: Engagement status uses fixed lifecycle values. */}
                  <SelectTrigger aria-label="Engagement status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service frequency</Label>
                <Select
                  value={draft.frequency}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      frequency: value as Draft["frequency"],
                    }))
                  }
                >
                  {/* lookup-fixed-enum: Service frequency is a fixed schedule enumeration. */}
                  <SelectTrigger aria-label="Service frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="engagement-start">Start date</Label>
                <Input
                  id="engagement-start"
                  type="date"
                  required
                  value={draft.start_date}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, start_date: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="engagement-end">End date (optional)</Label>
                <Input
                  id="engagement-end"
                  type="date"
                  min={draft.start_date}
                  value={draft.end_date ?? ""}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      end_date: event.target.value || null,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="engagement-fee">Agreed fee (reference only)</Label>
                <Input
                  id="engagement-fee"
                  inputMode="decimal"
                  value={draft.agreed_fee}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, agreed_fee: event.target.value }))
                  }
                  placeholder="150.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="engagement-currency">Currency (required with fee)</Label>
                <Input
                  id="engagement-currency"
                  maxLength={3}
                  value={draft.currency_code}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      currency_code: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="AUD, USD, INR"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="engagement-notes">Engagement notes</Label>
              <textarea
                id="engagement-notes"
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                maxLength={3000}
                value={draft.notes}
                onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveM.isPending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveM.isPending}>
                {saveM.isPending ? "Saving…" : "Save engagement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
