import type { SalesClient } from "@/lib/sales/rpc";
import {
  notificationsConfigSchema,
  type SettingsCategory,
} from "@/lib/settings/registry";
import { emailWithVerifiedSender } from "@/lib/notifications/communication-rules";

export type CommunicationConfig = ReturnType<typeof notificationsConfigSchema.parse>;

/** Read the same saved settings document that Settings Centre edits. */
export async function loadCommunicationConfig(db: SalesClient, companyId: string): Promise<CommunicationConfig> {
  const { data, error } = await db
    .from("organisation_config" as never)
    .select("document" as never)
    .eq("company_id" as never, companyId as never)
    .eq("category" as never, "notifications" as SettingsCategory as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const stored = (data as { document?: unknown } | null)?.document ?? {};
  const result = notificationsConfigSchema.safeParse(stored);
  if (!result.success) throw new Error("Saved notification settings are invalid. Review Settings → Notifications.");
  return result.data;
}

export function configuredSender(
  verifiedFrom: string,
  config: CommunicationConfig,
): { from: string; replyTo: string | undefined } {
  return {
    // Only the *name* is editable; the email address always comes from the server-verified EMAIL_FROM.
    from: emailWithVerifiedSender(verifiedFrom, config.email_from_name),
    replyTo: config.reply_to || undefined,
  };
}
