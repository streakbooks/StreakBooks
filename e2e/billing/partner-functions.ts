// In-memory browser adapter for production components. It mirrors the refusals the database
// returns; the rules themselves are verified by tests/integration/billing-08-partners.sql.
const params = new URLSearchParams(location.search);
export const FIRM_ID = "60000000-0000-4000-8000-000000000001";
const VIEWER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const DISCLOSURE = {
  id: "50000000-0000-4000-8000-000000000002",
  title: "Partner disclosure",
  body: "Your adviser may be paid a commission by StreakBooks.",
  version: 1,
};

type Partner = Record<string, unknown> & { id: string; codes: Array<Record<string, unknown>> };

let attribution: Record<string, unknown> | null = null;
let codeSeq = 1;
const partners: Partner[] = params.has("approved")
  ? [
      {
        id: "70000000-0000-4000-8000-000000000001",
        name: "Sharma & Co",
        status: "approved",
        firmId: FIRM_ID,
        firmName: "Sharma & Co",
        role: "admin",
        codes: [
          { id: "c1", code: "AB12CD34EF56", status: "active", createdAt: "2026-11-01T00:00:00Z" },
        ],
        referrals: [
          {
            companyName: "Referred One",
            attributedAt: "2026-11-01T00:00:00Z",
            locked: true,
            status: "active",
          },
        ],
        balances: [
          {
            currency: "INR",
            pendingMinor: 0,
            availableMinor: 4233,
            inPayoutMinor: 0,
            paidOutMinor: 0,
          },
        ],
        entries: [
          {
            id: 2,
            type: "reversal",
            amountMinor: -4233,
            currency: "INR",
            basisMinor: null,
            availableAt: "2026-11-03T00:00:00Z",
            memo: "CN/IN/000001",
            createdAt: "2026-11-03T00:00:00Z",
            companyName: "Referred One",
          },
          {
            id: 1,
            type: "accrual",
            amountMinor: 8466,
            currency: "INR",
            basisMinor: 84661,
            availableAt: "2026-11-02T00:00:00Z",
            memo: "LB/IN/000001",
            createdAt: "2026-11-02T00:00:00Z",
            companyName: "Referred One",
          },
        ],
        payouts: [],
      },
    ]
  : [];

export async function getReferralStatus() {
  return {
    programOpen: !params.has("closed"),
    attribution,
    disclosure: params.has("closed") ? null : DISCLOSURE,
  };
}

export async function recordReferral({ data }: { data: { code: string; disclosureId: string } }) {
  if (data.disclosureId !== DISCLOSURE.id) throw new Error("Review the current partner disclosure");
  if (data.code !== "AB12CD34EF56") throw new Error("That referral code is not valid");
  attribution = {
    partnerName: "Sharma & Co",
    attributedAt: "2026-11-05T00:00:00Z",
    locked: false,
    status: "active",
  };
  return { result: "attributed", partnerName: "Sharma & Co" };
}

export async function getPartnerPortal() {
  return {
    program: {
      open: true,
      attributionModel: "last_touch",
      attributionWindowDays: 90,
      payoutsEnabled: false,
    },
    firms: [{ id: FIRM_ID, name: "Sharma & Co", applied: partners.length > 0 }],
    partners,
  };
}

export async function applyAsPartner({ data }: { data: { firmId: string; contactEmail: string } }) {
  const partner: Partner = {
    id: "70000000-0000-4000-8000-000000000009",
    name: "Sharma & Co",
    status: "pending",
    firmId: data.firmId,
    firmName: "Sharma & Co",
    contactEmail: data.contactEmail,
    role: "admin",
    codes: [],
    referrals: [],
    balances: [],
    entries: [],
    payouts: [],
  };
  partners.push(partner);
  return partner;
}

export async function createReferralCode({ data }: { data: { partnerId: string } }) {
  const partner = partners.find((item) => item.id === data.partnerId);
  if (!partner || partner["status"] !== "approved") {
    throw new Error("Referral codes are available once the partnership is approved");
  }
  const code = {
    id: `n${codeSeq}`,
    code: `NEWCODE0000${codeSeq++}`,
    status: "active",
    createdAt: "",
  };
  partner.codes.unshift(code);
  return code;
}

export async function disableReferralCode({ data }: { data: { codeId: string } }) {
  for (const partner of partners) {
    for (const code of partner.codes) if (code["id"] === data.codeId) code["status"] = "disabled";
  }
  return { ok: true };
}

const changes: Array<Record<string, unknown>> = [
  {
    id: "ch-other",
    change: { attributionWindowDays: 90 },
    reason: "Open the programme",
    status: "pending",
    requestedBy: OTHER,
    decidedBy: null,
    decisionReason: null,
    createdAt: "2026-11-04T00:00:00Z",
  },
];
const program = {
  attributionModel: "last_touch",
  attributionWindowDays: null as number | null,
  payoutsEnabled: false,
  regulatoryReviewReference: null as string | null,
  updatedAt: "2026-11-01T00:00:00Z",
};
const rules: Array<Record<string, unknown>> = [];

export async function getPartnerProgramAdmin() {
  return {
    program,
    changes,
    partners: [
      {
        id: "70000000-0000-4000-8000-000000000002",
        name: "Pending Partners LLP",
        status: "pending",
        countryCode: "IN",
        membershipReference: "ICAI 123456",
        verificationEvidence: null,
        referrals: 0,
        codes: 0,
        balances: [],
      },
    ],
    rules,
    payouts: [],
    viewer: VIEWER,
    payoutSwitchOn: false,
  };
}

export async function requestProgramChange({
  data,
}: {
  data: { change: Record<string, unknown>; reason: string };
}) {
  if (data.change["payoutsEnabled"] && !data.change["regulatoryReviewReference"]) {
    throw new Error("Record the regulatory review reference before enabling payouts");
  }
  changes.unshift({
    id: `ch-${changes.length}`,
    change: data.change,
    reason: data.reason,
    status: "pending",
    requestedBy: VIEWER,
    decidedBy: null,
    decisionReason: null,
    createdAt: "2026-11-05T00:00:00Z",
  });
  return { ok: true };
}

export async function decideProgramChange({
  data,
}: {
  data: { changeId: string; approve: boolean };
}) {
  const change = changes.find((item) => item["id"] === data.changeId);
  if (!change) throw new Error("Choose a pending change");
  if (change["requestedBy"] === VIEWER) {
    throw new Error("Another platform owner must decide a change you requested");
  }
  change["status"] = data.approve ? "applied" : "rejected";
  if (data.approve) Object.assign(program, change["change"] as Record<string, unknown>);
  return { ok: true };
}

export async function reviewPartner() {
  return { ok: true };
}
export async function addPartnerUser() {
  return { ok: true };
}
export async function saveCommissionRule({ data }: { data: Record<string, unknown> }) {
  const rule = { ...data, id: `r${rules.length + 1}`, status: "draft", createdBy: VIEWER };
  rules.push(rule);
  return rule;
}
export async function decideCommissionRule() {
  return { ok: true };
}
export async function requestPartnerPayout() {
  throw new Error("Partner payouts are switched off on this server");
}
export async function decidePartnerPayout() {
  return { ok: true };
}
export async function adjustPartnerCommission() {
  return { ok: true };
}
