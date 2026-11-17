/** Retention helpers. Deletion jobs stay fail-closed until explicitly scheduled. */

export function isValidMessagingRetentionDays(value: number | null): boolean {
  if (value == null) return true;
  return Number.isInteger(value) && value >= 30 && value <= 3650;
}

export function resolveMessagingRetentionPurgeMode(input?: {
  execute?: boolean;
  envExecuteFlag?: string | undefined;
}): "dry_run" | "execute" {
  const executeRequested = Boolean(input?.execute);
  const executeAllowed =
    (input?.envExecuteFlag ?? process.env["MESSAGING_RETENTION_PURGE_EXECUTE"]) === "1";
  return executeRequested && executeAllowed ? "execute" : "dry_run";
}

export function messagingRetentionLabel(days: number | null): string {
  if (days == null) return "Keep indefinitely (manual purge only)";
  return `Retain for ${days} days`;
}

export function messagesPastRetention(input: {
  createdAt: string;
  retentionDays: number | null;
  now?: Date;
}): boolean {
  if (input.retentionDays == null) return false;
  const created = Date.parse(input.createdAt);
  if (!Number.isFinite(created)) return false;
  const now = input.now ?? new Date();
  const ageDays = (now.getTime() - created) / 86_400_000;
  return ageDays > input.retentionDays;
}
