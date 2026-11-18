import type { AnchorHTMLAttributes } from "react";
declare global {
  interface Window {
    memoryFixture: {
      canCode: boolean;
      delay: number;
      failures: number;
      calls: Array<Record<string, unknown>>;
      preference: (enabled: boolean) => void;
      companyId: string;
      reset: () => void;
    };
  }
}
export const useCanDo = () => window.memoryFixture.canCode;
export const useServerFn = <T,>(fn: T) => fn;
export const friendlyAuthError = (error: Error) => error.message;
export function Link({
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; params?: unknown }) {
  const { to: _to, params: _params, ...rest } = props;
  return (
    <a {...rest} href="#posting">
      {children}
    </a>
  );
}
async function request(input: { data: Record<string, unknown> }) {
  window.memoryFixture.calls.push(input.data);
  await new Promise((r) => setTimeout(r, window.memoryFixture.delay));
  if (window.memoryFixture.failures > 0) {
    window.memoryFixture.failures--;
    throw new Error("Fixture evidence service unavailable");
  }
  if (input.data.companyId === window.memoryFixture.companyId) {
    if (typeof input.data.enabled === "boolean")
      window.memoryFixture.preference(input.data.enabled);
    if (input.data.operation === "reset") window.memoryFixture.reset();
  }
  return "fixture-result";
}
export const recordCodingFeedback = request;
export const setCodingMemoryPreference = request;
export const resetCodingMemoryPreference = (input: { data: Record<string, unknown> }) =>
  request({ data: { ...input.data, operation: "reset" } });
