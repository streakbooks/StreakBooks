import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type PromotionRequest = {
  sourceId: string;
  targetId: string;
  requesterId: string;
  status: "pending" | "approved" | "rejected";
};

export function requestPromotion(input: {
  role: PlatformRoleName;
  sourceId: string;
  targetId: string;
  requesterId: string;
  reason: string;
}): {
  request: PromotionRequest;
  copied: false;
  audit: { action: "promotion.request"; reason: string };
} {
  if (!platformRoleAllows(input.role, "settings.manage"))
    throw new Error("Platform permission required");
  const reason = input.reason.trim();
  if (input.sourceId.trim() === input.targetId.trim()) throw new Error("Choose two businesses");
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    request: {
      sourceId: input.sourceId.trim(),
      targetId: input.targetId.trim(),
      requesterId: input.requesterId,
      status: "pending",
    },
    copied: false,
    audit: { action: "promotion.request", reason },
  };
}

export function decidePromotion(input: {
  role: PlatformRoleName;
  request: PromotionRequest;
  approverId: string;
  decision: "approved" | "rejected";
  reason: string;
}): {
  request: PromotionRequest;
  copied: false;
  audit: { action: "promotion.decide"; reason: string };
} {
  if (!platformRoleAllows(input.role, "settings.manage"))
    throw new Error("Platform permission required");
  if (input.request.status !== "pending") throw new Error("That promotion is no longer pending");
  if (input.approverId === input.request.requesterId)
    throw new Error("A second person must decide this request");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    request: { ...input.request, status: input.decision },
    copied: false,
    audit: { action: "promotion.decide", reason },
  };
}
