import type { IdempotencyDecision } from "@/lib/app-store/engine/types";

/**
 * Prevent duplicate financial postings when a provider resends an event.
 * Keys should include company, connection, domain and stable external id.
 */
export function buildIdempotencyKey(parts: {
  companyId: string;
  connectionId: string;
  domain: string;
  externalId: string;
  operation?: string;
}): string {
  const op = parts.operation ?? "upsert";
  return [parts.companyId, parts.connectionId, parts.domain, parts.externalId, op].join(":");
}

export function decideIdempotency(input: {
  seenKeys: ReadonlySet<string>;
  key: string;
  alreadyPosted: boolean;
}): IdempotencyDecision {
  if (input.alreadyPosted) {
    return { action: "skip", reason: "already_posted" };
  }
  if (input.seenKeys.has(input.key)) {
    return { action: "skip", reason: "duplicate" };
  }
  return { action: "process", reason: "new" };
}
