/**
 * Reusable integration engine contracts.
 * Connectors plug in without changing the core accounting engine.
 * Financial posting must go through existing LinkBooks posting services.
 */

export type SyncDirection = "inbound" | "outbound" | "bidirectional";

export type SyncJobStatus =
  "pending" | "running" | "succeeded" | "partial" | "failed" | "cancelled" | "dead_letter";

export type SyncJobTrigger = "manual" | "scheduled" | "webhook" | "install" | "retry";

export type MappingDomain =
  | "account"
  | "customer"
  | "supplier"
  | "product"
  | "tax_rate"
  | "currency"
  | "invoice"
  | "bill"
  | "journal"
  | "payment"
  | "inventory";

export type ExternalRecordLink = {
  companyId: string;
  connectionId: string;
  domain: MappingDomain;
  externalId: string;
  internalId: string;
  idempotencyKey: string;
};

export type SyncJobSpec = {
  id: string;
  companyId: string;
  connectionId: string;
  appCode: string;
  direction: SyncDirection;
  trigger: SyncJobTrigger;
  status: SyncJobStatus;
  cursor: string | null;
  correlationId: string;
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
  retryCount: number;
};

export type WebhookIngressEvent = {
  id: string;
  appCode: string;
  connectionId: string | null;
  companyId: string | null;
  providerEventId: string;
  signatureValid: boolean;
  payloadHash: string;
  receivedAt: string;
  processedAt: string | null;
  status: "received" | "verified" | "processed" | "rejected" | "retry";
};

export type IdempotencyDecision =
  { action: "process"; reason: "new" } | { action: "skip"; reason: "duplicate" | "already_posted" };

/**
 * Mapping engine interface — implementations call LinkBooks accounting services.
 * Never create a separate general ledger inside the App Store.
 */
export type AccountingMappingEngine = {
  resolveAccount(input: {
    companyId: string;
    connectionId: string;
    externalAccountCode: string;
  }): Promise<string | null>;
  resolveTax(input: {
    companyId: string;
    connectionId: string;
    externalTaxCode: string;
  }): Promise<string | null>;
  linkExternalRecord(link: ExternalRecordLink): Promise<void>;
  findExternalLink(input: {
    companyId: string;
    connectionId: string;
    domain: MappingDomain;
    externalId: string;
  }): Promise<ExternalRecordLink | null>;
};

export type ConnectorCapabilities = {
  directions: readonly SyncDirection[];
  supportsWebhooks: boolean;
  supportsScheduling: boolean;
  supportsHistoricalImport: boolean;
  mappingDomains: readonly MappingDomain[];
};
