import { readEmailConfig, sendViaResend } from "@/lib/documents/email-provider.server";

export type BillingNoticeResult =
  | { sent: true }
  | { sent: false; reason: "not_configured"; missing: string[] }
  | { sent: false; reason: "no_recipient" }
  | { sent: false; reason: string };

/** Sends a billing notice when Resend is configured. Otherwise reports that it was not sent. */
export async function sendBillingNotice(input: {
  to: string | null;
  subject: string;
  text: string;
}): Promise<BillingNoticeResult> {
  const config = readEmailConfig();
  if (!config.configured) return { sent: false, reason: "not_configured", missing: config.missing };
  if (!input.to) return { sent: false, reason: "no_recipient" };
  const result = await sendViaResend(config, {
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: `<p>${input.text}</p>`,
  });
  return result.ok ? { sent: true } : { sent: false, reason: result.error };
}
