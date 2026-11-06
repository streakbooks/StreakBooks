import { notFound } from "@tanstack/react-router";
import { UUID_RE } from "@/lib/company-validation";

/** Reject malformed route params with the app not-found page instead of opaque server errors. */
export function requireRouteUuid(value: string): string {
  if (!UUID_RE.test(value)) throw notFound();
  return value;
}
