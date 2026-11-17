/**
 * Production kill-switch for customer/vendor portal messaging.
 * Fail-closed: external portals stay off unless explicitly unlocked.
 */

export function messagingExternalPortalsUnlocked(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const raw = env["MESSAGING_EXTERNAL_PORTALS_ENABLED"];
  return raw === "1" || raw?.toLowerCase() === "true";
}

export function assertMessagingExternalPortalsAllowed(
  input: { allowCustomer?: boolean | null; allowVendor?: boolean | null },
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  const unlocking =
    input.allowCustomer === true || input.allowVendor === true;
  if (!unlocking) return;
  if (messagingExternalPortalsUnlocked(env)) return;
  throw new Error(
    "Customer/vendor portal messaging is locked until MESSAGING_EXTERNAL_PORTALS_ENABLED=1 after isolation E2E passes.",
  );
}
