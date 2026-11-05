import { getRequestHeader } from "@tanstack/react-start/server";

/** Keyed hash of the client address; without a configured secret nothing is stored. */
export async function clientAddressHash(): Promise<string | null> {
  const secret = (process.env["BILLING_IP_HASH_SECRET"] ?? "").trim();
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || getRequestHeader("x-real-ip")?.trim();
  if (!secret || !address) return null;
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(address).digest("hex");
}
