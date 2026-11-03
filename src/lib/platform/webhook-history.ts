import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type WebhookDelivery = {
  id: string;
  provider: "stripe" | "razorpay";
  eventId: string;
  status: "delivered" | "failed";
  at: string;
};

export function webhookDeliveryHistory(input: {
  role: PlatformRoleName;
  rows: readonly WebhookDelivery[] | null;
}): {
  status: "unrecorded" | "recorded";
  failed: number | null;
  rows: readonly WebhookDelivery[];
} {
  if (!platformRoleAllows(input.role, "integrations.view")) {
    throw new Error("Platform permission required");
  }
  if (input.rows === null) return { status: "unrecorded", failed: null, rows: [] };
  return {
    status: "recorded",
    failed: input.rows.filter((row) => row.status === "failed").length,
    rows: input.rows,
  };
}
