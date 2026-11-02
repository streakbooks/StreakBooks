import { platformRoleAllows, type PlatformRoleName } from "@/lib/platform/platform-roles";

export function planWebhookDelivery(input: {
  role: PlatformRoleName;
  provider: string;
  eventId: string;
  status: "delivered" | "failed";
  reason: string;
}): {
  stored: false;
  bodyStored: false;
  provider: "stripe" | "razorpay";
  eventId: string;
  status: "delivered" | "failed";
  audit: { action: "webhook.delivery"; reason: string };
} {
  if (!platformRoleAllows(input.role, "integrations.manage")) {
    throw new Error("Platform permission required");
  }
  if (input.provider !== "stripe" && input.provider !== "razorpay") {
    throw new Error("Name the provider");
  }
  const eventId = input.eventId.trim();
  const reason = input.reason.trim();
  if (eventId.length < 1) throw new Error("Name the event");
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    stored: false,
    bodyStored: false,
    provider: input.provider,
    eventId,
    status: input.status,
    audit: { action: "webhook.delivery", reason },
  };
}
