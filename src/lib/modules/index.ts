export type {
  ModuleDefinition,
  ModuleExperienceContract,
  ModulePageKind,
  ModuleSubnavItem,
  ModuleViewMode,
} from "@/lib/modules/types";
export {
  DEFAULT_AUTHENTICATED_EXPERIENCE,
  DEFAULT_PUBLIC_EXPERIENCE,
} from "@/lib/modules/types";
export {
  MODULE_REGISTRY,
  assertRegistryMatchesNav,
  getModuleById,
  getModuleByPath,
} from "@/lib/modules/registry";
export {
  consumeUnmappedStatuses,
  isKnownDomainStatus,
  peekUnmappedStatuses,
  registerDomainStatus,
  resolveDomainStatus,
  type DomainStatusDefinition,
} from "@/lib/modules/status-semantics";
