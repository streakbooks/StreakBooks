/**
 * Server-only e-mail transport. The only provider is Resend, and only when BOTH
 * RESEND_API_KEY and EMAIL_FROM are set in the server environment. With either missing the
 * app reports "not configured" and sends nothing. Secrets never leave the server.
 */

export type EmailConfig =
  | { configured: true; provider: "resend"; from: string; apiKey: string }
  | { configured: false; missing: string[] };

export function readEmailConfig(
  env: Record<string, string | undefined> = process.env,
): EmailConfig {
  const apiKey = (env["RESEND_API_KEY"] ?? "").trim();
  const from = (env["EMAIL_FROM"] ?? "").trim();
  const missing = [...(apiKey ? [] : ["RESEND_API_KEY"]), ...(from ? [] : ["EMAIL_FROM"])];
  if (missing.length) return { configured: false, missing };
  return { configured: true, provider: "resend", from, apiKey };
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

export async function sendViaResend(
  config: Extract<EmailConfig, { configured: true }>,
  message: {
    to: string[];
    subject: string;
    html: string;
    text: string;
    replyTo?: string | null;
    attachments?: Array<{ filename: string; content: string }>;
    idempotencyKey?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.attachments ? { attachments: message.attachments } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: (body.message || body.name || `Provider error (HTTP ${res.status})`).slice(0, 300),
      };
    }
    return { ok: true, messageId: body.id ?? null };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "Could not reach the e-mail provider",
    };
  }
}

/** Query the transport provider for sender-domain readiness; never expose the API token to clients. */
export async function checkResendDomain(
  config: Extract<EmailConfig, { configured: true }>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ state: "verified" | "unverified" | "unknown"; domain: string; detail: string }> {
  const address = /<([^<>]+)>\s*$/.exec(config.from)?.[1] ?? config.from;
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return { state: "unknown", domain: "", detail: "Invalid server EMAIL_FROM address" };
  try {
    const res = await fetchImpl("https://api.resend.com/domains", {
      method: "GET",
      signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!res.ok)
      return {
        state: "unknown",
        domain,
        detail: "Provider could not verify domain status. Check Resend domain access and DNS.",
      };
    const body = (await res.json()) as {
      data?: Array<{ name: string; status: string }>;
      has_more?: boolean;
    };
    const match = body.data?.find((item) => item.name.toLowerCase() === domain);
    if (match?.status === "verified")
      return { state: "verified", domain, detail: "Sender domain verified by Resend" };
    if (match)
      return { state: "unverified", domain, detail: `Resend domain status: ${match.status}` };
    return {
      state: "unknown",
      domain,
      detail:
        "Sender domain not present in the returned Resend domain page; verify it in the provider dashboard.",
    };
  } catch {
    return { state: "unknown", domain, detail: "Unable to reach Resend for DNS verification" };
  }
}
