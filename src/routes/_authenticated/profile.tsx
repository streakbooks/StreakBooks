import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";
import { SecuritySettingsCard } from "@/components/auth/SecuritySettingsCard";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PersonalAppearanceCard } from "@/components/settings/PersonalAppearanceCard";
import { authCallbackUrl, clearNext, rememberNext } from "@/lib/auth-session";
import { normalizeEmailChangeAddress } from "@/lib/auth-email-change";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — StreakBooks" },
      {
        name: "description",
        content: "View and update your StreakBooks account details, email and password.",
      },
      { property: "og:title", content: "Your profile — StreakBooks" },
      {
        property: "og:description",
        content: "View and update your StreakBooks account details and password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const queryClient = useQueryClient();
  const { company } = useActiveCompany();

  const profileQuery = useQuery({
    queryKey: ["my-profile", user.id],
    queryFn: () => fetchProfile(),
  });

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);

  useEffect(() => {
    if (!profileQuery.isSuccess || !profileQuery.data) return;
    setFullName(profileQuery.data.full_name);
    setJobTitle(profileQuery.data.job_title ?? "");
  }, [profileQuery.isSuccess, profileQuery.data]);

  const profileDirty =
    !!profileQuery.data &&
    (fullName !== profileQuery.data.full_name || jobTitle !== (profileQuery.data.job_title ?? ""));

  const mutation = useMutation({
    mutationFn: () => saveProfile({ data: { full_name: fullName, job_title: jobTitle } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["my-profile", user.id], data);
      toast.success("Profile updated");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const nextEmail = normalizeEmailChangeAddress(emailDraft);
  const emailDirty = Boolean(
    nextEmail && nextEmail.toLowerCase() !== profileQuery.data?.email.toLowerCase(),
  );
  const emailMutation = useMutation({
    mutationFn: async () => {
      if (!nextEmail || !emailDirty) throw new Error("Enter a different valid email address.");
      rememberNext("/profile");
      const { error } = await supabase.auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: authCallbackUrl() },
      );
      if (error) {
        clearNext();
        throw error;
      }
    },
    onSuccess: () => {
      setEmailDraft("");
      setEmailConfirmationSent(true);
      toast.success("Check your email to confirm the address change");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <ListWorkspace
      title="Your profile"
      description="Your personal account details, sign-in security and account preferences."
      breadcrumbs={[
        { label: "Settings", to: "/settings" },
        { label: "Personal preferences", to: "/settings/personal/overview" },
        { label: "Profile" },
      ]}
    >
      {profileQuery.isPending ? (
        <LoadingState />
      ) : profileQuery.isError ? (
        <QueryErrorState queries={[profileQuery]} title="Could not load your profile" />
      ) : !profileQuery.isSuccess ? (
        <LoadingState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account details</CardTitle>
              <CardDescription>This is real account data, not demo data.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="mb-6 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (emailDirty && !emailMutation.isPending) emailMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={emailDraft}
                    placeholder={profileQuery.data.email}
                    aria-invalid={Boolean(emailDraft && !nextEmail)}
                    disabled={emailMutation.isPending}
                    onChange={(event) => {
                      setEmailDraft(event.target.value);
                      setEmailConfirmationSent(false);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your current address remains active until you confirm the change from the
                    verification email.
                  </p>
                  {emailDraft && !nextEmail ? (
                    <p className="text-sm text-destructive">Enter a valid email address.</p>
                  ) : null}
                  {emailConfirmationSent ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      Confirmation sent. Your sign-in email changes only after verification.
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!emailDirty || emailMutation.isPending}
                  >
                    {emailMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {emailMutation.isPending ? "Sending confirmation…" : "Change email"}
                  </Button>
                </div>
              </form>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (profileDirty && fullName.trim() && !mutation.isPending) mutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Full name</Label>
                  <Input
                    id="profile-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-role">Job title</Label>
                  <Input
                    id="profile-role"
                    value={jobTitle}
                    placeholder="e.g. Finance Manager"
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    mutation.isPending ||
                    !profileQuery.isSuccess ||
                    !profileDirty ||
                    !fullName.trim()
                  }
                >
                  {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {mutation.isPending ? "Saving…" : "Save changes"}
                </Button>
                {profileDirty ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    Unsaved profile changes
                  </p>
                ) : null}
              </form>
            </CardContent>
          </Card>

          <PersonalAppearanceCard key={user.id} userId={user.id} />

          <ChangePasswordCard />
          <SecuritySettingsCard />
        </div>
      )}
    </ListWorkspace>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
      setError("New password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: next,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ current_password: current } as any),
    });
    setBusy(false);
    if (updateError) {
      setError(friendlyAuthError(updateError));
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password changed");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Password</CardTitle>
        <CardDescription>Change the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next-password">New password</Label>
            <Input
              id="next-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Updating…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
