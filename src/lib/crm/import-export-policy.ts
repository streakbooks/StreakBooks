/** CRM import/export gate — permissions may exist; workflows stay fail-closed. */

export type CrmImportExportPolicy = {
  canImport: boolean;
  canExport: boolean;
  reason: string;
};

export function resolveCrmImportExportPolicy(input?: {
  backendReady?: boolean;
  hasImportPermission?: boolean;
  hasExportPermission?: boolean;
}): CrmImportExportPolicy {
  const backendReady = Boolean(input?.backendReady);
  const hasImportPermission = Boolean(input?.hasImportPermission);
  const hasExportPermission = Boolean(input?.hasExportPermission);
  if (!backendReady) {
    return {
      canImport: false,
      canExport: false,
      reason:
        "Import and export stay blocked until mapping, validation, and audit backends are ready. Permissions alone do not unlock destructive data moves.",
    };
  }
  return {
    canImport: hasImportPermission,
    canExport: hasExportPermission,
    reason: "Import/export backends are ready; actions follow permission grants.",
  };
}
