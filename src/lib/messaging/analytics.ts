/**
 * Authorised messaging analytics helpers (Phase 7).
 * Avoids monitoring private HR/payroll bodies beyond disclosed business metrics.
 */
export type MessagingVolumePoint = {
  day: string;
  conversationCount: number;
  messageCount: number;
};

export function summariseMessagingVolume(
  rows: Array<{ created_at: string; conversation_id: string }>,
): MessagingVolumePoint[] {
  const byDay = new Map<string, { conversations: Set<string>; messages: number }>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    const bucket = byDay.get(day) ?? { conversations: new Set<string>(), messages: 0 };
    bucket.conversations.add(row.conversation_id);
    bucket.messages += 1;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({
      day,
      conversationCount: value.conversations.size,
      messageCount: value.messages,
    }));
}

export function averageFirstResponseMinutes(
  pairs: Array<{ firstCustomerAt: string; firstStaffAt: string | null }>,
): number | null {
  const samples = pairs
    .map((pair) => {
      if (!pair.firstStaffAt) return null;
      const start = Date.parse(pair.firstCustomerAt);
      const end = Date.parse(pair.firstStaffAt);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return (end - start) / 60_000;
    })
    .filter((value): value is number => value !== null);
  if (!samples.length) return null;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}
