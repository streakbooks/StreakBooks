/** Invitation links must be built from an operator-configured public origin. */
export function configuredInvitationOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/") return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function firmInvitePath(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid invitation token");
  return "/firm-invite/" + token;
}
