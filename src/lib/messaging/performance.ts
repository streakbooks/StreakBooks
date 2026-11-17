/**
 * Messaging performance budgets (Phase 8).
 * Used for local/CI assertions; live measurement still required on staging.
 */

export const MESSAGING_LATENCY_BUDGETS_MS = {
  inboxListMs: 800,
  threadLoadMs: 1_200,
  sendAckMs: 1_500,
  attachmentRegisterMs: 2_000,
} as const;

export const MESSAGING_SIZE_BUDGETS = {
  maxMessagesPerThreadFetch: 200,
  maxConversationsPerInboxFetch: 100,
} as const;

export type MessagingLatencySample = {
  operation: keyof typeof MESSAGING_LATENCY_BUDGETS_MS;
  elapsedMs: number;
};

export function isWithinMessagingLatencyBudget(sample: MessagingLatencySample): boolean {
  return sample.elapsedMs <= MESSAGING_LATENCY_BUDGETS_MS[sample.operation];
}

export function isWithinMessagingSizeBudget(
  operation: keyof typeof MESSAGING_SIZE_BUDGETS,
  count: number,
): boolean {
  return count <= MESSAGING_SIZE_BUDGETS[operation];
}

export function summariseMessagingLatencyBreaches(
  samples: MessagingLatencySample[],
): MessagingLatencySample[] {
  return samples.filter((sample) => !isWithinMessagingLatencyBudget(sample));
}
