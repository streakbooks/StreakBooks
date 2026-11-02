import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type PlatformJob = { id: string; name: string; status: "queued" | "succeeded" | "failed" };

export function jobConsole(input: {
  role: PlatformRoleName;
  jobs: readonly PlatformJob[] | null;
}): {
  status: "unrecorded" | "recorded";
  jobs: readonly PlatformJob[];
} {
  if (!platformRoleAllows(input.role, "monitoring.view")) {
    throw new Error("Platform permission required");
  }
  if (input.jobs === null) return { status: "unrecorded", jobs: [] };
  return { status: "recorded", jobs: input.jobs };
}

export function enqueueJob(input: { role: PlatformRoleName; name: string; reason: string }): {
  status: "queued";
  executed: false;
  name: string;
  audit: { action: "job.enqueue"; reason: string };
} {
  if (!platformRoleAllows(input.role, "settings.manage")) {
    throw new Error("Platform permission required");
  }
  const name = input.name.trim();
  const reason = input.reason.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Name the job");
  if (reason.length < 3) throw new Error("A reason is required");
  return { status: "queued", executed: false, name, audit: { action: "job.enqueue", reason } };
}
