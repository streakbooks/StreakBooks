export type Cell = string | number | boolean | null;

export type NonprofitRecord = {
  id: Cell;
  code: Cell;
  name: Cell;
  display_name: Cell;
  donor_kind: Cell;
  email: Cell;
  restriction: Cell;
  category: Cell;
  status: Cell;
  spendable_minor: Cell;
  donation_number: Cell;
  amount_minor: Cell;
  donated_on: Cell;
  pledge_number: Cell;
  collected_minor: Cell;
  impaired_minor: Cell;
  allocated_minor: Cell;
  award_minor: Cell;
  received_minor: Cell;
  recognised_minor: Cell;
  conditions_met: Cell;
  functional_class: Cell;
  rejection_reason: Cell;
  title: Cell;
  href: Cell;
  reason: Cell;
  target_minor: Cell;
  objective: Cell;
  eligibility_status: Cell;
  office: Cell;
  pack_id: Cell;
  due_on: Cell;
  receipt_number: Cell;
  wording: Cell;
  donation_id: Cell;
};

export type NonprofitSettings = {
  enabled: boolean;
  accounting_framework: string;
  country_code: string;
  account_map: { [role: string]: string };
  allow_unrestricted_deficit: boolean;
  enforce_segregation: boolean;
  gateway_configured: boolean;
};

export type NonprofitWorkspace = {
  settings: NonprofitSettings;
  funds: NonprofitRecord[];
  donors: NonprofitRecord[];
  donations: NonprofitRecord[];
  receipts: NonprofitRecord[];
  pledges: NonprofitRecord[];
  grants: NonprofitRecord[];
  expenses: NonprofitRecord[];
  campaigns: NonprofitRecord[];
  programmes: NonprofitRecord[];
  volunteers: NonprofitRecord[];
  memberships: NonprofitRecord[];
  beneficiaries: NonprofitRecord[] | null;
  disbursements: NonprofitRecord[] | null;
  board: NonprofitRecord[];
  compliance: NonprofitRecord[];
  actions: NonprofitRecord[];
};

export type NonprofitResult = {
  id: string | null;
  journal_id: string | null;
  status: string | null;
  replayed: boolean;
  reason: string | null;
  kind: string | null;
};

export type PortalEntry = {
  company_id: string;
  portal_role: string;
  donations: NonprofitRecord[];
};

const RECORD_KEYS = [
  "id",
  "code",
  "name",
  "display_name",
  "donor_kind",
  "email",
  "restriction",
  "category",
  "status",
  "spendable_minor",
  "donation_number",
  "amount_minor",
  "donated_on",
  "pledge_number",
  "collected_minor",
  "impaired_minor",
  "allocated_minor",
  "award_minor",
  "received_minor",
  "recognised_minor",
  "conditions_met",
  "functional_class",
  "rejection_reason",
  "title",
  "href",
  "reason",
  "target_minor",
  "objective",
  "eligibility_status",
  "office",
  "pack_id",
  "due_on",
  "receipt_number",
  "wording",
  "donation_id",
] as const satisfies readonly (keyof NonprofitRecord)[];

function pick(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as { [key: string]: unknown })[key];
}

function cell(value: unknown): Cell {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

export function mapNonprofitRecord(value: unknown): NonprofitRecord {
  const record = {} as NonprofitRecord;
  for (const key of RECORD_KEYS) record[key] = cell(pick(value, key));
  return record;
}

function mapList(value: unknown): NonprofitRecord[] {
  return Array.isArray(value) ? value.map(mapNonprofitRecord) : [];
}

export function mapNonprofitResult(value: unknown): NonprofitResult {
  const id = pick(value, "id");
  const journalId = pick(value, "journal_id");
  const status = pick(value, "status");
  const reason = pick(value, "reason");
  const kind = pick(value, "kind");
  return {
    id: typeof id === "string" ? id : null,
    journal_id: typeof journalId === "string" ? journalId : null,
    status: typeof status === "string" ? status : null,
    replayed: pick(value, "replayed") === true,
    reason: typeof reason === "string" ? reason : null,
    kind: typeof kind === "string" ? kind : null,
  };
}

export function mapNonprofitWorkspace(value: unknown): NonprofitWorkspace {
  const settings = pick(value, "settings");
  const accountMap = pick(settings, "account_map");
  const account_map: { [role: string]: string } = {};
  if (accountMap !== null && typeof accountMap === "object" && !Array.isArray(accountMap)) {
    for (const [role, accountId] of Object.entries(accountMap)) {
      if (typeof accountId === "string") account_map[role] = accountId;
    }
  }
  const framework = pick(settings, "accounting_framework");
  const country = pick(settings, "country_code");
  const beneficiaries = pick(value, "beneficiaries");
  const disbursements = pick(value, "disbursements");
  return {
    settings: {
      enabled: pick(settings, "enabled") === true,
      accounting_framework: typeof framework === "string" ? framework : "configurable",
      country_code: typeof country === "string" ? country : "",
      account_map,
      allow_unrestricted_deficit: pick(settings, "allow_unrestricted_deficit") === true,
      enforce_segregation: pick(settings, "enforce_segregation") === true,
      gateway_configured: pick(settings, "gateway_configured") === true,
    },
    funds: mapList(pick(value, "funds")),
    donors: mapList(pick(value, "donors")),
    donations: mapList(pick(value, "donations")),
    receipts: mapList(pick(value, "receipts")),
    pledges: mapList(pick(value, "pledges")),
    grants: mapList(pick(value, "grants")),
    expenses: mapList(pick(value, "expenses")),
    campaigns: mapList(pick(value, "campaigns")),
    programmes: mapList(pick(value, "programmes")),
    volunteers: mapList(pick(value, "volunteers")),
    memberships: mapList(pick(value, "memberships")),
    beneficiaries: beneficiaries == null ? null : mapList(beneficiaries),
    disbursements: disbursements == null ? null : mapList(disbursements),
    board: mapList(pick(value, "board")),
    compliance: mapList(pick(value, "compliance")),
    actions: mapList(pick(value, "actions")),
  };
}

export type NonprofitStatementTotals = {
  opening_net_assets_minor: number;
  support_minor: number;
  expenses_minor: number;
  transfers_minor: number;
  releases_minor: number;
  other_equity_minor: number;
  closing_net_assets_minor: number;
  spendable_minor: number;
};

export type NonprofitStatementLine = NonprofitStatementTotals & {
  fund_id: string;
  code: string;
  name: string;
  restriction: string;
  category: string;
  status: string;
};

export type NonprofitStatement = {
  statutory_filing: boolean;
  government_approved: boolean;
  wording: string;
  period_from: string;
  as_of: string;
  funds: NonprofitStatementLine[];
  totals: NonprofitStatementTotals;
};

const STATEMENT_WORDING =
  "This management report summarises tagged fund activity for the selected dates. It is not a government filing and it is not a statutory financial statement.";

function textOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function minorOf(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

function mapStatementTotals(value: unknown): NonprofitStatementTotals {
  return {
    opening_net_assets_minor: minorOf(pick(value, "opening_net_assets_minor")),
    support_minor: minorOf(pick(value, "support_minor")),
    expenses_minor: minorOf(pick(value, "expenses_minor")),
    transfers_minor: minorOf(pick(value, "transfers_minor")),
    releases_minor: minorOf(pick(value, "releases_minor")),
    other_equity_minor: minorOf(pick(value, "other_equity_minor")),
    closing_net_assets_minor: minorOf(pick(value, "closing_net_assets_minor")),
    spendable_minor: minorOf(pick(value, "spendable_minor")),
  };
}

export function mapNonprofitStatement(value: unknown): NonprofitStatement {
  const funds = pick(value, "funds");
  return {
    statutory_filing: pick(value, "statutory_filing") === true,
    government_approved: pick(value, "government_approved") === true,
    wording: textOf(pick(value, "wording"), STATEMENT_WORDING),
    period_from: textOf(pick(value, "period_from"), ""),
    as_of: textOf(pick(value, "as_of"), ""),
    funds: Array.isArray(funds)
      ? funds.map((fund) => ({
          fund_id: textOf(pick(fund, "fund_id"), ""),
          code: textOf(pick(fund, "code"), ""),
          name: textOf(pick(fund, "name"), ""),
          restriction: textOf(pick(fund, "restriction"), ""),
          category: textOf(pick(fund, "category"), ""),
          status: textOf(pick(fund, "status"), ""),
          ...mapStatementTotals(fund),
        }))
      : [],
    totals: mapStatementTotals(pick(value, "totals")),
  };
}

export type DonorStatementMoney = {
  currency_code: string;
  gross_minor: number;
  refunded_minor: number;
  net_minor: number;
  conditional_minor: number;
  fee_minor: number;
  journal_support_minor: number;
  reconciled: boolean;
};

export type DonorStatementBreakdown = {
  currency_code: string;
  net_minor: number;
  code: string;
  name: string;
};

export type DonorStatement = {
  statutory_filing: boolean;
  government_approved: boolean;
  tax_certificate: boolean;
  wording: string;
  period_from: string;
  as_of: string;
  statement_kind: string;
  organisation: {
    name: string;
    legal_name: string | null;
    country_code: string | null;
    letterhead: string | null;
    email: string | null;
    phone: string | null;
    logo_url: string | null;
  };
  donor: {
    donor_id: string;
    display_name: string;
    consent_status: string;
    email: string | null;
    anonymous: boolean;
  } | null;
  currencies: DonorStatementMoney[];
  funds: DonorStatementBreakdown[];
  campaigns: DonorStatementBreakdown[];
  pledges: {
    pledge_number: string;
    pledged_on: string;
    currency_code: string;
    amount_minor: number;
    collected_minor: number;
    impaired_minor: number;
    outstanding_minor: number;
    status: string;
    fund_code: string;
  }[];
  receipts: {
    receipt_number: string;
    issued_on: string;
    amount_minor: number;
    currency_code: string;
    donation_number: string;
    wording: string;
  }[];
  donors: { donor_id: string; display_name: string; currency_code: string; net_minor: number }[];
  services_not_recognised: number;
  delivery_status: string;
  run_id: string | null;
  history: {
    id: string;
    donor_id: string | null;
    period_from: string;
    as_of: string;
    statement_kind: string;
    delivery_status: string;
  }[];
};

const DONOR_STATEMENT_WORDING =
  "This donor statement lists contributions, refunds, receipts and outstanding pledges for the selected dates. It is not a government filing and it is not a tax certificate.";

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function mapNonprofitDonorStatement(value: unknown): DonorStatement {
  const organisation = pick(value, "organisation");
  const donor = pick(value, "donor");
  const currencies = pick(value, "currencies");
  const funds = pick(value, "funds");
  const campaigns = pick(value, "campaigns");
  const pledges = pick(value, "pledges");
  const receipts = pick(value, "receipts");
  const donors = pick(value, "donors");
  const history = pick(value, "history");
  const delivery = pick(value, "delivery_status") ?? pick(value, "email_delivery");
  return {
    statutory_filing: pick(value, "statutory_filing") === true,
    government_approved: pick(value, "government_approved") === true,
    tax_certificate: pick(value, "tax_certificate") === true,
    wording: textOf(pick(value, "wording"), DONOR_STATEMENT_WORDING),
    period_from: textOf(pick(value, "period_from"), ""),
    as_of: textOf(pick(value, "as_of"), ""),
    statement_kind: textOf(pick(value, "statement_kind"), "donor"),
    organisation: {
      name: textOf(pick(organisation, "name"), "Organisation"),
      legal_name: nullableText(pick(organisation, "legal_name")),
      country_code: nullableText(pick(organisation, "country_code")),
      letterhead: nullableText(pick(organisation, "letterhead")),
      email: nullableText(pick(organisation, "email")),
      phone: nullableText(pick(organisation, "phone")),
      logo_url: nullableText(pick(organisation, "logo_url")),
    },
    donor:
      donor === null || donor === undefined
        ? null
        : {
            donor_id: textOf(pick(donor, "donor_id"), ""),
            display_name: textOf(pick(donor, "display_name"), ""),
            consent_status: textOf(pick(donor, "consent_status"), "unknown"),
            email: nullableText(pick(donor, "email")),
            anonymous: pick(donor, "anonymous") === true,
          },
    currencies: Array.isArray(currencies)
      ? currencies.map((row) => ({
          currency_code: textOf(pick(row, "currency_code"), ""),
          gross_minor: minorOf(pick(row, "gross_minor")),
          refunded_minor: minorOf(pick(row, "refunded_minor")),
          net_minor: minorOf(pick(row, "net_minor")),
          conditional_minor: minorOf(pick(row, "conditional_minor")),
          fee_minor: minorOf(pick(row, "fee_minor")),
          journal_support_minor: minorOf(pick(row, "journal_support_minor")),
          reconciled: pick(row, "reconciled") === true,
        }))
      : [],
    funds: Array.isArray(funds)
      ? funds.map((row) => ({
          currency_code: textOf(pick(row, "currency_code"), ""),
          net_minor: minorOf(pick(row, "net_minor")),
          code: textOf(pick(row, "code"), ""),
          name: textOf(pick(row, "name"), ""),
        }))
      : [],
    campaigns: Array.isArray(campaigns)
      ? campaigns.map((row) => ({
          currency_code: textOf(pick(row, "currency_code"), ""),
          net_minor: minorOf(pick(row, "net_minor")),
          code: textOf(pick(row, "campaign_id"), ""),
          name: textOf(pick(row, "name"), "Unassigned"),
        }))
      : [],
    pledges: Array.isArray(pledges)
      ? pledges.map((row) => ({
          pledge_number: textOf(pick(row, "pledge_number"), ""),
          pledged_on: textOf(pick(row, "pledged_on"), ""),
          currency_code: textOf(pick(row, "currency_code"), ""),
          amount_minor: minorOf(pick(row, "amount_minor")),
          collected_minor: minorOf(pick(row, "collected_minor")),
          impaired_minor: minorOf(pick(row, "impaired_minor")),
          outstanding_minor: minorOf(pick(row, "outstanding_minor")),
          status: textOf(pick(row, "status"), ""),
          fund_code: textOf(pick(row, "fund_code"), ""),
        }))
      : [],
    receipts: Array.isArray(receipts)
      ? receipts.map((row) => ({
          receipt_number: textOf(pick(row, "receipt_number"), ""),
          issued_on: textOf(pick(row, "issued_on"), ""),
          amount_minor: minorOf(pick(row, "amount_minor")),
          currency_code: textOf(pick(row, "currency_code"), ""),
          donation_number: textOf(pick(row, "donation_number"), ""),
          wording: textOf(pick(row, "wording"), ""),
        }))
      : [],
    donors: Array.isArray(donors)
      ? donors.map((row) => ({
          donor_id: textOf(pick(row, "donor_id"), ""),
          display_name: textOf(pick(row, "display_name"), ""),
          currency_code: textOf(pick(row, "currency_code"), ""),
          net_minor: minorOf(pick(row, "net_minor")),
        }))
      : [],
    services_not_recognised: minorOf(pick(value, "services_not_recognised")),
    delivery_status: textOf(delivery, "not_configured"),
    run_id: nullableText(pick(value, "run_id")),
    history: Array.isArray(history)
      ? history.map((row) => ({
          id: textOf(pick(row, "id"), ""),
          donor_id: nullableText(pick(row, "donor_id")),
          period_from: textOf(pick(row, "period_from"), ""),
          as_of: textOf(pick(row, "as_of"), ""),
          statement_kind: textOf(pick(row, "statement_kind"), ""),
          delivery_status: textOf(pick(row, "delivery_status"), ""),
        }))
      : [],
  };
}

export type PortalDonorStatement = {
  company_id: string;
  donor_id: string;
  statement: DonorStatement;
};

export function mapPortalDonorStatements(value: unknown): PortalDonorStatement[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    company_id: textOf(pick(entry, "company_id"), ""),
    donor_id: textOf(pick(entry, "donor_id"), ""),
    statement: mapNonprofitDonorStatement(pick(entry, "statement")),
  }));
}

export function mapPortal(value: unknown): PortalEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const companyId = pick(entry, "company_id");
    const portalRole = pick(entry, "portal_role");
    return {
      company_id: typeof companyId === "string" ? companyId : "",
      portal_role: typeof portalRole === "string" ? portalRole : "",
      donations: mapList(pick(entry, "donations")),
    };
  });
}
