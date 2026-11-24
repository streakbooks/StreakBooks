import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { acceptPortalInvite } from "@/lib/portals/portals.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/invite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Accept portal invitation — StreakBooks" }] }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptPortalInvite);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onAccept() {
    setPending(true);
    setMessage(null);
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setPending(false);
      await navigate({ to: "/portal/login" });
      return;
    }
    try {
      await accept({ data: { token } });
      await navigate({ to: "/portal/app" });
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">Portal invitation</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with the invited email, then accept. The link expires and can be revoked.
        </p>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <Button disabled={pending} onClick={() => void onAccept()}>
          {pending ? "Accepting…" : "Accept invitation"}
        </Button>
      </div>
    </div>
  );
}
