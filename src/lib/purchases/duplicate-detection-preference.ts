import { purchasesConfigSchema } from "@/lib/settings/registry";

/** Invalid or unreadable settings keep the duplicate preflight enabled. */
export function purchaseDuplicateDetectionEnabled(document: unknown): boolean {
  const parsed = purchasesConfigSchema.safeParse(document ?? {});
  return parsed.success ? parsed.data.duplicate_detection : true;
}

export function shouldShowDuplicateSupplierBillWarning(
  enabled: boolean,
  isDuplicate: boolean,
): boolean {
  return enabled && isDuplicate;
}
