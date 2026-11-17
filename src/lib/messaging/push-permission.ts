/**
 * Browser push/notification permission helper.
 * Fail-closed: never assumes grant; never sends payloads from this helper.
 */

export type MessagingPushPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function getMessagingPushPermissionState(): MessagingPushPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as MessagingPushPermissionState;
}

export async function requestMessagingPushPermission(): Promise<MessagingPushPermissionState> {
  const current = getMessagingPushPermissionState();
  if (current === "unsupported") return "unsupported";
  if (current !== "default") return current;
  try {
    const result = await Notification.requestPermission();
    return result as MessagingPushPermissionState;
  } catch {
    return "denied";
  }
}

export function messagingPushPermissionLabel(state: MessagingPushPermissionState): string {
  switch (state) {
    case "unsupported":
      return "Browser notifications unsupported";
    case "granted":
      return "Browser notifications allowed";
    case "denied":
      return "Browser notifications blocked";
    default:
      return "Browser notifications not decided";
  }
}
