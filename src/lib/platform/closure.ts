import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type ClosureRequest = {
  companyId: string;
  requesterId: string;
  approverId: string | null;
  status: "pending" | "archived" | "rejected";
};

export function requestClosure(input: {
  role: PlatformRoleName;
  companyId: string;
  requesterId: string;
  reason: string;
}): {
  request: ClosureRequest;
  deleted: false;
  audit: { action: "closure.request"; reason: string };
} {
  if (!platformRoleAllows(input.role, "businesses.manage")) {
    throw new Error("Platform permission required");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    request: {
      companyId: input.companyId,
      requesterId: input.requesterId,
      approverId: null,
      status: "pending",
    },
    deleted: false,
    audit: { action: "closure.request", reason },
  };
}

export function decideClosure(input: {
  role: PlatformRoleName;
  request: ClosureRequest;
  approverId: string;
  decision: "archived" | "rejected";
  reason: string;
}): {
  request: ClosureRequest;
  deleted: false;
  audit: { action: "closure.decide"; reason: string };
} {
  if (!platformRoleAllows(input.role, "businesses.manage")) {
    throw new Error("Platform permission required");
  }
  const reason = input.reason.trim();
  if (input.request.status !== "pending")
    throw new Error("That closure request is no longer pending");
  if (input.approverId === input.request.requesterId) {
    throw new Error("A second person must decide this request");
  }
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    request: { ...input.request, approverId: input.approverId, status: input.decision },
    deleted: false,
    audit: { action: "closure.decide", reason },
  };
}
