import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { toCsv } from "@/lib/sales/csv";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listWorkpaperReconcilingItems,
  listWorkpaperItemEvents,
  saveWorkpaperReconcilingItem,
  type WorkpaperReconcilingItem,
} from "@/lib/accountant/reconciling-items.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ItemAction = "add" | "update" | "resolve" | "reopen";

export function WorkpaperReconcilingItemsPanel({
  companyId,
  workpaperId,
  status,
  currency,
}: {
  companyId: string;
  workpaperId: string;
  status: "draft" | "prepared" | "reviewed";
  currency: string;
}) {
  const canManage = useCanDo("accounting.post") && status === "draft";
  const fmt = useFormat();
  const qc = useQueryClient();
  const fetchItems = useServerFn(listWorkpaperReconcilingItems);
  const fetchEvents = useServerFn(listWorkpaperItemEvents);
  const save = useServerFn(saveWorkpaperReconcilingItem);
  const [editing, setEditing] = useState<WorkpaperReconcilingItem | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reason, setReason] = useState("");
  const [historyId, setHistoryId] = useState("");

  const list = useQuery({
    queryKey: ["workpaper-reconciling-items", companyId, workpaperId],
    queryFn: () => fetchItems({ data: { companyId, workpaperId } }),
  });
  const history = useQuery({
    queryKey: ["workpaper-item-history", companyId, workpaperId, historyId],
    enabled: Boolean(historyId),
    queryFn: () => fetchEvents({ data: { companyId, workpaperId, itemId: historyId } }),
  });

  const reset = () => {
    setEditing(null);
    setDescription("");
    setAmount("");
    setEvidenceReference("");
    setReason("");
  };
  const choose = (item: WorkpaperReconcilingItem) => {
    setEditing(item);
    setDescription(item.description);
    setAmount(fromMinorUnits(item.amount_minor, currency));
    setEvidenceReference(item.evidence_reference);
    setReason("");
  };
  const mutation = useMutation({
    mutationFn: (action: ItemAction) => {
      if (!canManage) throw new Error("Reopen the workpaper before changing reconciling issues.");
      const payload =
        action === "add" || action === "update"
          ? {
              action,
              ...(editing ? { id: editing.id, version: editing.version } : {}),
              description: description.trim(),
              amountMinor: toMinorUnits(amount, currency).toString(),
              evidenceReference: evidenceReference.trim(),
            }
          : {
              action,
              id: editing!.id,
              version: editing!.version,
              reason: reason.trim(),
            };
      return save({ data: { companyId, workpaperId, payload } });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workpaper-reconciling-items", companyId, workpaperId] }),
        qc.invalidateQueries({ queryKey: ["account-workpapers", companyId] }),
        qc.invalidateQueries({ queryKey: ["workpaper-item-history", companyId, workpaperId] }),
      ]);
      reset();
      toast.success("Workpaper reconciling item updated. No ledger entry was posted.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const items = list.data ?? [];
  const openItems = items.filter((item) => item.state === "open");
  const openMinor = openItems.reduce((total, item) => total + BigInt(item.amount_minor), 0n);
  const safeOpen = openMinor >= -BigInt(Number.MAX_SAFE_INTEGER) &&
    openMinor <= BigInt(Number.MAX_SAFE_INTEGER);
  const exportItems = () => {
    const csv = toCsv(
      [
        "Description",
        "Amount minor units",
        "Status",
        "Evidence reference",
        "Resolution note",
        "Resolved by",
        "Updated at",
      ],
      items.map((item) => [
        item.description,
        item.amount_minor,
        item.state,
        item.evidence_reference,
        item.resolution_note,
        item.resolved_by,
        item.updated_at,
      ]),
    );
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkbooks-workpaper-reconciling-items.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="space-y-3 rounded-xl border p-4"
      aria-label="Workpaper reconciling issues"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Reconciling issues and evidence follow-up</h4>
        <Button size="sm" variant="outline" disabled={!items.length} onClick={exportItems}>
          Export issues CSV
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Record identified balance differences and resolution evidence. Items do not alter the
        posted ledger or automatically explain a GL movement. Unresolved items block workpaper
        preparation at the database level.
      </p>
      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading reconciling issues…</p>
      ) : list.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {friendlyAuthError(list.error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={openItems.length ? "destructive" : "secondary"}>
              {openItems.length} open of {items.length}
            </Badge>
            <Badge variant="outline">
              Open signed net: {safeOpen ? fmt.money(Number(openMinor)) : "Unsafe balance"}
            </Badge>
          </div>
          {items.length ? (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Signed difference: {fmt.money(item.amount_minor)} · Evidence:{" "}
                        {item.evidence_reference || "Not supplied"}
                      </p>
                      {item.state === "resolved" ? (
                        <p className="text-xs">
                          Resolution: {item.resolution_note} · By{" "}
                          {item.resolved_by?.slice(0, 8) ?? "unknown"}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={item.state === "open" ? "destructive" : "secondary"}>
                        {item.state}
                      </Badge>
                      {canManage ? (
                        <Button size="sm" variant="outline" onClick={() => choose(item)}>
                          {item.state === "open" ? "Edit or resolve" : "Reopen"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistoryId(historyId === item.id ? "" : item.id)}
                      >
                        History
                      </Button>
                    </div>
                  </div>
                  {historyId === item.id ? (
                    history.isPending ? (
                      <p className="text-xs text-muted-foreground">Loading history…</p>
                    ) : history.isError ? (
                      <p role="alert" className="text-xs text-destructive">
                        {friendlyAuthError(history.error)}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs">
                        {history.data?.map((event) => (
                          <li key={event.id}>
                            {event.created_at} · {event.action} · {event.actor_id.slice(0, 8)}…{" "}
                            {event.reason}
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No reconciling issues recorded for this workpaper.
            </p>
          )}
        </>
      )}
      {canManage ? (
        <div className="space-y-3 border-t pt-3">
          <h5 className="text-sm font-semibold">
            {editing ? "Review selected issue" : "Add a reconciling issue"}
          </h5>
          {(!editing || editing.state === "open") ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Description
                <Input
                  value={description}
                  maxLength={500}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                Signed amount ({currency})
                <Input
                  value={amount}
                  placeholder="100.00 or -100.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                Evidence reference
                <Input
                  value={evidenceReference}
                  maxLength={300}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          {editing ? (
            <label className="block space-y-1 text-sm">
              {editing.state === "resolved" ? "Reason to reopen" : "Resolution explanation"}
              <Textarea
                value={reason}
                maxLength={2000}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(!editing || editing.state === "open") ? (
              <Button
                size="sm"
                disabled={mutation.isPending || description.trim().length < 3 || !amount.trim()}
                onClick={() => mutation.mutate(editing ? "update" : "add")}
              >
                {editing ? "Save issue" : "Add issue"}
              </Button>
            ) : null}
            {editing?.state === "open" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending || reason.trim().length < 3 ||
                  editing.evidence_reference.trim().length < 3}
                onClick={() => mutation.mutate("resolve")}
              >
                Resolve with evidence
              </Button>
            ) : null}
            {editing?.state === "resolved" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending || reason.trim().length < 3}
                onClick={() => mutation.mutate("reopen")}
              >
                Reopen issue
              </Button>
            ) : null}
            {editing ? (
              <Button size="sm" variant="ghost" onClick={reset}>Cancel edit</Button>
            ) : null}
          </div>
        </div>
      ) : status !== "draft" ? (
        <p className="text-xs text-muted-foreground">
          Reopen this prepared or reviewed workpaper before changing reconciling evidence.
        </p>
      ) : null}
    </section>
  );
}
