import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function openServiceCase(input: {
  role: PlatformRoleName;
  companyId: string;
  subject: string;
  reason: string;
  alreadyOpen?: boolean;
}): {
  status: "open";
  ledgerAttached: false;
  subject: string;
  audit: { action: "service_case.open"; reason: string };
} {
  if (!platformRoleAllows(input.role, "support.manage"))
    throw new Error("Platform permission required");
  const subject = input.subject.trim();
  const reason = input.reason.trim();
  if (input.companyId.trim().length === 0) throw new Error("Choose a business");
  if (subject.length < 3) throw new Error("Name the case");
  if (reason.length < 3) throw new Error("A reason is required");
  if (input.alreadyOpen) throw new Error("That case is already open");
  return {
    status: "open",
    ledgerAttached: false,
    subject,
    audit: { action: "service_case.open", reason },
  };
}

export function closeServiceCase(input: {
  role: PlatformRoleName;
  status: "open" | "closed";
  reason: string;
}): {
  status: "closed";
  ledgerAttached: false;
  deleted: false;
  audit: { action: "service_case.close"; reason: string };
} {
  if (!platformRoleAllows(input.role, "support.manage"))
    throw new Error("Platform permission required");
  if (input.status !== "open") throw new Error("That case is no longer open");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    status: "closed",
    ledgerAttached: false,
    deleted: false,
    audit: { action: "service_case.close", reason },
  };
}
