import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { friendlyAuthError, validateOtp } from "@/lib/auth-helpers";

type Enrolment = { factorId: string; qrCode: string; secret: string };

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email and password",
  phone: "Phone",
  google: "Google",
  azure: "Microsoft",
  apple: "Apple",
  github: "GitHub",
  linkedin_oidc: "LinkedIn",
};

export function SecuritySettingsCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const factorsQ = useQuery({
    queryKey: ["auth-mfa-factors"],
    queryFn: async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      return data.totp;
    },
  });

  const identitiesQ = useQuery({
    queryKey: ["auth-identities"],
    queryFn: async () => {
      const { data, error: idError } = await supabase.auth.getUserIdentities();
      if (idError) throw idError;
      return data.identities;
    },
  });

  const startM = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const stale of (existing?.all ?? []).filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "LinkBooks",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)} ${Date.now() % 10000}`,
      });
      if (enrollError) throw enrollError;
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    onSuccess: (e) => {
      setError(null);
      setCode("");
      setEnrolment(e);
    },
    onError: (e) => setError(friendlyAuthError(e)),
  });

  const verifyM = useMutation({
    mutationFn: async (value: string) => {
      if (!enrolment) throw new Error("Start setup again.");
      const invalid = validateOtp(value);
      if (invalid) throw new Error(invalid);
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrolment.factorId,
        code: value,
      });
      if (verifyError) throw verifyError;
    },
    onSuccess: async () => {
      setEnrolment(null);
      setError(null);
      toast.success("Two-step verification is on");
      await qc.invalidateQueries({ queryKey: ["auth-mfa-factors"] });
    },
    onError: (e) => {
      setCode("");
      setError(friendlyAuthError(e));
    },
  });

  const removeM = useMutation({
    mutationFn: async (factorId: string) => {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) throw unenrollError;
      await supabase.auth.refreshSession();
    },
    onSuccess: async () => {
      toast.success("Authenticator removed");
      await qc.invalidateQueries({ queryKey: ["auth-mfa-factors"] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const signOutAllM = useMutation({
    mutationFn: async () => {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
      if (signOutError) throw signOutError;
    },
    onSuccess: () => navigate({ to: "/auth", replace: true }),
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const verified = (factorsQ.data ?? []).filter((f) => f.status === "verified");

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" aria-hidden />
          Sign-in &amp; security
        </CardTitle>
        <CardDescription>
          Two-step verification, connected sign-in methods and active sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium">Two-step verification (authenticator app)</h3>
              <p className="text-xs text-muted-foreground">
                Ask for a 6-digit code from Google Authenticator, Microsoft Authenticator, 1Password
                or similar each time you sign in.
              </p>
            </div>
            {verified.length > 0 ? <Badge>On</Badge> : <Badge variant="secondary">Off</Badge>}
          </div>

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {factorsQ.isPending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ul className="space-y-2">
              {verified.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                    {f.friendly_name || "Authenticator app"}
                    <span className="text-xs text-muted-foreground">
                      added {new Date(f.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeM.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this authenticator? Sign-in will no longer ask for its code.",
                        )
                      ) {
                        removeM.mutate(f.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {enrolment ? (
            <div className="grid gap-4 rounded-md border border-border p-4 sm:grid-cols-[160px_1fr]">
              <img
                src={enrolment.qrCode}
                alt="QR code for your authenticator app"
                className="size-40 rounded bg-white p-2"
              />
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 pl-4 text-sm">
                  <li>Scan the QR code with your authenticator app.</li>
                  <li>
                    Can&apos;t scan? Enter this key:{" "}
                    <code className="break-all rounded bg-muted px-1 py-0.5 text-xs">
                      {enrolment.secret}
                    </code>
                  </li>
                  <li>Enter the 6-digit code the app shows.</li>
                </ol>
                <div className="space-y-2">
                  <Label htmlFor="enrol-code">Code</Label>
                  <OtpCodeInput
                    id="enrol-code"
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => verifyM.mutate(v)}
                    disabled={verifyM.isPending}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={verifyM.isPending}
                    onClick={() => verifyM.mutate(code)}
                  >
                    {verifyM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Verify and turn on
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEnrolment(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={startM.isPending}
              onClick={() => startM.mutate()}
            >
              {startM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {verified.length > 0 ? "Add another authenticator" : "Set up authenticator app"}
            </Button>
          )}
        </section>

        <Separator />

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Connected sign-in methods</h3>
          {identitiesQ.isPending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(identitiesQ.data ?? []).map((i) => (
                <Badge key={i.identity_id ?? i.id} variant="secondary">
                  {PROVIDER_LABELS[i.provider] ?? i.provider}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Sessions</h3>
            <p className="text-xs text-muted-foreground">
              Signs you out on every browser and device, including this one.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={signOutAllM.isPending}
            onClick={() => {
              if (window.confirm("Sign out of LinkBooks on all devices?")) signOutAllM.mutate();
            }}
          >
            {signOutAllM.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign out everywhere
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
