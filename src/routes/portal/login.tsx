import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/portal/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Portal sign in — LinkBooks" }] }),
  component: PortalLogin,
});

function PortalLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setPending(false);
    if (result.error) {
      setError(friendlyAuthError(result.error));
      return;
    }
    if (!result.data.session) {
      setError(
        "Check your email to confirm the account, then sign in and open the invitation again.",
      );
      return;
    }
    await navigate({ to: "/portal/app" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form
        onSubmit={(event) => void submit(event)}
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => setMode(mode === "sign-in" ? "create" : "sign-in")}
        >
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
