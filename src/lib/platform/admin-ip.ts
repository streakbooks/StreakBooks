export type AdminIpDecision = {
  status: "unconfigured" | "allowed" | "denied";
  allowed: boolean;
};

/** An empty allowlist is unconfigured and stays closed. */
export function adminIpDecision(
  clientIp: string | null | undefined,
  allowlist: readonly string[],
): AdminIpDecision {
  const allowedIps = allowlist.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (allowedIps.length === 0) return { status: "unconfigured", allowed: false };
  const candidate = clientIp?.trim() ?? "";
  if (candidate.length > 0 && allowedIps.includes(candidate)) {
    return { status: "allowed", allowed: true };
  }
  return { status: "denied", allowed: false };
}
