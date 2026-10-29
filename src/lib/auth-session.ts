import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/auth-helpers";

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

export function takeNext(): string {
  try {
    const value = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    return safeRedirect(value);
  } catch {
    return "/";
  }
}

/** True when the user has a verified second factor but this session has not used it yet. */
export async function needsMfaStepUp(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}
