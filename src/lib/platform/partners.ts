import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function registerPartner(input: {
  role: PlatformRoleName;
  name: string;
  reason: string;
  revenueShareMinor: number | null;
  exists?: boolean;
}): {
  stored: false;
  planCreated: false;
  name: string;
  revenueShareMinor: number | null;
  audit: { action: "partner.register"; reason: string };
} {
  if (!platformRoleAllows(input.role, "firms.manage"))
    throw new Error("Platform permission required");
  const name = input.name.trim();
  const reason = input.reason.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Name the partner");
  if (reason.length < 3) throw new Error("A reason is required");
  if (input.exists) throw new Error("That partner already exists");
  if (
    input.revenueShareMinor !== null &&
    (!Number.isInteger(input.revenueShareMinor) || input.revenueShareMinor < 0)
  ) {
    throw new Error("Revenue share must be a whole number of minor units");
  }
  return {
    stored: false,
    planCreated: false,
    name,
    revenueShareMinor: input.revenueShareMinor,
    audit: { action: "partner.register", reason },
  };
}
