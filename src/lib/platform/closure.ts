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
  isDemo?: boolean;
  pending?: boolean;
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
  if (input.companyId.trim().length === 0 || input.isDemo) {
    throw new Error("That business cannot be closed");
  }
  if (input.pending) throw new Error("That business already has a pending closure");
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
  isDemo?: boolean;
  alreadyClosed?: boolean;
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
  if (input.decision === "archived" && input.isDemo) {
    throw new Error("That business cannot be closed");
  }
  if (input.decision === "archived" && input.alreadyClosed) {
    throw new Error("That business is already closed");
  }
  return {
    request: { ...input.request, approverId: input.approverId, status: input.decision },
    deleted: false,
    audit: { action: "closure.decide", reason },
  };
}
