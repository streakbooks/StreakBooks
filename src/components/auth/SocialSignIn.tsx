import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  enabledSocialProviders,
  friendlyAuthError,
  isAuthMethodEnabled,
  type OAuthProviderId,
} from "@/lib/auth-helpers";
import { authCallbackUrl, rememberNext } from "@/lib/auth-session";

const ICONS: Record<OAuthProviderId, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  ),
  azure: (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.5 4.5 0 0 1-2.6-4.1zM13.9 5.1A4.4 4.4 0 0 0 15 1.8a4.6 4.6 0 0 0-3 1.5 4.3 4.3 0 0 0-1.1 3.2 3.8 3.8 0 0 0 3-1.4z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  ),
  linkedin_oidc: (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#0A66C2"
        d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zm1.8 13.1H3.5V9h3.6v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z"
      />
    </svg>
  ),
};

const SCOPES: Partial<Record<OAuthProviderId, string>> = {
  azure: "email openid profile",
};

/** OAuth / SSO entry points. Renders nothing when no provider is configured. */
export function SocialSignIn({
  destination,
  mode,
}: {
  destination: string;
  mode: "signin" | "signup";
}) {
  const [pending, setPending] = useState<OAuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ssoEnabled = isAuthMethodEnabled("sso");

  if (enabledSocialProviders.length === 0 && !ssoEnabled) return null;

  async function start(provider: OAuthProviderId) {
    setError(null);
    setPending(provider);
    rememberNext(destination);
    const scopes = SCOPES[provider];
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authCallbackUrl(), ...(scopes ? { scopes } : {}) },
    });
    if (oauthError) {
      setPending(null);
      setError(friendlyAuthError(oauthError));
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2">
        {enabledSocialProviders.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            disabled={pending !== null}
            onClick={() => start(p.id)}
          >
            {pending === p.id ? <Loader2 className="size-4 animate-spin" /> : ICONS[p.id]}
            {mode === "signin" ? "Continue" : "Sign up"} with {p.label}
          </Button>
        ))}
        {ssoEnabled ? (
          <Button asChild type="button" variant="outline" className="w-full justify-center gap-2">
            <Link to="/auth/sso" search={{ redirect: destination }}>
              <KeyRound className="size-4" aria-hidden />
              Continue with company SSO
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="relative py-1 text-center text-xs uppercase text-muted-foreground">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
        <span className="relative bg-background px-2">or</span>
      </div>
    </div>
  );
}
