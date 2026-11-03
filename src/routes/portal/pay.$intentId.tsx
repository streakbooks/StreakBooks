import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeSandboxPayment } from "@/lib/portals/portals.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { usePortal } from "@/components/portals/use-portal";

export const Route = createFileRoute("/portal/pay/$intentId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sandbox payment — LinkBooks" }] }),
  component: SandboxPay,
});

function SandboxPay() {
  const { intentId } = Route.useParams();
  const portal = usePortal();
  const navigate = useNavigate();
  const complete = useServerFn(completeSandboxPayment);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Sandbox payment</h1>
        <p className="text-sm text-muted-foreground">
          No card is collected and no money moves at a bank. Confirming posts a real customer
          receipt in this organisation, using the settlement account from portal settings.
        </p>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <Button
          disabled={pending || !portal.current}
          onClick={() => {
            if (!portal.current) return;
            setPending(true);
            void complete({ data: { membershipId: portal.current.membership_id, intentId } })
              .then(async () => navigate({ to: "/portal/app/payments" }))
              .catch((error) => setMessage(friendlyAuthError(error)))
              .finally(() => setPending(false));
          }}
        >
          {pending ? "Posting receipt…" : "Confirm sandbox payment"}
        </Button>
      </div>
    </div>
  );
}
