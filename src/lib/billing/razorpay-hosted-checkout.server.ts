import { assertCheckoutOrigin } from "@/lib/billing/checkout-origin";

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJs(value: string): string {
  return JSON.stringify(value);
}

/**
 * Bridge page: opens Razorpay Standard Checkout for a subscription, then returns
 * to StreakBooks. Hosted subscription short_url pages do not redirect back.
 */
export async function handleRazorpayHostedCheckout(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: htmlHeaders });
  }

  const url = new URL(request.url);
  const subscriptionId = (url.searchParams.get("subscription_id") ?? "").trim();
  const checkoutId = (url.searchParams.get("checkout_id") ?? "").trim();
  const successUrl = (url.searchParams.get("success_url") ?? "").trim();
  const cancelUrl = (url.searchParams.get("cancel_url") ?? "").trim();
  const planName = (url.searchParams.get("plan_name") ?? "StreakBooks").trim().slice(0, 80);
  const email = (url.searchParams.get("email") ?? "").trim().slice(0, 160);

  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    return new Response("Missing subscription.", { status: 400, headers: htmlHeaders });
  }
  if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) {
    return new Response("Missing checkout.", { status: 400, headers: htmlHeaders });
  }

  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const requestProto = request.headers.get("x-forwarded-proto") ?? "https";
  let successOrigin: string;
  let cancelOrigin: string;
  try {
    successOrigin = assertCheckoutOrigin(successUrl, { host: requestHost, proto: requestProto });
    cancelOrigin = assertCheckoutOrigin(cancelUrl, { host: requestHost, proto: requestProto });
  } catch {
    return new Response("The return address is not allowed.", { status: 400, headers: htmlHeaders });
  }
  if (successOrigin !== cancelOrigin) {
    return new Response("Return addresses must share one origin.", {
      status: 400,
      headers: htmlHeaders,
    });
  }

  const keyId = process.env["RAZORPAY_KEY_ID"]?.trim() ?? "";
  if (!keyId.startsWith("rzp_")) {
    return new Response("Razorpay is not configured.", { status: 503, headers: htmlHeaders });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: checkout, error } = await supabaseAdmin
    .from("billing_checkouts" as never)
    .select("id, provider, provider_session_id, status" as never)
    .eq("id" as never, checkoutId as never)
    .maybeSingle();
  if (error) {
    return new Response("Could not verify checkout.", { status: 503, headers: htmlHeaders });
  }
  const row = checkout as {
    id: string;
    provider: string;
    provider_session_id: string | null;
    status: string;
  } | null;
  if (!row || row.provider !== "razorpay" || row.provider_session_id !== subscriptionId) {
    return new Response("Checkout does not match this Razorpay subscription.", {
      status: 404,
      headers: htmlHeaders,
    });
  }

  const title = escapeHtml(`Pay for ${planName}`);
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: #0f1115; color: #f5f5f5; }
    main { max-width: 28rem; padding: 1.5rem; text-align: center; }
    p { line-height: 1.5; color: #c4c4c4; }
    a { color: #f0abfc; }
  </style>
</head>
<body>
  <main>
    <h1>Opening Razorpay…</h1>
    <p>Complete payment in the Razorpay window. You will return to StreakBooks automatically.</p>
    <p><a id="cancel" href=${escapeJs(cancelUrl)}>Cancel and go back</a></p>
  </main>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    (function () {
      var successUrl = ${escapeJs(successUrl)};
      var cancelUrl = ${escapeJs(cancelUrl)};
      var options = {
        key: ${escapeJs(keyId)},
        subscription_id: ${escapeJs(subscriptionId)},
        name: "StreakBooks",
        description: ${escapeJs(planName)},
        notes: { checkout_id: ${escapeJs(checkoutId)} },
        theme: { color: "#c026a4" },
        handler: function () {
          window.location.replace(successUrl);
        },
        modal: {
          ondismiss: function () {
            window.location.replace(cancelUrl);
          }
        }
      };
      ${email ? `options.prefill = { email: ${escapeJs(email)} };` : ""}
      try {
        var checkout = new Razorpay(options);
        checkout.on("payment.failed", function () {
          window.location.replace(cancelUrl);
        });
        checkout.open();
      } catch (error) {
        document.querySelector("h1").textContent = "Could not open Razorpay";
        document.querySelector("p").textContent =
          error && error.message ? error.message : "Try again from Subscription settings.";
      }
    })();
  </script>
</body>
</html>`;

  return new Response(body, { status: 200, headers: htmlHeaders });
}

export function razorpayHostedCheckoutUrl(input: {
  origin: string;
  subscriptionId: string;
  checkoutId: string;
  successUrl: string;
  cancelUrl: string;
  planName: string;
  email?: string;
}): string {
  const url = new URL(`${input.origin}/api/billing/razorpay/hosted`);
  url.searchParams.set("subscription_id", input.subscriptionId);
  url.searchParams.set("checkout_id", input.checkoutId);
  url.searchParams.set("success_url", input.successUrl);
  url.searchParams.set("cancel_url", input.cancelUrl);
  url.searchParams.set("plan_name", input.planName);
  if (input.email) url.searchParams.set("email", input.email);
  return url.toString();
}

export function razorpaySubscriptionReturnUrl(origin: string): string {
  return `${origin}/settings?section=subscription&checkout=success`;
}
