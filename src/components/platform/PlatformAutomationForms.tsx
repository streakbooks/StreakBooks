import { useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { actAutomation } from "@/lib/platform/automation.functions";
import { automationActionSchema, alertMetrics, metricLabels } from "@/lib/platform/automation";
import type { AutomationCommand, AutomationRow } from "@/lib/platform/automation";
import { OpsField, EnumField } from "./PlatformOperationForms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
export function AutomationAction({
  command,
  payload,
  label,
  children,
  onSaved,
}: {
  command: AutomationCommand;
  payload: Record<string, unknown>;
  label: string;
  children?: ReactNode;
  onSaved?: () => void;
}) {
  const call = useServerFn(actAutomation);
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: (data: ReturnType<typeof automationActionSchema.parse>) => call({ data }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["platform", "automation"] });
      request.current = null;
      setReason("");
      onSaved?.();
    },
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    setError(null);
    try {
      const key = JSON.stringify({ command, payload, reason });
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      const data = automationActionSchema.parse({
        command,
        payload,
        reason,
        requestId: request.current.id,
      });
      busy.current = true;
      await mutation.mutateAsync(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      busy.current = false;
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <fieldset disabled={mutation.isPending} className="space-y-4">
        {children}
        <OpsField label="Reason for this action">
          {(id) => (
            <Textarea
              id={id}
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          )}
        </OpsField>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : label}
      </Button>
      {mutation.isSuccess ? (
        <p role="status" className="text-sm">
          Action recorded. Job completion is shown separately.
        </p>
      ) : null}
    </form>
  );
}
export function RuleEditor({
  record,
  onSaved,
}: {
  record?: AutomationRow | undefined;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name || "");
  const [metric, setMetric] = useState(record?.metric || "overdue_cases");
  const [severity, setSeverity] = useState(record?.severity || "warning");
  const [threshold, setThreshold] = useState(record?.threshold || "0");
  const [start, setStart] = useState(record?.quiet_start_utc?.toString() ?? "");
  const [end, setEnd] = useState(record?.quiet_end_utc?.toString() ?? "");
  return (
    <AutomationAction
      command="rules.save"
      payload={{
        id: record?.id ?? null,
        row_version: record?.row_version ?? null,
        name,
        metric,
        severity,
        threshold: threshold === "" ? null : Number(threshold),
        quiet_start_utc: start === "" ? null : Number(start),
        quiet_end_utc: end === "" ? null : Number(end),
      }}
      label={record ? "Save rule configuration" : "Create paused rule"}
      onSaved={onSaved}
    >
      <OpsField label="Rule name">
        {(id) => (
          <Input
            id={id}
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </OpsField>
      <OpsField label="Measured source">
        {(id) => (
          <select
            id={id}
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="h-10 w-full rounded border bg-background px-3"
          >
            {/* lookup-fixed-enum: Fixed measured operational metrics implemented in SQL. */}
            {alertMetrics.map((m) => (
              <option key={m} value={m}>
                {metricLabels[m]}
              </option>
            ))}
          </select>
        )}
      </OpsField>
      <p className="text-xs text-muted-foreground">
        Customer-case counts exclude demo businesses. A rule fires when the measured count is
        greater than its threshold. No observation stays unknown.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <OpsField label="Threshold (count)">
          {(id) => (
            <Input
              id={id}
              type="number"
              required
              min={0}
              max={2147483647}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          )}
        </OpsField>
        <EnumField
          label="Severity"
          value={severity}
          options={["info", "warning", "critical"]}
          onChange={setSeverity}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <OpsField label="Quiet hours start (UTC, 0–23)">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={23}
              step={1}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </OpsField>
        <OpsField label="Quiet hours end (UTC, 0–23)">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={23}
              step={1}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          )}
        </OpsField>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave both empty for continuous monitoring. Observations remain in the in-app history during
        quiet hours. External message delivery is not configured.
      </p>
    </AutomationAction>
  );
}
