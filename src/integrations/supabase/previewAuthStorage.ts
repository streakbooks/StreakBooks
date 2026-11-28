// StreakBooks uses standard browser localStorage for Supabase auth sessions.

export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
