import type { SyncJobSpec, SyncJobStatus } from "@/lib/app-store/engine/types";

const TERMINAL: ReadonlySet<SyncJobStatus> = new Set(["succeeded", "cancelled", "dead_letter"]);

export function canRetrySyncJob(
  job: Pick<SyncJobSpec, "status" | "retryCount">,
  maxRetries = 5,
): boolean {
  if (job.status !== "failed" && job.status !== "partial") return false;
  return job.retryCount < maxRetries;
}

export function canCancelSyncJob(job: Pick<SyncJobSpec, "status">): boolean {
  return job.status === "pending" || job.status === "running";
}

export function nextRetryDelayMs(retryCount: number, baseMs = 2_000, maxMs = 300_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, retryCount));
  const jitter = Math.floor(Math.random() * Math.min(1_000, exp * 0.1));
  return exp + jitter;
}

export function markDeadLetter(job: SyncJobSpec, maxRetries = 5): SyncJobSpec {
  if (job.retryCount >= maxRetries && (job.status === "failed" || job.status === "partial")) {
    return { ...job, status: "dead_letter" };
  }
  return job;
}

export function isTerminalSyncStatus(status: SyncJobStatus): boolean {
  return TERMINAL.has(status);
}
