/**
 * Shared, provider-agnostic authentication helpers.
 *
 * Every optional sign-in method is switched on by a public `VITE_AUTH_*` flag, and the
 * matching provider must also be enabled in Supabase Auth. No provider is advertised in
 * the UI until it is genuinely configured.
 */

/** OAuth ids match Supabase provider names (`azure` is Microsoft Entra ID). */
export type OAuthProviderId = "google" | "azure" | "apple" | "github" | "linkedin_oidc";

export type AuthProviderId = "password" | "email_code" | "phone" | "sso" | OAuthProviderId;

export type AuthProviderDescriptor = {
  id: AuthProviderId;
  label: string;
  /** Only configured providers are rendered. */
  enabled: boolean;
};

export type CaptchaProvider = "turnstile" | "hcaptcha";

export type AuthEnv = Partial<Record<string, string | boolean | undefined>>;

const OAUTH_LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  azure: "Microsoft",
  apple: "Apple",
  github: "GitHub",
  linkedin_oidc: "LinkedIn",
};

function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function parseOAuthProviders(value: unknown): OAuthProviderId[] {
  if (typeof value !== "string") return [];
  const seen = new Set<OAuthProviderId>();
  for (const raw of value.split(",")) {
    const id = raw.trim().toLowerCase();
    if (id in OAUTH_LABELS) seen.add(id as OAuthProviderId);
  }
  return [...seen];
}

export function buildAuthProviders(env: AuthEnv): AuthProviderDescriptor[] {
  const oauth = parseOAuthProviders(env["VITE_AUTH_OAUTH_PROVIDERS"]);
  return [
    { id: "password", label: "Email and password", enabled: true },
    {
      id: "email_code",
      label: "Email sign-in link or code",
      enabled: flag(env["VITE_AUTH_EMAIL_CODE_ENABLED"], true),
    },
    {
      id: "phone",
      label: "Phone (SMS code)",
      enabled: flag(env["VITE_AUTH_PHONE_ENABLED"], false),
    },
    {
      id: "sso",
      label: "Single sign-on (SAML)",
      enabled: flag(env["VITE_AUTH_SSO_ENABLED"], false),
    },
    ...(Object.keys(OAUTH_LABELS) as OAuthProviderId[]).map((id) => ({
      id,
      label: OAUTH_LABELS[id],
      enabled: oauth.includes(id),
    })),
  ];
}

export function buildCaptchaConfig(
  env: AuthEnv,
): { provider: CaptchaProvider; siteKey: string } | null {
  const provider = String(env["VITE_CAPTCHA_PROVIDER"] ?? "")
    .trim()
    .toLowerCase();
  const siteKey = String(env["VITE_CAPTCHA_SITE_KEY"] ?? "").trim();
  if (!siteKey || (provider !== "turnstile" && provider !== "hcaptcha")) return null;
  return { provider, siteKey };
}

/**
 * Digits in the emailed sign-in code. 0 = link only: Supabase's built-in email template
 * carries just the link, and templates can only be edited once custom SMTP is configured.
 */
export function buildEmailOtpLength(env: AuthEnv): number {
  const n = Number(env["VITE_AUTH_EMAIL_OTP_LENGTH"] ?? 0);
  return Number.isInteger(n) && n >= 6 && n <= 10 ? n : 0;
}

const viteEnv = (import.meta.env ?? {}) as AuthEnv;

export const emailOtpLength = buildEmailOtpLength(viteEnv);

/** Enabled sign-in methods for this deployment. */
export const authProviders: AuthProviderDescriptor[] = buildAuthProviders(viteEnv);

export const captchaConfig = buildCaptchaConfig(viteEnv);

export function isAuthMethodEnabled(id: AuthProviderId): boolean {
  return authProviders.some((p) => p.id === id && p.enabled);
}

export const enabledSocialProviders = authProviders.filter(
  (p): p is AuthProviderDescriptor & { id: OAuthProviderId } => p.enabled && p.id in OAUTH_LABELS,
);

/** Only allow same-origin relative paths as post-login destinations. */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

const messages: Record<string, string> = {
  "invalid login credentials": "That email and password combination isn't right.",
  "email not confirmed": "Please confirm your email address before signing in.",
  "user already registered": "An account with this email already exists. Try signing in.",
  "password should be at least 8 characters": "Your password must be at least 8 characters long.",
  "captcha verification process failed":
    "We couldn't verify you're human. Complete the check and try again.",
  "token has expired or is invalid": "That code is wrong or has expired. Request a new one.",
  "invalid totp code":
    "That authenticator code isn't right. Check the time on your device and retry.",
  "signups not allowed for otp": "No account uses that email or phone. Create an account first.",
  "unsupported phone provider": "Phone sign-in isn't available yet.",
  "no sso provider assigned":
    "Single sign-on isn't set up for that domain. Ask your administrator.",
  "provider is not enabled": "That sign-in method isn't enabled yet.",
  "email rate limit exceeded": "Too many emails sent recently. Please wait before trying again.",
};

/** Turn provider errors into plain language without leaking internals. */
export function friendlyAuthError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong.";
  const key = raw.toLowerCase().trim();
  for (const [needle, friendly] of Object.entries(messages)) {
    if (key.includes(needle)) return friendly;
  }
  if (key.includes("pwned") || key.includes("compromised")) {
    return "That password has appeared in a known data breach. Please choose another.";
  }
  if (key.includes("rate limit") || key.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return raw;
}

export type FieldErrors = Record<string, string>;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

/** International (E.164) phone number, e.g. +447700900123. */
export function normalisePhone(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

export function validatePhone(value: string): string | null {
  const phone = normalisePhone(value);
  if (!phone) return "Phone number is required.";
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return "Enter your number in international format, e.g. +44 7700 900123.";
  }
  return null;
}

export function validateOtp(code: string, length = 6): string | null {
  if (!new RegExp(`^\\d{${length}}$`).test(code.trim())) return `Enter the ${length}-digit code.`;
  return null;
}

/** Work-email domain for SAML SSO lookup ("you@acme.com" or "acme.com" → "acme.com"). */
export function ssoDomainFrom(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const domain = trimmed.includes("@") ? (trimmed.split("@").pop() ?? "") : trimmed;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain))
    return null;
  return domain;
}

export function initialsFrom(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
