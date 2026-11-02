import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queueReportDelivery, saveReportSchedule } from "@/lib/reports/ecosystem.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
export function ReportDeliveryDialog({
  companyId,
  target,
  name,
  from,
  to,
  schedule: existing,
  onClose,
}: {
  companyId: string;
  target: { viewId: string } | { packId: string };
  name: string;
  from?: string;
  to?: string;
  schedule?: Record<string, unknown>;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    send = useServerFn(queueReportDelivery),
    schedule = useServerFn(saveReportSchedule);
  const [mode, setMode] = useState(existing ? "schedule" : "send");
  const [recipients, setRecipients] = useState(
    Array.isArray(existing?.["recipients"]) ? existing["recipients"].join(", ") : "",
  );
  const [subject, setSubject] = useState(String(existing?.["subject"] ?? name)),
    [message, setMessage] = useState(String(existing?.["message"] ?? ""));
  const [recurrence, setRecurrence] = useState(String(existing?.["recurrence"] ?? "monthly")),
    [period, setPeriod] = useState(String(existing?.["period"] ?? "previous_month"));
  const [timezone, setTimezone] = useState(
    String(existing?.["timezone"] ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [nextRun, setNextRun] = useState(
    existing?.["next_run_at"] ? String(existing["next_run_at"]) : "",
  );
  const [endAt, setEndAt] = useState(String(existing?.["end_at"] ?? ""));
  const [enabled, setEnabled] = useState(existing?.["enabled"] !== false);
  const mutation = useMutation({
    mutationFn: async () => {
      const people = [
        ...new Set(
          recipients
            .split(/[,;\n]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ];
      const payload = { ...target, recipients: people, subject, message };
      if (mode === "send") return send({ data: { companyId, payload: { ...payload, from, to } } });
      if (!nextRun)
        throw new Error("Enter the next run as an ISO timestamp including its UTC offset");
      return schedule({
        data: {
          companyId,
          payload: {
            ...payload,
            ...(existing ? { id: existing["id"], version: existing["version"] } : {}),
            recurrence,
            period,
            timezone,
            nextRunAt: new Date(nextRun).toISOString(),
            endAt: endAt ? new Date(endAt).toISOString() : null,
            enabled,
          },
        },
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["reporting-workspace", companyId] });
      toast.success(
        mode === "send"
          ? "Delivery queued; check delivery history for the provider result"
          : "Schedule saved",
      );
      onClose();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit report schedule" : `Deliver “${name}”`}</DialogTitle>
          <DialogDescription>
            Recipients must be authorized to receive this company's financial information. A queued
            or accepted request is distinct from confirmed delivery.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!existing && (
            <div className="space-y-1">
              <Label htmlFor="delivery-mode">Delivery</Label>
              <select
                id="delivery-mode"
                className="h-9 w-full rounded border bg-background"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="send">Send PDF now</option>
                <option value="schedule">Recurring PDF delivery</option>
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="delivery-to">Authorized recipients</Label>
            <Textarea
              id="delivery-to"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="name@company.com, other@company.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="delivery-subject">Subject</Label>
            <Input
              id="delivery-subject"
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="delivery-message">Message</Label>
            <Textarea
              id="delivery-message"
              maxLength={10000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {mode === "schedule" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="delivery-recurrence">Recurrence</Label>
                  <select
                    id="delivery-recurrence"
                    className="h-9 w-full rounded border bg-background"
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                  >
                    {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                    {["daily", "weekly", "monthly", "quarterly", "yearly"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="delivery-period">Period for saved reports</Label>
                  <select
                    id="delivery-period"
                    className="h-9 w-full rounded border bg-background"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="previous_month">Previous month</option>
                    <option value="previous_quarter">Previous quarter</option>
                    <option value="year_to_date">Calendar year to date</option>
                    <option value="financial_year_to_date">Financial year to date</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="delivery-timezone">IANA timezone</Label>
                <Input
                  id="delivery-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="delivery-next">Next run (ISO date/time with offset)</Label>
                <Input
                  id="delivery-next"
                  value={nextRun}
                  onChange={(e) => setNextRun(e.target.value)}
                  placeholder="2026-11-03T09:00:00+05:30"
                />
              </div>
              <div>
                <Label htmlFor="delivery-end">End date/time (optional)</Label>
                <Input
                  id="delivery-end"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  placeholder="2027-11-03T09:00:00+05:30"
                />
              </div>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Enabled
              </label>
              <p className="text-xs text-muted-foreground">
                Published packs retain their approved snapshot. Saved-report schedules calculate
                their selected relative period at each run. Delivery requires a verified sender and
                a configured email service.
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !recipients.trim() || !subject.trim()}
            onClick={() => mutation.mutate()}
          >
            {mode === "send" ? "Queue PDF delivery" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
