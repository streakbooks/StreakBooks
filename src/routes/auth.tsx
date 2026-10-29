import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { SocialSignIn } from "@/components/auth/SocialSignIn";
import { useCaptcha } from "@/components/auth/CaptchaWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  emailOtpLength,
  friendlyAuthError,
  isAuthMethodEnabled,
  normalisePhone,
  safeRedirect,
  validateEmail,
  validateOtp,
  validatePassword,
  validatePhone,
  type FieldErrors,
} from "@/lib/auth-helpers";
import { authCallbackUrl, needsMfaStepUp, rememberNext } from "@/lib/auth-session";

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string | undefined; mode?: "signin" | "signup" | undefined } => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
    mode: search["mode"] === "signup" ? "signup" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — LinkBooks" },
      {
        name: "description",
        content: "Sign in to LinkBooks or create an account to manage your books securely.",
      },
      { property: "og:title", content: "Sign in — LinkBooks" },
      {
        property: "og:description",
        content: "Sign in to LinkBooks or create an account to manage your books securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type SignInMethod = "password" | "email_code" | "phone";

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const destination = safeRedirect(search.redirect);

  const [tab, setTab] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [checking, setChecking] = useState(true);

  const finish = async () => {
    if (await needsMfaStepUp()) {
      navigate({ to: "/auth/mfa", search: { redirect: destination }, replace: true });
      return;
    }
    await router.invalidate();
    navigate({ to: destination, replace: true });
  };

  // Already signed in? Don't show the form.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) await finish();
      else setChecking(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  return (
    <AuthLayout
      title={tab === "signin" ? "Sign in to LinkBooks" : "Create your LinkBooks account"}
      subtitle={
        tab === "signin"
          ? "Enter your details to access your books."
          : "It takes less than a minute to get started."
      }
      footer={
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your account is stored securely and your organisation data is kept separate from everyone
          else&apos;s. Protected by two-step verification when you turn it on in your profile.
        </p>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-6 space-y-4">
          <SocialSignIn destination={destination} mode="signin" />
          <SignInPanel onSuccess={finish} destination={destination} redirect={search.redirect} />
        </TabsContent>
        <TabsContent value="signup" className="mt-6 space-y-4">
          <SocialSignIn destination={destination} mode="signup" />
          <SignUpForm onSuccess={finish} destination={destination} />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
}

function SignInPanel({
  onSuccess,
  destination,
  redirect,
}: {
  onSuccess: () => void | Promise<void>;
  destination: string;
  redirect?: string | undefined;
}) {
  const methods: SignInMethod[] = ["password"];
  if (isAuthMethodEnabled("email_code")) methods.push("email_code");
  if (isAuthMethodEnabled("phone")) methods.push("phone");
  const [method, setMethod] = useState<SignInMethod>("password");

  return (
    <div className="space-y-4">
      {methods.length > 1 ? (
        <ToggleGroup
          type="single"
          value={method}
          onValueChange={(v) => v && setMethod(v as SignInMethod)}
          className="grid w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] rounded-md border border-border p-1"
          aria-label="Sign-in method"
        >
          <ToggleGroupItem value="password" className="text-xs">
            Password
          </ToggleGroupItem>
          {methods.includes("email_code") ? (
            <ToggleGroupItem value="email_code" className="text-xs">
              {emailOtpLength > 0 ? "Email code" : "Email link"}
            </ToggleGroupItem>
          ) : null}
          {methods.includes("phone") ? (
            <ToggleGroupItem value="phone" className="text-xs">
              Phone
            </ToggleGroupItem>
          ) : null}
        </ToggleGroup>
      ) : null}

      {method === "password" ? (
        <PasswordSignInForm onSuccess={onSuccess} />
      ) : (
        <OtpSignInForm
          key={method}
          channel={method === "phone" ? "phone" : "email"}
          onSuccess={onSuccess}
          destination={destination}
        />
      )}

      {redirect ? (
        <p className="text-center text-xs text-muted-foreground">
          You&apos;ll be returned to the page you requested.
        </p>
      ) : null}
    </div>
  );
}

function ResendConfirmation({ email }: { email: string }) {
  const captcha = useCaptcha();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setState("busy");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl(), ...captcha.options },
    });
    captcha.reset();
    if (error) {
      setState("error");
      setMessage(friendlyAuthError(error));
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return <p className="text-xs text-muted-foreground">Confirmation email sent again.</p>;
  }
  return (
    <div className="space-y-2">
      {captcha.widget}
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-xs"
        disabled={state === "busy" || !captcha.ready}
        onClick={resend}
      >
        {state === "busy" ? "Sending…" : "Resend confirmation email"}
      </Button>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}

function PasswordSignInForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const captcha = useCaptcha();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setUnconfirmed(false);

    const next: FieldErrors = {};
    const emailError = validateEmail(email);
    if (emailError) next["email"] = emailError;
    if (!password) next["password"] = "Password is required.";
    if (!captcha.ready) next["captcha"] = "Complete the human verification check.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { ...captcha.options },
    });
    captcha.reset();
    setBusy(false);

    if (error) {
      setFormError(friendlyAuthError(error));
      setUnconfirmed(error.message.toLowerCase().includes("email not confirmed"));
      return;
    }
    await onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="space-y-2">
            <span className="block">{formError}</span>
            {unconfirmed ? <ResendConfirmation email={email} /> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors["email"])}
          placeholder="you@company.com"
        />
        <FieldError message={errors["email"]} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="signin-password">Password</Label>
          <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="signin-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors["password"])}
        />
        <FieldError message={errors["password"]} />
      </div>

      {captcha.widget}
      <FieldError message={errors["captcha"]} />

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

const RESEND_SECONDS = 60;

function OtpSignInForm({
  channel,
  onSuccess,
  destination,
}: {
  channel: "email" | "phone";
  onSuccess: () => void | Promise<void>;
  destination: string;
}) {
  const captcha = useCaptcha();
  const codeLength = channel === "email" ? emailOtpLength : 6;
  const linkOnly = codeLength === 0;
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    setFormError(null);
    const error = channel === "email" ? validateEmail(identifier) : validatePhone(identifier);
    setFieldError(error ?? (captcha.ready ? null : "Complete the human verification check."));
    if (error || !captcha.ready) return;

    setBusy(true);
    rememberNext(destination);
    const { error: otpError } =
      channel === "email"
        ? await supabase.auth.signInWithOtp({
            email: identifier.trim(),
            options: {
              shouldCreateUser: false,
              emailRedirectTo: authCallbackUrl(),
              ...captcha.options,
            },
          })
        : await supabase.auth.signInWithOtp({
            phone: normalisePhone(identifier),
            options: { shouldCreateUser: false, ...captcha.options },
          });
    captcha.reset();
    setBusy(false);
    if (otpError) {
      setFormError(friendlyAuthError(otpError));
      return;
    }
    setStep("verify");
    setCode("");
    setCooldown(RESEND_SECONDS);
  }

  async function verify(value = code) {
    setFormError(null);
    const error = validateOtp(value, codeLength);
    setFieldError(error);
    if (error) return;
    setBusy(true);
    const { error: verifyError } =
      channel === "email"
        ? await supabase.auth.verifyOtp({ email: identifier.trim(), token: value, type: "email" })
        : await supabase.auth.verifyOtp({
            phone: normalisePhone(identifier),
            token: value,
            type: "sms",
          });
    setBusy(false);
    if (verifyError) {
      setFormError(friendlyAuthError(verifyError));
      return;
    }
    await onSuccess();
  }

  const label = channel === "email" ? "Email" : "Mobile number";
  const resendLabel =
    cooldown > 0 ? `Resend in ${cooldown}s` : linkOnly ? "Resend link" : "Resend code";

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "request") void sendCode();
        else if (!linkOnly) void verify();
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
            <Label htmlFor={`otp-${channel}`}>{label}</Label>
            <Input
              id={`otp-${channel}`}
              type={channel === "email" ? "email" : "tel"}
              autoComplete={channel === "email" ? "email" : "tel"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={Boolean(fieldError)}
              placeholder={channel === "email" ? "you@company.com" : "+44 7700 900123"}
            />
            <p className="text-xs text-muted-foreground">
              {channel === "phone"
                ? "We'll text a 6-digit code to the number on your account."
                : linkOnly
                  ? "We'll email you a one-time sign-in link."
                  : `We'll email a one-time sign-in link and ${codeLength}-digit code.`}
            </p>
          </div>
          {captcha.widget}
          <FieldError message={fieldError} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Sending…" : linkOnly ? "Email me a sign-in link" : "Send code"}
          </Button>
        </>
      ) : (
        <>
          <Alert role="status">
            <AlertDescription>
              {linkOnly ? (
                <>
                  Sign-in link sent to <strong>{identifier.trim()}</strong>. Open it in this browser
                  to continue. You can close this tab afterwards.
                </>
              ) : (
                <>
                  Code sent to <strong>{identifier.trim()}</strong>.{" "}
                  {channel === "email" ? "You can also click the link in the email." : null}
                </>
              )}
            </AlertDescription>
          </Alert>
          {linkOnly ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="otp-code">{codeLength}-digit code</Label>
                <OtpCodeInput
                  id="otp-code"
                  length={codeLength}
                  value={code}
                  onChange={setCode}
                  onComplete={(v) => void verify(v)}
                  disabled={busy}
                />
                <FieldError message={fieldError} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Verifying…" : "Verify and sign in"}
              </Button>
            </>
          )}
          <div className="space-y-2">
            {captcha.widget}
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setStep("request")}
              >
                Use a different {channel === "email" ? "email" : "number"}
              </button>
              <button
                type="button"
                className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                disabled={cooldown > 0 || busy}
                onClick={() => void sendCode()}
              >
                {resendLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}

function SignUpForm({
  onSuccess,
  destination,
}: {
  onSuccess: () => void | Promise<void>;
  destination: string;
}) {
  const captcha = useCaptcha();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const next: FieldErrors = {};
    if (fullName.trim().length < 2) next["fullName"] = "Please enter your full name.";
    const emailError = validateEmail(email);
    if (emailError) next["email"] = emailError;
    const passwordError = validatePassword(password);
    if (passwordError) next["password"] = passwordError;
    if (confirm !== password) next["confirm"] = "Passwords do not match.";
    if (!captcha.ready) next["captcha"] = "Complete the human verification check.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    rememberNext(destination);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authCallbackUrl(),
        data: { full_name: fullName.trim() },
        ...captcha.options,
      },
    });
    captcha.reset();
    setBusy(false);

    if (error) {
      setFormError(friendlyAuthError(error));
      return;
    }

    if (!data.session) {
      setAwaitingConfirmation(true);
      return;
    }
    await onSuccess();
  }

  if (awaitingConfirmation) {
    return (
      <Alert role="status">
        <AlertDescription className="space-y-3">
          <span className="block">
            Account created. We sent a confirmation link to <strong>{email.trim()}</strong>. Open it
            to activate your account, then you&apos;ll be signed in automatically.
          </span>
          <ResendConfirmation email={email} />
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
        <Label htmlFor="signup-name">Full name</Label>
        <Input
          id="signup-name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={Boolean(errors["fullName"])}
          placeholder="Alex Morgan"
        />
        <FieldError message={errors["fullName"]} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email">Work email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors["email"])}
          placeholder="you@company.com"
        />
        <FieldError message={errors["email"]} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors["password"])}
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters, including a letter and a number.
        </p>
        <FieldError message={errors["password"]} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <PasswordInput
          id="signup-confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={Boolean(errors["confirm"])}
        />
        <FieldError message={errors["confirm"]} />
      </div>

      {captcha.widget}
      <FieldError message={errors["captcha"]} />

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

function FieldError({ message }: { message?: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}
