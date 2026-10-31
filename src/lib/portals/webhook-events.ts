/**
 * Turns a verified provider body into a portal settlement instruction.
 * Signature checks happen before this parser runs. Unknown events are ignored.
 */

export type PortalProviderEvent = {
  provider: "stripe" | "razorpay";
  providerEventId: string;
  eventType: "paid" | "failed" | "refunded" | "disputed" | "dispute_won" | "dispute_lost";
  intentId: string | null;
  providerPaymentId: string | null;
  amountMinor: number | null;
  currency: string | null;
  feeMinor: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function minor(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function intentIdFromNotes(notes: unknown): string | null {
  const record = asRecord(notes);
  const id = text(record?.["intent_id"] ?? record?.["intentId"]);
  return id && UUID_RE.test(id) ? id : null;
}

export function parseStripePortalEvent(raw: string): PortalProviderEvent | null {
  const body = asRecord(JSON.parse(raw) as unknown);
  if (!body) return null;
  const eventId = text(body["id"]);
  const type = text(body["type"]);
  const data = asRecord(body["data"]);
  const object = asRecord(data?.["object"]);
  if (!eventId || !type || !object) return null;

  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    const metadata = asRecord(object["metadata"]);
    if (text(metadata?.["purpose"]) !== "portal_invoice") return null;
    const intentId = text(metadata?.["intent_id"]);
    if (!intentId || !UUID_RE.test(intentId)) return null;
    const paid = text(object["payment_status"]) === "paid" || type.endsWith("succeeded");
    return {
      provider: "stripe",
      providerEventId: eventId,
      eventType: paid ? "paid" : "failed",
      intentId,
      providerPaymentId: text(object["payment_intent"]),
      amountMinor: minor(object["amount_total"]),
      currency: text(object["currency"])?.toUpperCase() ?? null,
      feeMinor: 0,
    };
  }

  if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
    const metadata = asRecord(object["metadata"]);
    if (text(metadata?.["purpose"]) !== "portal_invoice") return null;
    const intentId = text(metadata?.["intent_id"]);
    if (!intentId || !UUID_RE.test(intentId)) return null;
    return {
      provider: "stripe",
      providerEventId: eventId,
      eventType: "failed",
      intentId,
      providerPaymentId: text(object["payment_intent"]),
      amountMinor: minor(object["amount_total"]),
      currency: text(object["currency"])?.toUpperCase() ?? null,
      feeMinor: 0,
    };
  }

  if (type === "charge.refunded") {
    return {
      provider: "stripe",
      providerEventId: eventId,
      eventType: "refunded",
      intentId: intentIdFromNotes(object["metadata"]),
      providerPaymentId: text(object["payment_intent"]),
      amountMinor: minor(object["amount_refunded"]),
      currency: text(object["currency"])?.toUpperCase() ?? null,
      feeMinor: 0,
    };
  }

  if (type === "charge.dispute.created" || type === "charge.dispute.closed") {
    const status = text(object["status"]);
    const eventType =
      type === "charge.dispute.created"
        ? "disputed"
        : status === "won"
          ? "dispute_won"
          : status === "lost"
            ? "dispute_lost"
            : null;
    if (!eventType) return null;
    return {
      provider: "stripe",
      providerEventId: eventId,
      eventType,
      intentId: null,
      providerPaymentId: text(object["payment_intent"]),
      amountMinor: minor(object["amount"]),
      currency: text(object["currency"])?.toUpperCase() ?? null,
      feeMinor: 0,
    };
  }

  return null;
}

export function parseRazorpayPortalEvent(
  raw: string,
  eventIdHeader: string | null,
): PortalProviderEvent | null {
  const body = asRecord(JSON.parse(raw) as unknown);
  if (!body) return null;
  const event = text(body["event"]);
  const headerId = text(eventIdHeader);
  const payload = asRecord(body["payload"]);
  if (!event || !payload) return null;
  const payment = asRecord(asRecord(payload["payment"])?.["entity"]);
  const link = asRecord(asRecord(payload["payment_link"])?.["entity"]);
  const notes = payment?.["notes"] ?? link?.["notes"];
  const intentId = intentIdFromNotes(notes);
  const providerEventId = headerId ?? text(payment?.["id"]) ?? `${event}:${intentId ?? "unknown"}`;
  if (!intentId && event !== "refund.processed") return null;

  if (event === "payment_link.paid" || event === "payment.captured") {
    return {
      provider: "razorpay",
      providerEventId,
      eventType: "paid",
      intentId,
      providerPaymentId: text(payment?.["id"]),
      amountMinor: minor(payment?.["amount"]),
      currency: text(payment?.["currency"])?.toUpperCase() ?? null,
      feeMinor: minor(payment?.["fee"]) ?? 0,
    };
  }
  if (event === "payment.failed") {
    return {
      provider: "razorpay",
      providerEventId,
      eventType: "failed",
      intentId,
      providerPaymentId: text(payment?.["id"]),
      amountMinor: minor(payment?.["amount"]),
      currency: text(payment?.["currency"])?.toUpperCase() ?? null,
      feeMinor: 0,
    };
  }
  if (event === "refund.processed") {
    const refund = asRecord(asRecord(payload["refund"])?.["entity"]);
    return {
      provider: "razorpay",
      providerEventId: headerId ?? text(refund?.["id"]) ?? providerEventId,
      eventType: "refunded",
      intentId: intentIdFromNotes(refund?.["notes"]) ?? intentId,
      providerPaymentId: text(refund?.["payment_id"]) ?? text(payment?.["id"]),
      amountMinor: minor(refund?.["amount"]),
      currency: text(refund?.["currency"])?.toUpperCase() ?? null,
      feeMinor: 0,
    };
  }
  return null;
}

/** A partial refund must not void the whole receipt. */
export function isFullRefund(paidMinor: number, refundedMinor: number): boolean {
  return paidMinor > 0 && refundedMinor >= paidMinor;
}
