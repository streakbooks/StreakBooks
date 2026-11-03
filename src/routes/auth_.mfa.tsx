import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { friendlyAuthError, safeRedirect, validateOtp } from "@/lib/auth-helpers";
import { needsMfaStepUp } from "@/lib/auth-session";

export const Route = createFileRoute("/auth_/mfa")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({ meta: [{ title: "Two-step verification — LinkBooks" }] }),
  component: MfaChallengePage,
});

type Factor = { id: string; friendly_name?: string | null };

function MfaChallengePage() {
  const search = Route.useSearch();
  const destination = safeRedirect(search.redirect);
  const navigate = useNavigate();
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        navigate({ to: "/auth", search: { redirect: destination }, replace: true });
        return;
      }
      if (!(await needsMfaStepUp())) {
        navigate({ to: destination, replace: true });
        return;
      }
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (listError) {
        setError(friendlyAuthError(listError));
        setFactors([]);
        return;
      }
      const totp = (data?.totp ?? []) as Factor[];
      setFactors(totp);
      setFactorId(totp[0]?.id ?? "");
    })();
    return () => {
      active = false;
    };
  }, [destination, navigate]);

  async function verify(value = code) {
    setError(null);
    const invalid = validateOtp(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: value,
    });
    setBusy(false);
    if (verifyError) {
      setCode("");
      setError(friendlyAuthError(verifyError));
      return;
    }
    await router.invalidate();
    navigate({ to: destination, replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (factors === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking two-step verification</span>
      </div>
    );
  }

  return (
    <AuthLayout
      title="Two-step verification"
      subtitle="Enter the 6-digit code from your authenticator app to finish signing in."
      footer={
        <button
          type="button"
          onClick={signOut}
          className="font-medium text-primary hover:underline"
        >
          Sign out and use a different account
        </button>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {factors.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="mfa-factor">Authenticator</Label>
            <RecordLookupSelect
              id="mfa-factor"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={factorId}
              onValueChange={(e) => setFactorId(e)}
            >
              {factors.map((f, i) => (
                <option key={f.id} value={f.id}>
                  {f.friendly_name || `Authenticator ${i + 1}`}
                </option>
              ))}
            </RecordLookupSelect>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="mfa-code">Authentication code</Label>
          <OtpCodeInput
            id="mfa-code"
            value={code}
            onChange={setCode}
            onComplete={(v) => void verify(v)}
            disabled={busy || !factorId}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !factorId}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Verifying…" : "Verify"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Lost access to your authenticator? Ask an organisation owner to contact LinkBooks support
          to verify your identity and reset two-step verification.
        </p>
      </form>
    </AuthLayout>
  );
}
