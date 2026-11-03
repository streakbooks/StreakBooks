import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Mail, MailCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { SocialSignIn } from "@/components/auth/SocialSignIn";
import { useCaptcha } from "@/components/auth/CaptchaWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  authCallbackUrl,
  needsMfaStepUp,
  readLastMethod,
  rememberLastMethod,
  rememberNext,
} from "@/lib/auth-session";

type Mode = "signin" | "signup";

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string | undefined; mode?: Mode | undefined } => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
    mode: search["mode"] === "signup" ? "signup" : undefined,
  }),
  head: ({ match }) => ({
    meta: [
      {
        title:
          match.search.mode === "signup"
            ? "Create your account — LinkBooks"
            : "Sign in — LinkBooks",
      },
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

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const destination = safeRedirect(search.redirect);
  const mode: Mode = search.mode ?? "signin";
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

  const switchSearch = {
    redirect: search.redirect,
    mode: mode === "signin" ? ("signup" as const) : undefined,
  };

  return (
    <AuthLayout
      title={mode === "signin" ? "Welcome back" : "Create your account"}
      subtitle={
        mode === "signin"
          ? "Sign in to your LinkBooks account."
          : "Set up LinkBooks for your business or practice in a few minutes."
      }
      headerAction={
        <>
          {mode === "signin" ? "New to LinkBooks? " : "Already have an account? "}
          <Link
            to="/auth"
            search={switchSearch}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </Link>
        </>
      }
      footer={
        <p className="text-xs leading-relaxed">
          Your organisation&apos;s data is isolated from every other organisation in the database.
          Turn on two-step verification in your profile for extra protection.
        </p>
      }
    >
      <div key={mode} className="space-y-5 duration-300 animate-in fade-in slide-in-from-bottom-1">
        <SocialSignIn destination={destination} mode={mode} />
        {mode === "signin" ? (
          <SignInPanel onSuccess={finish} destination={destination} redirect={search.redirect} />
        ) : (
          <SignUpForm onSuccess={finish} destination={destination} />
        )}
      </div>
    </AuthLayout>
  );
}

type SignInMethod = "password" | "email" | "phone";

function SignInPanel({
  onSuccess,
  destination,
  redirect,
}: {
  onSuccess: () => void | Promise<void>;
  destination: string;
  redirect?: string | undefined;
}) {
  const emailEnabled = isAuthMethodEnabled("email_code");
  const phoneEnabled = isAuthMethodEnabled("phone");
  const [method, setMethod] = useState<SignInMethod>(() => {
    const last = readLastMethod();
    if (last === "email_link" && emailEnabled) return "email";
    if (last === "phone" && phoneEnabled) return "phone";
    return "password";
  });
  const [email, setEmail] = useState("");

  const alternatives: Array<{ id: SignInMethod; label: string; icon: React.ReactNode }> = [];
  if (method !== "password") {
    alternatives.push({ id: "password", label: "Sign in with password", icon: null });
  }
  if (method !== "email" && emailEnabled) {
    alternatives.push({
      id: "email",
      label: emailOtpLength > 0 ? "Email me a sign-in code" : "Email me a sign-in link",
      icon: <Mail className="size-3.5" aria-hidden />,
    });
  }
  if (method !== "phone" && phoneEnabled) {
    alternatives.push({
      id: "phone",
      label: "Use my phone number",
      icon: <Smartphone className="size-3.5" aria-hidden />,
    });
  }

  return (
    <div className="space-y-5">
      {method === "password" ? (
        <PasswordSignInForm onSuccess={onSuccess} email={email} onEmailChange={setEmail} />
      ) : (
        <OtpSignInForm
          key={method}
          channel={method === "phone" ? "phone" : "email"}
          initialIdentifier={method === "email" ? email : ""}
          onSuccess={onSuccess}
          destination={destination}
        />
      )}

      {alternatives.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {alternatives.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setMethod(a.id)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      {redirect && safeRedirect(redirect) !== "/" ? (
        <p className="text-center text-xs text-muted-foreground">
          You&apos;ll be returned to the page you requested.
        </p>
      ) : null}
    </div>
  );
}

const RESEND_SECONDS = 60;

function useCooldown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return { seconds, start: () => setSeconds(RESEND_SECONDS) };
}

function PasswordSignInForm({
  onSuccess,
  email,
  onEmailChange,
}: {
  onSuccess: () => void | Promise<void>;
  email: string;
  onEmailChange: (value: string) => void;
}) {
  const captcha = useCaptcha();
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
    rememberLastMethod("password");
    await onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="space-y-2">
            <span className="block">{formError}</span>
            {unconfirmed ? <ResendConfirmation email={email} compact /> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="username"
          autoFocus
          className="h-10"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          aria-invalid={Boolean(errors["email"])}
          placeholder="you@company.com"
        />
        <FieldError message={errors["email"]} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="signin-password">Password</Label>
          <Link
            to="/forgot-password"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
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

      <Button type="submit" className="h-10 w-full text-[15px]" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function OtpSignInForm({
  channel,
  initialIdentifier,
  onSuccess,
  destination,
}: {
  channel: "email" | "phone";
  initialIdentifier: string;
  onSuccess: () => void | Promise<void>;
  destination: string;
}) {
  const captcha = useCaptcha();
  const cooldown = useCooldown();
  const codeLength = channel === "email" ? emailOtpLength : 6;
  const linkOnly = codeLength === 0;
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (channel === "email") rememberLastMethod("email_link");
    setStep("verify");
    setCode("");
    cooldown.start();
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
      setCode("");
      setFormError(friendlyAuthError(verifyError));
      return;
    }
    rememberLastMethod(channel === "email" ? "email_link" : "phone");
    await onSuccess();
  }

  const resendLabel =
    cooldown.seconds > 0
      ? `Resend in ${cooldown.seconds}s`
      : linkOnly
        ? "Resend link"
        : "Resend code";

  if (step === "verify" && linkOnly) {
    return (
      <CheckInbox
        email={identifier.trim()}
        heading="Check your inbox"
        body="We sent you a secure sign-in link. Open it in this browser to continue."
        onBack={() => setStep("request")}
        onResend={() => void sendCode()}
        resendLabel={resendLabel}
        resendDisabled={cooldown.seconds > 0 || busy}
        captchaWidget={captcha.widget}
        error={formError}
      />
    );
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
            <Label htmlFor={`otp-${channel}`}>
              {channel === "email" ? "Email" : "Mobile number"}
            </Label>
            <Input
              id={`otp-${channel}`}
              type={channel === "email" ? "email" : "tel"}
              autoComplete={channel === "email" ? "username" : "tel"}
              autoFocus
              className="h-10"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={Boolean(fieldError)}
              placeholder={channel === "email" ? "you@company.com" : "+91 98765 43210"}
            />
            <p className="text-xs text-muted-foreground">
              {channel === "phone"
                ? "Use international format. We'll text a 6-digit code to the number on your account."
                : linkOnly
                  ? "We'll email you a one-time sign-in link. No password needed."
                  : `We'll email you a ${codeLength}-digit sign-in code.`}
            </p>
          </div>
          {captcha.widget}
          <FieldError message={fieldError} />
          <Button type="submit" className="h-10 w-full text-[15px]" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy
              ? "Sending…"
              : channel === "phone"
                ? "Text me a code"
                : linkOnly
                  ? "Email me a link"
                  : "Email me a code"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enter the {codeLength}-digit code sent to{" "}
            <span className="font-medium text-foreground">{identifier.trim()}</span>.
          </p>
          <div className="flex justify-center">
            <OtpCodeInput
              id="otp-code"
              length={codeLength}
              value={code}
              onChange={setCode}
              onComplete={(v) => void verify(v)}
              disabled={busy}
            />
          </div>
          <FieldError message={fieldError} />
          <Button type="submit" className="h-10 w-full text-[15px]" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Verifying…" : "Verify and sign in"}
          </Button>
          {captcha.widget}
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setStep("request")}
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Change {channel === "email" ? "email" : "number"}
            </button>
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              disabled={cooldown.seconds > 0 || busy}
              onClick={() => void sendCode()}
            >
              {resendLabel}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

const MAIL_APPS = [
  { label: "Open Gmail", href: "https://mail.google.com/mail/u/0/#inbox" },
  { label: "Open Outlook", href: "https://outlook.office.com/mail/" },
];

function CheckInbox({
  email,
  heading,
  body,
  onBack,
  onResend,
  resendLabel,
  resendDisabled,
  captchaWidget,
  error,
}: {
  email: string;
  heading: string;
  body: string;
  onBack: () => void;
  onResend: () => void;
  resendLabel: string;
  resendDisabled: boolean;
  captchaWidget: React.ReactNode;
  error: string | null;
}) {
  return (
    <div className="space-y-6 text-center duration-300 animate-in fade-in zoom-in-95">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <MailCheck className="size-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">
          {body}
          <br />
          Sent to <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>
      {error ? (
        <Alert variant="destructive" role="alert" className="text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        {MAIL_APPS.map((m) => (
          <Button key={m.label} asChild variant="outline" className="h-10">
            <a href={m.href} target="_blank" rel="noopener noreferrer">
              {m.label}
            </a>
          </Button>
        ))}
      </div>
      {captchaWidget}
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Use a different email
        </button>
        <button
          type="button"
          className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          disabled={resendDisabled}
          onClick={onResend}
        >
          {resendLabel}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Can&apos;t find it? Check your spam or promotions folder.
      </p>
    </div>
  );
}

function ResendConfirmation({ email, compact }: { email: string; compact?: boolean }) {
  const captcha = useCaptcha();
  const cooldown = useCooldown();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl(), ...captcha.options },
    });
    captcha.reset();
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: friendlyAuthError(error) });
      return;
    }
    cooldown.start();
    setMessage({ ok: true, text: "Confirmation email sent again." });
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-2 text-center"}>
      {captcha.widget}
      <button
        type="button"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
        disabled={busy || cooldown.seconds > 0 || !captcha.ready}
        onClick={resend}
      >
        {busy
          ? "Sending…"
          : cooldown.seconds > 0
            ? `Resend in ${cooldown.seconds}s`
            : "Resend confirmation email"}
      </button>
      {message ? (
        <p className={message.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {message.text}
        </p>
      ) : null}
    </div>
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
    rememberLastMethod("password");
    if (!data.session) {
      setAwaitingConfirmation(true);
      return;
    }
    await onSuccess();
  }

  if (awaitingConfirmation) {
    return (
      <div className="space-y-6 text-center duration-300 animate-in fade-in zoom-in-95">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="size-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Confirm your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{email.trim()}</span>. Open it to activate
            your account — you&apos;ll be signed in automatically.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {MAIL_APPS.map((m) => (
            <Button key={m.label} asChild variant="outline" className="h-10">
              <a href={m.href} target="_blank" rel="noopener noreferrer">
                {m.label}
              </a>
            </Button>
          ))}
        </div>
        <ResendConfirmation email={email} />
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setAwaitingConfirmation(false)}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Use a different email
        </button>
      </div>
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
          autoFocus
          className="h-10"
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
          className="h-10"
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
          aria-describedby="signup-password-strength"
        />
        <div id="signup-password-strength">
          <PasswordStrengthMeter password={password} context={[fullName, email]} />
        </div>
        <FieldError message={errors["password"]} />
      </div>

      {captcha.widget}
      <FieldError message={errors["captcha"]} />

      <Button type="submit" className="h-10 w-full text-[15px]" disabled={busy}>
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
