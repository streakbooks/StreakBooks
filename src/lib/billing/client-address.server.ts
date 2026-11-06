import { getRequestHeader } from "@tanstack/react-start/server";

function header(name: string, headers?: Headers): string | undefined {
  if (headers) return headers.get(name) ?? undefined;
  try {
    return getRequestHeader(name);
  } catch {
    return undefined;
  }
}

/** Keyed hash of the client address; without a configured secret nothing is stored. */
export async function clientAddressHash(headers?: Headers): Promise<string | null> {
  const secret = (process.env["BILLING_IP_HASH_SECRET"] ?? "").trim();
  const forwarded = header("x-forwarded-for", headers)?.split(",")[0]?.trim();
  const address = forwarded || header("x-real-ip", headers)?.trim();
  if (!secret || !address) return null;
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(address).digest("hex");
}
