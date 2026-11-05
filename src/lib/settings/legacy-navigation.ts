/** Protect all legacy Settings Centre drafts, including row-level document sequences. */
export function hasUnsavedLegacySettings(drafts: {
  organisation: boolean;
  localisation: boolean;
  branding: boolean;
  currencies: boolean;
  sequences: Record<string, boolean>;
}): boolean {
  return (
    drafts.organisation ||
    drafts.localisation ||
    drafts.branding ||
    drafts.currencies ||
    Object.values(drafts.sequences).some(Boolean)
  );
}
