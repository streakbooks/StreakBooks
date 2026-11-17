/** Client-side send pacing helper. Authoritative limit is enforced in messaging_send_message. */

export const MESSAGING_SEND_RATE = {
  maxPerMinute: 30,
  minIntervalMs: 250,
} as const;

export type MessagingSendPaceState = {
  timestamps: number[];
  lastSentAt: number | null;
};

export function createMessagingSendPaceState(): MessagingSendPaceState {
  return { timestamps: [], lastSentAt: null };
}

export function canSendMessagingNow(
  state: MessagingSendPaceState,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string; retryAfterMs: number } {
  if (state.lastSentAt != null && now - state.lastSentAt < MESSAGING_SEND_RATE.minIntervalMs) {
    return {
      ok: false,
      reason: "Please wait a moment before sending again.",
      retryAfterMs: MESSAGING_SEND_RATE.minIntervalMs - (now - state.lastSentAt),
    };
  }
  const windowStart = now - 60_000;
  const recent = state.timestamps.filter((ts) => ts >= windowStart);
  if (recent.length >= MESSAGING_SEND_RATE.maxPerMinute) {
    const oldest = recent[0] ?? now;
    return {
      ok: false,
      reason: "Rate limited: too many messages in one minute.",
      retryAfterMs: Math.max(0, oldest + 60_000 - now),
    };
  }
  return { ok: true };
}

export function recordMessagingSend(
  state: MessagingSendPaceState,
  now = Date.now(),
): MessagingSendPaceState {
  const windowStart = now - 60_000;
  return {
    timestamps: [...state.timestamps.filter((ts) => ts >= windowStart), now],
    lastSentAt: now,
  };
}
