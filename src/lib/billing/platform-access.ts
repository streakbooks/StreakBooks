export type PlatformRole = "platform_owner" | "platform_finance" | "platform_support";

export function mayBootstrapPlatformOwner(
  signedInEmail: string,
  configuredEmail: string | undefined,
  existingOwnerCount: number,
): boolean {
  const expected = (configuredEmail ?? "").trim().toLowerCase();
  const actual = signedInEmail.trim().toLowerCase();
  return expected.length > 0 && actual === expected && existingOwnerCount === 0;
}

export function canEditPlatformPrices(
  role: PlatformRole | null,
  approvalRequired: boolean,
): boolean {
  if (role === "platform_owner") return true;
  return role === "platform_finance" && !approvalRequired;
}

export function canSubmitPlatformDraft(role: PlatformRole | null): boolean {
  return role === "platform_owner" || role === "platform_finance";
}

export function canRefund(role: PlatformRole | null): boolean {
  return role === "platform_owner" || role === "platform_finance";
}

/** Organisation roles never pass. */
export function isOrganisationRole(role: string | null): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "accountant" ||
    role === "bookkeeper" ||
    role === "staff" ||
    role === "read_only"
  );
}
