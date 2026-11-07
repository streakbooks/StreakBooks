/**
 * Strict webhook payload validation before provider event processing.
 */

export type WebhookPayloadValidation =
  { ok: true; eventId: string; eventType: string } | { ok: false; reason: string };

const MAX_PAYLOAD_BYTES = 256 * 1024;

export function validateWebhookEnvelope(input: {
  rawBody: string;
  eventId: unknown;
  eventType: unknown;
  companyId: unknown;
  expectedCompanyId: string;
}): WebhookPayloadValidation {
  if (typeof input.rawBody !== "string" || input.rawBody.length === 0) {
    return { ok: false, reason: "empty_body" };
  }
  if (new TextEncoder().encode(input.rawBody).length > MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: "payload_too_large" };
  }
  if (typeof input.eventId !== "string" || !input.eventId.trim()) {
    return { ok: false, reason: "missing_event_id" };
  }
  if (typeof input.eventType !== "string" || !input.eventType.trim()) {
    return { ok: false, reason: "missing_event_type" };
  }
  if (typeof input.companyId !== "string" || input.companyId !== input.expectedCompanyId) {
    return { ok: false, reason: "company_mismatch" };
  }
  try {
    JSON.parse(input.rawBody);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  return {
    ok: true,
    eventId: input.eventId.trim(),
    eventType: input.eventType.trim(),
  };
}
