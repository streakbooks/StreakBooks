/**
 * RouteExperienceContract / ModuleDefinition — permanent premium inheritance contract.
 * Router files remain the source of truth for routability; this registry classifies
 * every module so future screens inherit shell, tokens, states and checks by default.
 */

import type { NavGroup } from "@/lib/nav";

/** High-level page kinds used by scaffolds and acceptance checks. */
export type ModulePageKind =
  | "dashboard"
  | "list"
  | "record"
  | "form"
  | "wizard"
  | "report"
  | "settings"
  | "portal"
  | "public"
  | "tool";

/** View modes a module may opt into. Never force Kanban/calendar onto ledger screens. */
export type ModuleViewMode =
  "list" | "card" | "kanban" | "calendar" | "timeline" | "graph" | "pivot" | "mobile-card";

export type ModuleSubnavItem = {
  to: string;
  label: string;
  exact?: boolean;
  search?: Record<string, string>;
};

export type ModuleExperienceContract = {
  /** Required shared shell pieces for authenticated product pages. */
  usesAppShell: boolean;
  usesPageHeader: boolean;
  supportsThemes: boolean;
  supportsDensity: boolean;
  requiresNativeLinks: boolean;
  /** Fail-closed: scaffolded actions stay disabled until backends exist. */
  actionsFailClosed: boolean;
};

export type ModuleDefinition = {
  /** Stable unique id (kebab-case). Never rename casually — deep links depend on it. */
  id: string;
  label: string;
  description: string;
  /** Primary path as shown in the sidebar (no `/_authenticated` prefix). */
  path: string;
  group: NavGroup;
  /** Whether this module appears in the authenticated left nav. */
  inSidebar: boolean;
  pageKind: ModulePageKind;
  /** Nested destinations when the module owns a subnav or section strip. */
  subnav?: readonly ModuleSubnavItem[];
  /** Search-param tab keys when navigation is `?tab=` / `?section=` based. */
  tabKeys?: readonly string[];
  viewModes?: readonly ModuleViewMode[];
  /** Screen ownership root under src/screens (informational). */
  screenRoot?: string;
  featureFlag?: string;
  experience: ModuleExperienceContract;
  /** Honest coverage status for the premium program — not a DONE claim. */
  premiumStatus: "not-started" | "partial" | "in-progress" | "verified";
  notes?: string;
};

export const DEFAULT_AUTHENTICATED_EXPERIENCE: ModuleExperienceContract = {
  usesAppShell: true,
  usesPageHeader: true,
  supportsThemes: true,
  supportsDensity: true,
  requiresNativeLinks: true,
  actionsFailClosed: true,
};

export const DEFAULT_PUBLIC_EXPERIENCE: ModuleExperienceContract = {
  usesAppShell: false,
  usesPageHeader: true,
  supportsThemes: true,
  supportsDensity: false,
  requiresNativeLinks: true,
  actionsFailClosed: true,
};
