import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function rotateApiKey(input: {
  role: PlatformRoleName;
  keyId: string | null;
  label: string;
  reason: string;
}): {
  status: "ready";
  retiredKeyId: string | null;
  replacementStored: false;
  secretStored: false;
  audit: { action: "api_key.rotate"; reason: string };
} {
  if (!platformRoleAllows(input.role, "api.manage")) {
    throw new Error("Platform permission required");
  }
  const reason = input.reason.trim();
  const label = input.label.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  if (label.length < 1) throw new Error("Name the replacement key");
  return {
    status: "ready",
    retiredKeyId: input.keyId?.trim() || null,
    replacementStored: false,
    secretStored: false,
    audit: { action: "api_key.rotate", reason },
  };
}
