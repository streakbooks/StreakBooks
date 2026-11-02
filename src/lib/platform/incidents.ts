import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export function openIncident(input: { role: PlatformRoleName; title: string; reason: string }): {
  status: "open";
  deleted: false;
  title: string;
  audit: { action: "incident.open"; reason: string };
} {
  if (!platformRoleAllows(input.role, "support.manage"))
    throw new Error("Platform permission required");
  const title = input.title.trim();
  const reason = input.reason.trim();
  if (title.length < 3) throw new Error("Name the incident");
  if (reason.length < 3) throw new Error("A reason is required");
  return { status: "open", deleted: false, title, audit: { action: "incident.open", reason } };
}

export function resolveIncident(input: {
  role: PlatformRoleName;
  status: "open" | "resolved";
  reason: string;
}): {
  status: "resolved";
  deleted: false;
  audit: { action: "incident.resolve"; reason: string };
} {
  if (!platformRoleAllows(input.role, "support.manage"))
    throw new Error("Platform permission required");
  if (input.status !== "open") throw new Error("That incident is no longer open");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return { status: "resolved", deleted: false, audit: { action: "incident.resolve", reason } };
}

export function recordRelease(input: {
  role: PlatformRoleName;
  version: string;
  reason: string;
  recordedVersions?: readonly string[];
}): {
  recorded: false;
  deployed: false;
  version: string;
  audit: { action: "release.record"; reason: string };
} {
  if (!platformRoleAllows(input.role, "settings.manage"))
    throw new Error("Platform permission required");
  const version = input.version.trim();
  const reason = input.reason.trim();
  if (!VERSION.test(version)) throw new Error("Use a numeric version");
  if (reason.length < 3) throw new Error("A reason is required");
  if ((input.recordedVersions ?? []).includes(version)) {
    throw new Error("That version is already recorded");
  }
  return { recorded: false, deployed: false, version, audit: { action: "release.record", reason } };
}
