import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { useCaptcha } from "@/components/auth/CaptchaWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  friendlyAuthError,
  isAuthMethodEnabled,
  normalisePhone,
  validateEmail,
  validateOtp,
  validatePhone,
} from "@/lib/auth-helpers";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — LinkBooks" },
      {
        name: "description",
        content: "Request a secure link or code to reset the password on your LinkBooks account.",
      },
      { property: "og:title", content: "Reset your password — LinkBooks" },
      {
        property: "og:description",
        content: "Request a secure link or code to reset the password on your LinkBooks account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const phoneEnabled = isAuthMethodEnabled("phone");
  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        phoneEnabled
          ? "We'll email you a secure link, or text a code to the mobile number on your account."
          : "We'll email you a secure link to choose a new password."
      }
      footer={
        <Link to="/auth" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {phoneEnabled ? (
        <Tabs defaultValue="email">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="phone">Phone</TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="mt-6">
            <EmailReset />
          </TabsContent>
          <TabsContent value="phone" className="mt-6">
            <PhoneReset />
          </TabsContent>
        </Tabs>
      ) : (
        <EmailReset />
      )}
    </AuthLayout>
  );
}

function EmailReset() {
  const captcha = useCaptcha();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const error =
      validateEmail(email) ?? (captcha.ready ? null : "Complete the human verification check.");
    setFieldError(error);
    if (error) return;

    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      ...captcha.options,
    });
    captcha.reset();
    setBusy(false);

    if (resetError) {
      setFormError(friendlyAuthError(resetError));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Alert role="status">
        <AlertDescription>
          If an account exists for {email.trim()}, a reset link is on its way. The link expires
          after a short time for your security.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(fieldError)}
          placeholder="you@company.com"
        />
      </div>
      {captcha.widget}
      {fieldError ? (
        <p role="alert" className="text-xs text-destructive">
          {fieldError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

/** SMS code signs the user in, then /reset-password sets the new password on that session. */
function PhoneReset() {
  const navigate = useNavigate();
  const captcha = useCaptcha();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setFormError(null);
    const error =
      validatePhone(phone) ?? (captcha.ready ? null : "Complete the human verification check.");
    setFieldError(error);
    if (error) return;
    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: normalisePhone(phone),
      options: { shouldCreateUser: false, ...captcha.options },
    });
    captcha.reset();
    setBusy(false);
    if (otpError) {
      setFormError(friendlyAuthError(otpError));
      return;
    }
    setStep("verify");
  }

  async function verify(value = code) {
    setFormError(null);
    const error = validateOtp(value);
    setFieldError(error);
    if (error) return;
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: normalisePhone(phone),
      token: value,
      type: "sms",
    });
    setBusy(false);
    if (verifyError) {
      setFormError(friendlyAuthError(verifyError));
      return;
    }
    navigate({ to: "/reset-password", replace: true });
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "request" ? sendCode() : verify());
      }}
    >
      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      {step === "request" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="reset-phone">Mobile number on your account</Label>
            <Input
              id="reset-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 900123"
            />
          </div>
          {captcha.widget}
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="reset-code">Code sent to {normalisePhone(phone)}</Label>
          <OtpCodeInput
            id="reset-code"
            value={code}
            onChange={setCode}
            onComplete={(v) => void verify(v)}
            disabled={busy}
          />
        </div>
      )}
      {fieldError ? (
        <p role="alert" className="text-xs text-destructive">
          {fieldError}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {step === "request"
          ? busy
            ? "Sending…"
            : "Text me a code"
          : busy
            ? "Verifying…"
            : "Verify code"}
      </Button>
    </form>
  );
}
