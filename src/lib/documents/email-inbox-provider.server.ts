/** Server-side Resend Receiving transport. Never import in client-side code. */
export type ReceiveConfig =
  | { configured: false; missing: string[] }
  | { configured: true; provider: "resend"; apiKey: string; domain: string };

export function readReceiveConfig(
  env: Record<string, string | undefined> = process.env,
): ReceiveConfig {
  const apiKey = (env["RESEND_INBOUND_API_KEY"] ?? "").trim();
  const domain = (env["RESEND_RECEIVING_DOMAIN"] ?? "").trim().toLowerCase();
  const missing = [
    ...(apiKey ? [] : ["RESEND_INBOUND_API_KEY"]),
    ...(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) && domain.includes(".")
      ? []
      : ["RESEND_RECEIVING_DOMAIN"]),
  ];
  if (missing.length) return { configured: false, missing };
  return { configured: true, provider: "resend", apiKey, domain };
}

export function inboxAddress(token: string, domain: string): string {
  if (!/^docs-[0-9a-f]{32}$/.test(token)) throw new Error("Invalid company inbox token");
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) || !domain.includes("."))
    throw new Error("Invalid receiving domain");
  return `${token}@${domain}`;
}

export function normaliseRecipient(input: string): string {
  const text = input.trim();
  const email = /<([^<>]+)>$/.exec(text)?.[1] ?? text;
  return email.trim().toLowerCase();
}

export type ReceivedEmail = {
  id: string;
  to: string[];
  from: string;
  subject: string | null;
  created_at: string;
};

export function isForCompanyInbox(email: Pick<ReceivedEmail, "to">, address: string): boolean {
  return email.to.some((recipient) => normaliseRecipient(recipient) === address.toLowerCase());
}

export type ReceivedFile = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  download_url: string;
};

async function resendGet<T>(
  path: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(`https://api.resend.com${path}`, {
    method: "GET",
    signal: AbortSignal.timeout(14000),
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Email provider rate limit reached. Retry later."
        : "Email provider request failed. Check server configuration and provider status.",
    );
  return (await response.json()) as T;
}

export async function listReceivedEmails(
  config: Extract<ReceiveConfig, { configured: true }>,
  after?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: ReceivedEmail[]; has_more: boolean }> {
  const params = new URLSearchParams({ limit: "50" });
  if (after) params.set("after", after);
  const response = await resendGet<{
    data?: ReceivedEmail[];
    has_more?: boolean;
  }>(`/emails/receiving?${params.toString()}`, config.apiKey, fetchImpl);
  return { data: response.data ?? [], has_more: response.has_more === true };
}

export async function getReceivedEmail(
  config: Extract<ReceiveConfig, { configured: true }>,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReceivedEmail> {
  return resendGet<ReceivedEmail>(
    `/emails/receiving/${encodeURIComponent(id)}`,
    config.apiKey,
    fetchImpl,
  );
}

export async function listReceivedAttachments(
  config: Extract<ReceiveConfig, { configured: true }>,
  emailId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: ReceivedFile[]; has_more: boolean }> {
  const response = await resendGet<{ data?: ReceivedFile[]; has_more?: boolean }>(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`,
    config.apiKey,
    fetchImpl,
  );
  return { data: response.data ?? [], has_more: response.has_more === true };
}

export function isTrustedReceivedFileUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname.endsWith(".resend.com") ||
      hostname === "resend.com" ||
      hostname.endsWith(".amazonaws.com") ||
      hostname.endsWith(".cloudfront.net")
    );
  } catch {
    return false;
  }
}

/** Never follow redirects or buffer an unbounded attachment. */
export async function downloadReceivedFile(
  url: string,
  maxBytes: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  if (!isTrustedReceivedFileUrl(url)) throw new Error("Untrusted email attachment URL");
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok || !response.body) throw new Error("Email attachment download failed");
  const advertisedSize = Number(response.headers.get("content-length") ?? 0);
  if (advertisedSize > maxBytes) throw new Error("Email attachment is too large");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error("Email attachment is too large");
      chunks.push(chunk);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!total) throw new Error("Empty email attachment");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
