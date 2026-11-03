import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { commitPendingMethod, needsMfaStepUp, takeNext } from "@/lib/auth-session";

/** Landing page for OAuth, SAML SSO, email confirmation and email sign-in links. */
export const Route = createFileRoute("/auth_/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Signing you in — LinkBooks" }] }),
  component: AuthCallbackPage,
});

const SESSION_WAIT_MS = 8000;

function waitForSession(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.subscription.unsubscribe();
      resolve(false);
    }, SESSION_WAIT_MS);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
      resolve(true);
    });
  });
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const providerError =
        url.searchParams.get("error_description") ?? hash.get("error_description");
      if (providerError) {
        setError(friendlyAuthError(providerError.replace(/\+/g, " ")));
        return;
      }

      // The client consumes implicit-flow tokens from the URL while initialising.
      let { data } = await supabase.auth.getSession();
      const code = url.searchParams.get("code");
      if (!data.session && code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (active) setError(friendlyAuthError(exchangeError));
          return;
        }
        ({ data } = await supabase.auth.getSession());
      }
      const signedIn = Boolean(data.session) || (await waitForSession());
      if (!active) return;
      if (!signedIn) {
        setError("This sign-in link is invalid or has expired. Please try again.");
        return;
      }

      commitPendingMethod();
      const next = takeNext();
      if (await needsMfaStepUp()) {
        navigate({ to: "/auth/mfa", search: { redirect: next }, replace: true });
        return;
      }
      await router.invalidate();
      navigate({ to: next, replace: true });
    })();
    return () => {
      active = false;
    };
  }, [navigate, router]);

  if (!error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          Signing you in…
        </div>
      </div>
    );
  }

  return (
    <AuthLayout
      title="We couldn't sign you in"
      footer={
        <Link to="/auth" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Alert variant="destructive" role="alert">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    </AuthLayout>
  );
}
