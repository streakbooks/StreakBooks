import { createElement, useCallback, useRef, useState } from "react";
import { CaptchaWidget, type CaptchaHandle } from "@/components/auth/CaptchaWidget";
import { captchaConfig } from "@/lib/auth-helpers";

/** Captcha tokens are single-use: call `reset()` after every auth request. */
export function useCaptcha() {
  const ref = useRef<CaptchaHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const enabled = captchaConfig !== null;
  const reset = useCallback(() => {
    setToken(null);
    ref.current?.reset();
  }, []);
  const widget = enabled ? createElement(CaptchaWidget, { ref, onToken: setToken }) : null;
  return {
    enabled,
    widget,
    reset,
    /** Spread into Supabase auth call options. */
    options: token ? { captchaToken: token } : {},
    ready: !enabled || Boolean(token),
  };
}
