/** Platform changes require an authenticator assurance level of aal2. */
export function stepUpAllows(aal: string | null | undefined): boolean {
  return aal === "aal2";
}

export function assertStepUp(aal: string | null | undefined): void {
  if (!stepUpAllows(aal)) {
    throw new Error("Platform permission and an active MFA session are required");
  }
}
