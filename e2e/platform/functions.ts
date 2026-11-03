// In-memory browser adapter for production components; SQL authorization is tested separately.
const params = new URLSearchParams(location.search);
const companyId = "20000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
let rows: Record<string, unknown>[] = params.has("empty")
  ? []
  : [
      {
        id: "30000000-0000-4000-8000-000000000001",
        company_id: companyId,
        business: "Example Company",
        requester_id: userId,
        requester: "Support One",
        status: "active",
        reason: "Investigate posting metadata",
        expires_at: "2030-11-02T15:00:00Z",
        created_at: "2026-11-02T10:00:00Z",
        approval_id: "40000000-0000-4000-8000-000000000001",
        approver_id: "other",
      },
    ];
export async function getSupervisedSupport() {
  if (params.has("error")) throw new Error("Support permission denied");
  return params.has("unavailable") ? { ready: false, rows: [] } : { ready: true, rows };
}
export async function requestSupervisedSupport({
  data,
}: {
  data: { companyId: string; reason: string; minutes: number; requestId: string };
}) {
  if (params.has("reject")) throw new Error("That business already has break-glass access");
  rows = [
    {
      id: data.requestId,
      company_id: data.companyId,
      business: "Example Company",
      requester_id: userId,
      requester: "Support One",
      reason: data.reason,
      status: "pending",
      expires_at: new Date(Date.now() + data.minutes * 60000).toISOString(),
      created_at: new Date().toISOString(),
      approval_id: "new",
      approver_id: null,
    },
    ...rows,
  ];
  return data.requestId;
}
export async function revokeSupervisedSupport({ data }: { data: { id: string; reason: string } }) {
  rows = rows.map((row) => (row.id === data.id ? { ...row, status: "revoked" } : row));
}
let approvals = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    kind: params.has("unsupported") ? "refund" : "break_glass",
    status: "pending",
    requester_id: params.has("self") ? userId : "other",
    reason: "Investigate posting metadata",
    impact: { companyId, scope: "journal diagnostic headers", readOnly: true },
    expires_at: "2030-11-02T15:00:00Z",
  },
];
export async function listPlatformApprovals() {
  return { rows: approvals };
}
export async function decidePlatformApproval({ data }: { data: { id: string; decision: string } }) {
  approvals = approvals.filter((row) => row.id !== data.id);
  return { ok: true };
}
export async function setPlatformEntitlement() {
  return { pending: true };
}

export async function searchPlatform({ data }: { data: { query: string } }) {
  if (data.query === "blocked") throw new Error("Platform search permission denied");
  if (data.query === "missing") return [];
  return [
    { kind: "business", id: companyId, label: "Example Company" },
    { kind: "user", id: userId, label: "Example User" },
    { kind: "firm", id: "70000000-0000-4000-8000-000000000001", label: "Example Firm" },
  ];
}
export async function getPlatformRecord({ data }: { data: { resource: string; id: string } }) {
  if (params.has("recordError")) throw new Error("That platform record was not found");
  return {
    record: {
      id: data.id,
      name:
        data.resource === "businesses"
          ? "Example Company"
          : data.resource === "firms"
            ? "Example Firm"
            : "Example User",
    },
    related:
      data.resource === "businesses"
        ? {
            ...relatedRecord(),
            members: [{ user_id: userId, full_name: "Example User", role: "owner" }],
          }
        : data.resource === "users"
          ? { businesses: [{ company_id: companyId, name: "Example Company", role: "owner" }] }
          : { clients: [{ company_id: companyId, name: "Example Company", access_level: "view" }] },
  };
}
function relatedRecord() {
  return { subscription: null, events: null };
}
