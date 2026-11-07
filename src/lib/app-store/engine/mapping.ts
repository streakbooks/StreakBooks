import type {
  AccountingMappingEngine,
  ExternalRecordLink,
  MappingDomain,
} from "@/lib/app-store/engine/types";

/**
 * In-memory mapping engine for unit tests and scaffolding.
 * Production uses durable DB tables + LinkBooks posting services.
 */
export function createMemoryMappingEngine(): AccountingMappingEngine {
  const links = new Map<string, ExternalRecordLink>();

  function key(input: {
    companyId: string;
    connectionId: string;
    domain: MappingDomain;
    externalId: string;
  }): string {
    return `${input.companyId}:${input.connectionId}:${input.domain}:${input.externalId}`;
  }

  return {
    async resolveAccount() {
      return null;
    },
    async resolveTax() {
      return null;
    },
    async linkExternalRecord(link) {
      links.set(
        key({
          companyId: link.companyId,
          connectionId: link.connectionId,
          domain: link.domain,
          externalId: link.externalId,
        }),
        link,
      );
    },
    async findExternalLink(input) {
      return links.get(key(input)) ?? null;
    },
  };
}

/** Domains required for e-commerce settlement workflows. */
export const ECOMMERCE_MAPPING_DOMAINS: readonly MappingDomain[] = [
  "account",
  "customer",
  "product",
  "tax_rate",
  "currency",
  "invoice",
  "payment",
  "inventory",
];
