import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

function assertManager(
  role: PlatformRoleName,
  reason: string,
  name: string,
): { name: string; reason: string } {
  if (!platformRoleAllows(role, "businesses.manage")) {
    throw new Error("Platform permission required");
  }
  const cleanName = name.trim();
  const cleanReason = reason.trim();
  if (cleanName.length < 2 || cleanName.length > 80) throw new Error("Name the segment");
  if (cleanReason.length < 3) throw new Error("A reason is required");
  return { name: cleanName, reason: cleanReason };
}

export function createSegment(input: { role: PlatformRoleName; name: string; reason: string }): {
  stored: false;
  name: string;
  audit: { action: "segment.create"; reason: string };
} {
  const clean = assertManager(input.role, input.reason, input.name);
  return {
    stored: false,
    name: clean.name,
    audit: { action: "segment.create", reason: clean.reason },
  };
}

export function tagCompany(input: {
  role: PlatformRoleName;
  segmentName: string;
  companyId: string;
  reason: string;
}): { stored: false; companyId: string; audit: { action: "segment.tag"; reason: string } } {
  const clean = assertManager(input.role, input.reason, input.segmentName);
  if (input.companyId.trim().length === 0) throw new Error("Choose a business");
  return {
    stored: false,
    companyId: input.companyId.trim(),
    audit: { action: "segment.tag", reason: clean.reason },
  };
}
