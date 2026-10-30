import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { bulkBusinessStatus } from "@/lib/platform/platform.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function PlatformBulkActions({
  ids,
  onComplete,
}: {
  ids: string[];
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("suspended");
  const [reason, setReason] = useState("");
  const cache = useQueryClient();
  const update = useServerFn(bulkBusinessStatus);
  const mutation = useMutation({
    mutationFn: () =>
      update({
        data: { ids, status: status as "active" | "inactive" | "suspended" | "archived", reason },
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["platform"] });
      setOpen(false);
      onComplete();
    },
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Change status · {ids.length} selected
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!mutation.isPending) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bulk business update</DialogTitle>
            <DialogDescription>
              Update {ids.length} businesses in one transaction. Every business change receives an
              audit record.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <label className="block text-sm">
              New status
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {["active", "inactive", "suspended", "archived"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Reason
              <textarea
                required
                minLength={3}
                maxLength={1000}
                className="mt-1 min-h-20 w-full rounded-md border bg-background p-3"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {mutation.error ? (
              <p role="alert" className="text-destructive">
                {mutation.error.message}
              </p>
            ) : null}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Applying…" : "Confirm status change"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
