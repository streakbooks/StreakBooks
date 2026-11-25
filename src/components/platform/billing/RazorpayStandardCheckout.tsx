import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
  modal: { ondismiss: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    callback: (event: { error?: { description?: string } }) => void,
  ) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

async function checkoutScript(): Promise<void> {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay-checkout]");
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset["razorpayCheckout"] = "true";
      document.head.append(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load.")), {
      once: true,
    });
    if (window.Razorpay) resolve();
  });
}

export function RazorpayStandardCheckout() {
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState("INR");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function post(path: string, body: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sign in again to continue.");
    const response = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      [key: string]: unknown;
    };
    if (!response.ok) throw new Error(payload.error ?? "The payment request failed.");
    return payload;
  }

  async function startCheckout() {
    setBusy(true);
    setMessage("");
    try {
      const order = await post("/api/create-order", {
        amount: Number(amount),
        currency,
      });
      if (
        typeof order["key_id"] !== "string" ||
        typeof order["order_id"] !== "string" ||
        typeof order["amount"] !== "number" ||
        typeof order["currency"] !== "string"
      ) {
        throw new Error("The server returned an incomplete Razorpay order.");
      }
      await checkoutScript();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");

      const checkout = new window.Razorpay({
        key: order["key_id"],
        amount: order["amount"],
        currency: order["currency"],
        name: "StreakBooks",
        description: "Standard Checkout verification",
        order_id: order["order_id"],
        handler: async (payment) => {
          try {
            const result = await post("/api/verify-payment", {
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_order_id: payment.razorpay_order_id,
              razorpay_signature: payment.razorpay_signature,
            });
            setMessage(
              result["verified"] === true
                ? "Payment signature verified."
                : "Payment could not be verified.",
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Payment verification failed.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage("Checkout was cancelled.");
          },
        },
      });
      checkout.on("payment.failed", (event) => {
        setBusy(false);
        setMessage(event.error?.description ?? "Payment failed. Try again.");
      });
      checkout.open();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Razorpay Checkout could not start.");
    }
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="razorpay-standard-title">
      <div>
        <h2 id="razorpay-standard-title" className="text-lg font-semibold">
          Razorpay Standard Checkout
        </h2>
        <p className="text-sm text-muted-foreground">
          Platform staff test an order and verify the payment signature. This does not change a
          subscription or accounting record.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(10rem,1fr)_8rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="razorpay-test-amount">Amount in minor units</Label>
          <Input
            id="razorpay-test-amount"
            type="number"
            min="100"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="razorpay-test-currency">Currency</Label>
          <Input
            id="razorpay-test-currency"
            value={currency}
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </div>
        <Button type="button" onClick={() => void startCheckout()} disabled={busy}>
          {busy ? "Starting checkout…" : "Open checkout"}
        </Button>
      </div>
      {message ? (
        <p className="text-sm" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
