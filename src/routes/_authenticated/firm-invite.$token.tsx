import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  acceptFirmStaffInvitation,
  previewFirmStaffInvitation,
} from "@/lib/firm/firm-invites.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/firm-invite/$token")({
  head: () => ({
    meta: [
      { title: "Firm staff invitation — LinkBooks" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FirmInvitePage,
});

function FirmInvitePage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const preview = useServerFn(previewFirmStaffInvitation);
  const accept = useServerFn(acceptFirmStaffInvitation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["firm-invite-preview", token],
    queryFn: () => preview({ data: { token } }),
    retry: false,
  });

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Firm staff invitation</CardTitle>
        <CardDescription>
          Verify the invited email address to join a practice. No client bookkeeping
          permissions are granted automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? <p>Checking invitation…</p> : null}
        {query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Cannot open invitation</AlertTitle>
            <AlertDescription>{friendlyAuthError(query.error)}</AlertDescription>
          </Alert>
        ) : null}
        {!query.isPending && !query.isError && !query.data ? (
          <p>This invitation is invalid. Ask the firm administrator to send a new invitation.</p>
        ) : null}
        {query.data?.status === "different_account" ? (
          <Alert>
            <AlertTitle>Sign in with the invited account</AlertTitle>
            <AlertDescription>
              This account cannot accept the invitation. Sign out and use the verified email
              address that received the invitation.
            </AlertDescription>
          </Alert>
        ) : null}
        {query.data && query.data.status !== "different_account" ? (
          <>
            <p className="font-medium">{query.data.firmName}</p>
            <p className="text-sm">Firm role: {query.data.role}</p>
            {query.data.expiresAt ? (
              <p className="text-sm text-muted-foreground">
                Expires {new Date(query.data.expiresAt).toLocaleString()}
              </p>
            ) : null}
            {query.data.status === "pending" ? (
              <Button
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError("");
                  try {
                    await accept({ data: { token } });
                    await qc.invalidateQueries({ queryKey: ["my-firms"] });
                    toast.success("You joined the firm");
                    await navigate({ to: "/firm" });
                  } catch (err) {
                    setError(friendlyAuthError(err));
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Accepting…" : "Accept invitation"}
              </Button>
            ) : (
              <p className="text-sm">
                This invitation is {query.data.status}. Ask for a new link if necessary.
              </p>
            )}
          </>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button variant="outline" asChild>
          <Link to="/firm">Back to Firm & clients</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
