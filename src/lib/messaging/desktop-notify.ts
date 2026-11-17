/**
 * Desktop Notification helper for messaging.
 * Fail-closed: only fires when permission is granted and the document is hidden.
 */

import { getMessagingPushPermissionState } from "@/lib/messaging/push-permission";

export type MessagingDesktopNotifyInput = {
  title: string;
  body: string;
  tag?: string;
  /** Relative app path opened when the notification is clicked. */
  href?: string;
};

export function shouldShowMessagingDesktopNotification(
  opts: {
    permission?: ReturnType<typeof getMessagingPushPermissionState>;
    documentHidden?: boolean;
    pushEnabled?: boolean;
  } = {},
): boolean {
  const permission = opts.permission ?? getMessagingPushPermissionState();
  if (permission !== "granted") return false;
  if (opts.pushEnabled === false) return false;
  const hidden =
    typeof opts.documentHidden === "boolean"
      ? opts.documentHidden
      : typeof document !== "undefined"
        ? document.hidden
        : true;
  return hidden;
}

export function showMessagingDesktopNotification(
  input: MessagingDesktopNotifyInput,
  opts: {
    permission?: ReturnType<typeof getMessagingPushPermissionState>;
    documentHidden?: boolean;
    pushEnabled?: boolean;
  } = {},
): boolean {
  if (!shouldShowMessagingDesktopNotification(opts)) return false;
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;

  try {
    const notification = new Notification(input.title.slice(0, 80), {
      body: input.body.slice(0, 180),
      tag: input.tag ?? "linkbooks-messaging",
      silent: false,
    });
    if (input.href) {
      notification.onclick = () => {
        try {
          window.focus();
          if (input.href!.startsWith("/")) {
            window.location.assign(input.href!);
          }
        } catch {
          /* ignore navigation errors */
        }
        notification.close();
      };
    }
    return true;
  } catch {
    return false;
  }
}
