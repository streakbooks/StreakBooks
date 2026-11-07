/**
 * Derive integration exceptions from durable sync jobs.
 * Never fabricates exception rows — empty until a real connector fails.
 */

export type SyncJobExceptionSource = {
  id: string;
  appCode: string;
  status: string;
  failed: number;
  retryCount: number;
  lastError: string | null;
  correlationId: string;
  createdAt: string;
};

export type IntegrationException = {
  id: string;
  appCode: string;
  severity: "error" | "warning";
  status: string;
  summary: string;
  correlationId: string;
  failedCount: number;
  retryCount: number;
  createdAt: string;
};

const EXCEPTION_STATUSES = new Set(["failed", "partial", "dead_letter"]);

export function isExceptionJob(job: SyncJobExceptionSource): boolean {
  if (EXCEPTION_STATUSES.has(job.status)) return true;
  return job.failed > 0;
}

export function deriveIntegrationExceptions(
  jobs: readonly SyncJobExceptionSource[],
): IntegrationException[] {
  return jobs.filter(isExceptionJob).map((job) => ({
    id: job.id,
    appCode: job.appCode,
    severity: job.status === "dead_letter" || job.failed > 0 ? "error" : "warning",
    status: job.status,
    summary: job.lastError?.trim() || `Sync job ${job.status} with ${job.failed} failed record(s).`,
    correlationId: job.correlationId,
    failedCount: job.failed,
    retryCount: job.retryCount,
    createdAt: job.createdAt,
  }));
}
