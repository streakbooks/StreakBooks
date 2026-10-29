import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { captchaConfig, type CaptchaProvider } from "@/lib/auth-helpers";

type WidgetApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove?: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: WidgetApi;
    hcaptcha?: WidgetApi;
  }
}

const SCRIPTS: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
};

const loaders = new Map<CaptchaProvider, Promise<WidgetApi>>();

function loadProvider(provider: CaptchaProvider): Promise<WidgetApi> {
  const existing = loaders.get(provider);
  if (existing) return existing;
  const promise = new Promise<WidgetApi>((resolve, reject) => {
    const ready = () => window[provider];
    const current = ready();
    if (current) return resolve(current);
    const script = document.createElement("script");
    script.src = SCRIPTS[provider];
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = ready();
      if (api) resolve(api);
      else reject(new Error("Captcha failed to load"));
    };
    script.onerror = () => reject(new Error("Captcha failed to load"));
    document.head.appendChild(script);
  });
  promise.catch(() => loaders.delete(provider));
  loaders.set(provider, promise);
  return promise;
}

export type CaptchaHandle = { reset: () => void };

const CaptchaWidget = forwardRef<CaptchaHandle, { onToken: (token: string | null) => void }>(
  function CaptchaWidget({ onToken }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const apiRef = useRef<WidgetApi | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const [loadError, setLoadError] = useState(false);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (apiRef.current && widgetId.current) apiRef.current.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      if (!captchaConfig || !containerRef.current) return;
      const { provider, siteKey } = captchaConfig;
      let cancelled = false;
      loadProvider(provider)
        .then((api) => {
          if (cancelled || !containerRef.current) return;
          apiRef.current = api;
          widgetId.current = api.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token: string) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          });
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        });
      return () => {
        cancelled = true;
        if (apiRef.current?.remove && widgetId.current) apiRef.current.remove(widgetId.current);
        widgetId.current = null;
      };
    }, []);

    if (!captchaConfig) return null;
    return (
      <div className="space-y-1">
        <div ref={containerRef} className="min-h-[65px]" />
        {loadError ? (
          <p role="alert" className="text-xs text-destructive">
            The human verification check couldn&apos;t load. Disable blockers or refresh the page.
          </p>
        ) : null}
      </div>
    );
  },
);

/** Captcha tokens are single-use: call `reset()` after every auth request. */
export function useCaptcha() {
  const ref = useRef<CaptchaHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const enabled = captchaConfig !== null;
  const reset = useCallback(() => {
    setToken(null);
    ref.current?.reset();
  }, []);
  const widget = enabled ? <CaptchaWidget ref={ref} onToken={setToken} /> : null;
  return {
    enabled,
    widget,
    reset,
    /** Spread into Supabase auth call options. */
    options: token ? { captchaToken: token } : {},
    ready: !enabled || Boolean(token),
  };
}
