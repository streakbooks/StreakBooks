import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { acceptAdvisorsPortalInvite } from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalInvitePage({ token }: { token: string }) {
  const navigate = useNavigate();
  const accept = useServerFn(acceptAdvisorsPortalInvite);
  const [done, setDone] = useState(false);

  const acceptM = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: async () => {
      setDone(true);
      toast.success("Portal access linked");
      await navigate({ to: "/advisors-portal" });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <ListWorkspace
        title="Accept Advisors portal invite"
        description="Sign in with the invited email, then link this account to your Advisors client record."
      >
        <p className="text-sm text-muted-foreground">
          Not signed in yet?{" "}
          <Link
            to="/auth"
            search={{ redirect: `/advisors/portal/invite/${token}` }}
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>{" "}
          first, then accept.
        </p>
        <Button disabled={acceptM.isPending || done} onClick={() => acceptM.mutate()}>
          {done ? "Linked" : "Accept invitation"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Already linked?{" "}
          <Link to="/advisors-portal" className="text-primary underline-offset-4 hover:underline">
            Open portal
          </Link>
        </p>
      </ListWorkspace>
    </main>
  );
}
