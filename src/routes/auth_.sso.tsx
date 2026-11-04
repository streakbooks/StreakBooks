import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useCaptcha } from "@/hooks/use-captcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  friendlyAuthError,
  isAuthMethodEnabled,
  safeRedirect,
  ssoDomainFrom,
} from "@/lib/auth-helpers";
import { authCallbackUrl, rememberNext, rememberPendingMethod } from "@/lib/auth-session";

export const Route = createFileRoute("/auth_/sso")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Single sign-on — LinkBooks" },
      { name: "description", content: "Sign in to LinkBooks with your company identity provider." },
    ],
  }),
  component: SsoPage,
});

function SsoPage() {
  const search = Route.useSearch();
  const destination = safeRedirect(search.redirect);
  const captcha = useCaptcha();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = isAuthMethodEnabled("sso");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const domain = ssoDomainFrom(value);
    if (!domain) {
      setError("Enter your work email or company domain, e.g. you@acme.com.");
      return;
    }
    if (!captcha.ready) {
      setError("Complete the human verification check.");
      return;
    }
    setBusy(true);
    rememberNext(destination);
    rememberPendingMethod("sso");
    const { data, error: ssoError } = await supabase.auth.signInWithSSO({
      domain,
      options: { redirectTo: authCallbackUrl(), ...captcha.options },
    });
    captcha.reset();
    if (ssoError || !data?.url) {
      setBusy(false);
      setError(friendlyAuthError(ssoError ?? "Single sign-on isn't set up for that domain."));
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <AuthLayout
      title="Sign in with company SSO"
      subtitle="Use your organisation's identity provider (Okta, Microsoft Entra ID, Google Workspace and other SAML 2.0 providers)."
      headerAction={
        <Link
          to="/auth"
          search={{ redirect: search.redirect }}
          className="font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      {!enabled ? (
        <Alert role="status">
          <AlertDescription>
            Single sign-on isn&apos;t enabled for LinkBooks yet. Contact your administrator.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="sso-domain">Work email or company domain</Label>
            <Input
              id="sso-domain"
              autoComplete="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="you@acme.com"
            />
          </div>
          {captcha.widget}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Redirecting…" : "Continue"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
