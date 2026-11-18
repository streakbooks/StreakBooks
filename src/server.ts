import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api/marketplace/v1" || pathname.startsWith("/api/marketplace/v1/")) {
        const { handleMarketplaceApiV1 } = await import("./lib/app-store/api/v1/http.server");
        return handleMarketplaceApiV1(request);
      }
      if (pathname.startsWith("/api/v1/")) {
        const { handleApiV1 } = await import("./lib/billing/api/v1/router.server");
        return handleApiV1(request);
      }
      if (
        request.method === "POST" &&
        (pathname === "/api/billing/stripe" || pathname === "/api/billing/razorpay")
      ) {
        const { handleBillingWebhook } = await import("./lib/billing/webhooks");
        return handleBillingWebhook(request);
      }
      if (pathname === "/api/billing/webhook-retry") {
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        const { authenticateCronRequest } = await import("./integrations/supabase/cron-auth");
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { retryDueWebhooks } = await import("./lib/billing/webhooks");
        try {
          const result = await retryDueWebhooks();
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error(
            "Billing webhook retry error",
            error instanceof Error ? error.message : error,
          );
          return Response.json({ error: "Billing webhook retry failed" }, { status: 503 });
        }
      }
      if (
        request.method === "POST" &&
        (pathname === "/api/portals/stripe" || pathname === "/api/portals/razorpay")
      ) {
        const { handlePortalWebhook } = await import("./lib/portals/portal-webhooks");
        return handlePortalWebhook(request);
      }
      if (pathname === "/api/communications/digest-cron") {
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        const { authenticateCronRequest } = await import("./integrations/supabase/cron-auth");
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runScheduledDigests } = await import("./lib/notifications/digest-worker.server");
        const { runMessagingDigests } = await import("./lib/messaging/digest-worker.server");
        try {
          const communications = await runScheduledDigests();
          const messaging = await runMessagingDigests();
          return Response.json(
            { communications, messaging },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("Scheduled digest worker error", error);
          return Response.json({ error: "Scheduled digest worker failed" }, { status: 503 });
        }
      }
      if (pathname === "/api/messaging/retention-cron") {
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        const { authenticateCronRequest } = await import("./integrations/supabase/cron-auth");
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runMessagingRetentionPurge } =
          await import("./lib/messaging/retention-purge.server");
        try {
          const url = new URL(request.url);
          const execute = url.searchParams.get("execute") === "1";
          const result = await runMessagingRetentionPurge({ execute });
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error("Messaging retention purge error", error);
          return Response.json({ error: "Messaging retention purge failed" }, { status: 503 });
        }
      }
      if (pathname === "/api/messaging/outbox-cron") {
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        const { authenticateCronRequest } = await import("./integrations/supabase/cron-auth");
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runMessagingOutboxDrain } = await import("./lib/messaging/outbox-drain.server");
        try {
          const result = await runMessagingOutboxDrain();
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error("Messaging outbox drain error", error);
          return Response.json({ error: "Messaging outbox drain failed" }, { status: 503 });
        }
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
