import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCaptcha } from "@/hooks/use-captcha";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError, validateEmail, validatePassword } from "@/lib/auth-helpers";
import { authCallbackUrl, rememberLastMethod, rememberNext } from "@/lib/auth-session";
import { resolvePortalSignup } from "@/lib/portals/signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/portal/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Portal sign in — StreakBooks" }] }),
  component: PortalLogin,
});

function PortalLogin() {
  const navigate = useNavigate();
  const captcha = useCaptcha();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function enterPortal(trimmedEmail: string): Promise<string | null> {
    const result = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (result.error) return friendlyAuthError(result.error);
    if (!result.data.session) {
      return "Please confirm your email address before signing in.";
    }
    rememberLastMethod("password");
    await navigate({ to: "/portal/app" });
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    const problem =
      validateEmail(trimmedEmail) ??
      validatePassword(password) ??
      (captcha.ready ? null : "Complete the human verification check.");
    if (problem) {
      setError(problem);
      return;
    }

    setPending(true);
    try {
      if (mode === "sign-in") {
        setError(await enterPortal(trimmedEmail));
        return;
      }

      rememberNext("/portal/app");
      const result = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: authCallbackUrl(),
          ...captcha.options,
        },
      });
      captcha.reset();
      const outcome = resolvePortalSignup({
        errorMessage: result.error?.message ?? null,
        hasSession: Boolean(result.data.session),
        identityCount: result.data.user?.identities?.length ?? null,
      });

      if (outcome.kind === "session") {
        rememberLastMethod("password");
        await navigate({ to: "/portal/app" });
        return;
      }
      if (outcome.kind === "existing") {
        const signInError = await enterPortal(trimmedEmail);
        if (!signInError) return;
        setMode("sign-in");
        setError(
          "An account with this email already exists. Sign in with the password you already use for StreakBooks.",
        );
        return;
      }
      if (outcome.kind === "error") {
        setError(friendlyAuthError(outcome.message));
        return;
      }
      setAwaitingConfirmation(true);
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setPending(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6">
          <h1 className="text-xl font-semibold">Confirm your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{email.trim()}</span>. Open it to activate
            the account. You will be signed in to the portal.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setAwaitingConfirmation(false)}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6"
      >
        <div>
          <h1 className="text-xl font-semibold">Customer and supplier portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the email address on your invitation.
          </p>
        </div>
        <div>
          <Label htmlFor="portal-email">Email</Label>
          <Input
            id="portal-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="portal-password">Password</Label>
          <Input
            id="portal-password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>
        {captcha.widget}
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => {
            setError(null);
            setMode(mode === "sign-in" ? "create" : "sign-in");
          }}
        >
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
