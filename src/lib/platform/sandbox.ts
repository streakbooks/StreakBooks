import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function requestSandbox(input: { role: PlatformRoleName; name: string; reason: string }): {
  created: false;
  postingDiffers: false;
  name: string;
  audit: { action: "sandbox.request"; reason: string };
} {
  if (!platformRoleAllows(input.role, "businesses.manage"))
    throw new Error("Platform permission required");
  const name = input.name.trim();
  const reason = input.reason.trim();
  if (name.length < 2) throw new Error("Name the sandbox");
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    created: false,
    postingDiffers: false,
    name,
    audit: { action: "sandbox.request", reason },
  };
}
