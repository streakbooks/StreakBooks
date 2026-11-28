/** Normalise an address for a Supabase email-change request, or return null. */
export function normalizeEmailChangeAddress(value: string): string | null {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
