// Bundled with scripts/build-reporting-worker.mjs. Secrets are supplied only by the Edge runtime.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { buildReportDocument } from "../../../src/lib/reports/report-document";
import { exportReportPdf, bytesToBase64 } from "../../../src/lib/reports/pdf-export.server";
import { readEmailConfig, sendViaResend } from "../../../src/lib/documents/email-provider.server";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = request.headers.get("x-report-worker-token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Worker is not configured" }, 503);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const valid = await sb.rpc("reporting_worker_token_valid", { _token: token });
  if (valid.error || valid.data !== true) return json({ error: "Unauthorized" }, 401);
  const config = readEmailConfig({
    RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
    EMAIL_FROM: Deno.env.get("EMAIL_FROM"),
  });
  await sb.rpc("reporting_worker_heartbeat", {
    _configured: config.configured,
    _from: config.configured ? config.from : null,
  });
  if (!config.configured)
    return json(
      {
        configured: false,
        processed: 0,
        error: "A verified sender and email provider secret are required",
      },
      503,
    );
  const { error: enqueueError } = await sb.rpc("enqueue_due_report_schedules");
  if (enqueueError) return json({ error: "Could not enqueue due schedules" }, 500);
  const { data: jobs, error } = await sb.rpc("claim_report_deliveries", { _limit: 5 });
  if (error) return json({ error: "Could not claim delivery jobs" }, 500);
  let accepted = 0,
    failed = 0;
  for (const job of jobs ?? []) {
    let providerId: string | null = null,
      errorMessage: string | null = null;
    try {
      const document = buildReportDocument(job.facts, job.definition);
      const pdf = await exportReportPdf(document);
      const filename = `${document.title.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${document.to}.pdf`;
      const result = await sendViaResend(config, {
        to: job.recipients,
        subject: job.subject,
        text: job.message,
        html: `<p>${escape(job.message).replace(/\n/g, "<br>")}</p>`,
        attachments: [{ filename, content: bytesToBase64(pdf) }],
        idempotencyKey: `linkbooks-report-${job.id}`,
      });
      if (result.ok && result.messageId) {
        providerId = result.messageId;
        accepted++;
      } else {
        errorMessage = result.ok ? "Provider returned no message identifier" : result.error;
        failed++;
      }
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Could not generate the report attachment";
      failed++;
    }
    const result = await sb.rpc("finish_report_delivery", {
      _id: job.id,
      _attempt: job.attempts,
      _provider_id: providerId,
      _error: errorMessage,
    });
    if (result.error)
      console.error("Delivery result could not be recorded", job.id, result.error.code);
  }
  // Poll provider events. Acceptance alone never advances a pack to Delivered.
  const pending = await sb.rpc("claim_report_delivery_confirmations", { _limit: 25 });
  if (pending.error) return json({ error: "Could not claim provider confirmation checks" }, 500);
  let confirmed = 0;
  for (const job of pending.data ?? []) {
    try {
      const response = await fetch(
        `https://api.resend.com/emails/${encodeURIComponent(job.provider_id)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}` } },
      );
      if (!response.ok) continue;
      const event = await response.json();
      if (event.last_event === "delivered") {
        await sb.rpc("confirm_report_delivery", {
          _provider_id: job.provider_id,
          _delivered: true,
        });
        confirmed++;
      }
      if (["bounced", "failed", "complained", "suppressed"].includes(event.last_event))
        await sb.rpc("confirm_report_delivery", {
          _provider_id: job.provider_id,
          _delivered: false,
          _reason: `Provider event: ${event.last_event}`,
        });
    } catch {
      console.warn("Provider delivery status is temporarily unavailable");
    }
  }
  return json({ configured: true, accepted, failed, confirmed });
});
