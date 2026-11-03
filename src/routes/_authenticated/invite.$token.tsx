import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptCompanyInvitation,
  previewCompanyInvitation,
} from "@/lib/settings/member-access.functions";
import { roleLabels } from "@/lib/company-constants";
import { ROLE_SUMMARIES } from "@/lib/access-role-summaries";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { companyContextKey } from "@/hooks/use-active-company";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({
    meta: [{ title: "Invitation — LinkBooks" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useServerFn(previewCompanyInvitation);
  const accept = useServerFn(acceptCompanyInvitation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["company-invitation-preview", token],
    retry: false,
    queryFn: () => preview({ data: { token } }),
  });

  if (q.isPending) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading invitation</span>
      </div>
    );
  }

  if (q.isError) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>This invitation could not be opened</CardTitle>
          <CardDescription>{friendlyAuthError(q.error)}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!q.data) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>This invitation link is not valid</CardTitle>
          <CardDescription>
            It may have been replaced, or the link may be incomplete. Ask the person who invited you
            for a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const invite = q.data;
  const closed =
    invite.status === "accepted"
      ? "This invitation has already been accepted."
      : invite.status === "expired"
        ? "This invitation has expired. Ask for a new one."
        : invite.status === "revoked"
          ? "This invitation was revoked."
          : null;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Join {invite.companyName}</CardTitle>
        <CardDescription>
          {roleLabels[invite.role]}. {ROLE_SUMMARIES[invite.role]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          Invited address: <span className="font-medium">{invite.email}</span>
        </p>
        {invite.expiresAt && invite.status === "pending" ? (
          <p className="text-sm text-muted-foreground">
            Expires {new Date(invite.expiresAt).toLocaleString()}
          </p>
        ) : null}
        {closed ? (
          <Alert>
            <AlertTitle>Invitation closed</AlertTitle>
            <AlertDescription>{closed}</AlertDescription>
          </Alert>
        ) : null}
        {!closed && !invite.emailMatches ? (
          <Alert>
            <AlertTitle>Different account</AlertTitle>
            <AlertDescription>
              Sign out and sign in as {invite.email} to accept this invitation.
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not accept</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!closed && invite.emailMatches ? (
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await accept({ data: { token } });
                await queryClient.invalidateQueries({ queryKey: companyContextKey });
                toast.success(`You joined ${invite.companyName}`);
                await navigate({ to: "/" });
              } catch (err) {
                setError(friendlyAuthError(err));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Joining…" : "Accept and open the organisation"}
          </Button>
        ) : null}
        {!closed && !invite.emailMatches ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                await navigate({
                  to: "/auth",
                  search: { redirect: `/invite/${token}` },
                });
              }}
            >
              Sign out
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/auth" search={{ redirect: `/invite/${token}`, mode: "signup" }}>
                Create an account
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
