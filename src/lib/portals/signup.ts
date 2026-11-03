export type PortalSignupOutcome =
  | { kind: "session" }
  | { kind: "confirm" }
  | { kind: "existing" }
  | { kind: "error"; message: string };

/**
 * Supabase hides existing emails when confirmation is on: the call succeeds,
 * the session is empty, and `identities` is an empty array. No email is sent.
 */
export function resolvePortalSignup(input: {
  errorMessage?: string | null;
  hasSession: boolean;
  identityCount: number | null;
}): PortalSignupOutcome {
  const message = input.errorMessage?.trim() ?? "";
  const lower = message.toLowerCase();
  if (
    lower.includes("already registered") ||
    lower.includes("already exists") ||
    lower.includes("already been registered")
  ) {
    return { kind: "existing" };
  }
  if (message) return { kind: "error", message };
  if (input.hasSession) return { kind: "session" };
  if (input.identityCount === 0) return { kind: "existing" };
  return { kind: "confirm" };
}
