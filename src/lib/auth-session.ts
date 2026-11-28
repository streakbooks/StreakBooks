import { supabase } from "@/integrations/supabase/client";
import { safeRedirect, type OAuthProviderId } from "@/lib/auth-helpers";

const NEXT_KEY = "lb.auth.next";

/** OAuth, SSO and email-link round trips land here; must be in the Supabase redirect allow-list. */
export function authCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/** Keep the post-login destination across a full-page provider redirect. */
export function rememberNext(destination: string): void {
  try {
    window.sessionStorage.setItem(NEXT_KEY, safeRedirect(destination));
  } catch {
    // Storage can be unavailable (private mode); the callback falls back to "/".
  }
}

/** Remove a pending auth return path when an email-change request fails. */
export function clearNext(): void {
  try {
    window.sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Storage can be unavailable; this is only a navigation hint.
  }
}

export function takeNext(): string {
  try {
    const value = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    return safeRedirect(value);
  } catch {
    return "/";
  }
}

export type SignInMethodId = "password" | "email_link" | "phone" | "sso" | OAuthProviderId;

const LAST_METHOD_KEY = "lb.auth.lastMethod";
const PENDING_METHOD_KEY = "lb.auth.pendingMethod";

/** Device-local hint only ("Last used" badge); never used for authorisation. */
export function rememberLastMethod(method: SignInMethodId): void {
  try {
    window.localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // Non-essential.
  }
}

export function readLastMethod(): SignInMethodId | null {
  try {
    return (window.localStorage.getItem(LAST_METHOD_KEY) as SignInMethodId | null) ?? null;
  } catch {
    return null;
  }
}

/** Redirect-based methods only count once the callback confirms a session. */
export function rememberPendingMethod(method: SignInMethodId): void {
  try {
    window.sessionStorage.setItem(PENDING_METHOD_KEY, method);
  } catch {
    // Non-essential.
  }
}

export function commitPendingMethod(): void {
  try {
    const method = window.sessionStorage.getItem(PENDING_METHOD_KEY) as SignInMethodId | null;
    window.sessionStorage.removeItem(PENDING_METHOD_KEY);
    if (method) rememberLastMethod(method);
  } catch {
    // Non-essential.
  }
}

/** True when the user has a verified second factor but this session has not used it yet. */
export async function needsMfaStepUp(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}
