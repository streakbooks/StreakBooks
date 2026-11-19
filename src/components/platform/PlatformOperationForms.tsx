import { useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { applyOps } from "@/lib/platform/operations.functions";
import {
  localDateInput,
  localDateToUtc,
  opsApplySchema,
  opsTitle,
} from "@/lib/platform/operations";
import type { OpsCommand, OpsModule, OpsRecord } from "@/lib/platform/operations";
import { viewerTimeZone } from "@/lib/platform/console-time";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlatformRecordLookup } from "./PlatformRecordLookup";
const human = (v: string) => v.replaceAll("_", " ");
export function OpsField({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
export function EnumField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <OpsField label={label}>
      {(id) => (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {/* lookup-fixed-enum: Operational status and severity values defined on the server. */}
          {options.map((v) => (
            <option key={v} value={v}>
              {human(v)}
            </option>
          ))}
        </select>
      )}
    </OpsField>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-md border border-destructive/40 p-4">
      <p>{friendlyAuthError(error)}</p>
      <Button variant="outline" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
export function OpsAction({
  command,
  payload,
  label,
  onSaved,
  children,
  disabled = false,
}: {
  command: OpsCommand;
  payload: Record<string, unknown>;
  label: string;
  onSaved?: (id: string) => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const apply = useServerFn(applyOps);
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof opsApplySchema.parse>[0]) =>
      apply({ data: opsApplySchema.parse(data) }),
    onSuccess: async (result) => {
      setReason("");
      setError(null);
      request.current = null;
      await cache.invalidateQueries({ queryKey: ["platform", "operations"] });
      onSaved?.(result.record.id);
    },
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError(null);
    try {
      const fingerprint = JSON.stringify({ command, payload, reason });
      if (request.current?.fingerprint !== fingerprint)
        request.current = { fingerprint, id: crypto.randomUUID() };
      const data = opsApplySchema.parse({
        command,
        payload,
        reason,
        requestId: request.current.id,
      });
      submitting.current = true;
      await mutation.mutateAsync(data);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      submitting.current = false;
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
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={1000}
              disabled={mutation.isPending}
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
      <Button type="submit" disabled={disabled || mutation.isPending}>
        {mutation.isPending ? "Saving…" : label}
      </Button>
      {mutation.isSuccess ? (
        <p role="status" className="text-sm">
          Saved to the audit history.
        </p>
      ) : null}
    </form>
  );
}
export function OpsEditor({
  module,
  record,
  company,
  onSaved,
}: {
  module: OpsModule;
  record?: OpsRecord;
  company?: string | undefined;
  onSaved: (id: string) => void;
}) {
  const [title, setTitle] = useState(record ? opsTitle(record) : "");
  const [description, setDescription] = useState(record?.description || record?.summary || "");
  const [business, setBusiness] = useState(record?.company_id || company || "");
  const [owner, setOwner] = useState(record?.owner_id || "");
  const [priority, setPriority] = useState(record?.priority || "normal");
  const [severity, setSeverity] = useState(record?.severity || "minor");
  const [phase, setPhase] = useState(
    record?.phase || (module === "cases" ? "triage" : "investigating"),
  );
  const [time, setTime] = useState(localDateInput(record?.due_at || record?.impact_started_at));
  const [version, setVersion] = useState(record?.version || "");
  let instant: string | null = null;
  let timeError: string | null = null;
  try {
    instant = localDateToUtc(time);
  } catch (e) {
    timeError = (e as Error).message;
  }
  const base = record ? { id: record.id, row_version: record.row_version } : {};
  const fields =
    module === "cases"
      ? {
          ...base,
          ...(!record ? { company_id: business } : {}),
          subject: title,
          description,
          priority,
          phase,
          owner_id: owner || null,
          due_at: instant,
        }
      : module === "incidents"
        ? {
            ...base,
            title,
            description,
            severity,
            phase,
            owner_id: owner || null,
            impact_started_at: instant,
          }
        : module === "segments"
          ? { ...base, name: title }
          : { ...base, ...(!record ? { version } : {}), title, summary: description };
  const command: OpsCommand =
    module === "segments"
      ? record
        ? "segments.rename"
        : "segments.create"
      : `${module}.${record ? "update" : "create"}`;
  return (
    <OpsAction
      command={command}
      payload={fields}
      label={record ? "Save details" : "Create record"}
      onSaved={onSaved}
      disabled={!!timeError}
    >
      <OpsField
        label={module === "cases" ? "Subject" : module === "segments" ? "Segment name" : "Title"}
      >
        {(id) => (
          <Input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={module === "segments" ? 80 : 160}
            minLength={module === "segments" ? 2 : 3}
          />
        )}
      </OpsField>
      {module === "cases" && !record ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Business</p>
          <PlatformRecordLookup kind="business" value={business} onChange={setBusiness} required />
        </div>
      ) : null}
      {module !== "segments" ? (
        <OpsField label={module === "releases" ? "Release notes" : "Description"}>
          {(id) => (
            <Textarea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={8000}
            />
          )}
        </OpsField>
      ) : null}
      {module === "cases" || module === "incidents" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {module === "cases" ? (
            <EnumField
              label="Priority"
              value={priority}
              options={["untriaged", "low", "normal", "high", "urgent"]}
              onChange={setPriority}
            />
          ) : (
            <EnumField
              label="Severity"
              value={severity}
              options={["unclassified", "minor", "major", "critical"]}
              onChange={setSeverity}
            />
          )}
          <EnumField
            label="Work phase"
            value={phase}
            options={
              module === "cases"
                ? ["triage", "in_progress", "waiting_customer"]
                : ["unknown", "investigating", "identified", "monitoring"]
            }
            onChange={setPhase}
          />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Owner</p>
            <PlatformRecordLookup
              kind="staff"
              value={owner}
              label={record?.owner_name || undefined}
              onChange={setOwner}
            />
          </div>
          <OpsField
            label={`${module === "cases" ? "Response deadline" : "Impact started"} (${viewerTimeZone()})`}
          >
            {(id) => (
              <Input
                id={id}
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
          </OpsField>
          {timeError ? <p role="alert">{timeError}</p> : null}
        </div>
      ) : null}
      {module === "releases" && !record ? (
        <OpsField label="Version (major.minor.patch)">
          {(id) => (
            <Input
              id={id}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              required
              pattern="[0-9]+\.[0-9]+\.[0-9]+"
              placeholder="1.0.0"
            />
          )}
        </OpsField>
      ) : null}
    </OpsAction>
  );
}
