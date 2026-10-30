import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, CreditCard, Users, ShieldCheck, ScrollText, Settings2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader, LoadingState, ErrorState } from "@/components/common/states";
import {
  getPlatformAdminIdentity, getPlatformOverview, listPlatformOrganisations,
  listPlatformBilling, listPlatformAudit, listPlatformStaff,
  updatePlatformPlanVisibility, updatePlatformStaff,
  type PlatformPlan,
} from "@/lib/platform-admin/platform-admin.functions";
import { hasPlatformScope, type PlatformRole, type PlatformScope } from "@/lib/platform-admin/security";
import { friendlyAuthError } from "@/lib/auth-helpers";

export const Route = createFileRoute("/_authenticated/platform-admin")({
  head: () => ({ meta: [{ title: "Platform Control — LinkBooks" }] }),
  component: PlatformAdmin,
});

type Tab = "overview" | "organisations" | "billing" | "staff" | "audit";
const TAB_CONFIG: Array<{ id: Tab; label: string; scope: PlatformScope }> = [
  { id: "overview", label: "Overview", scope: "overview" },
  { id: "organisations", label: "Organisations", scope: "organisations" },
  { id: "billing", label: "Plans & billing", scope: "billing" },
  { id: "staff", label: "Platform staff", scope: "audit" },
  { id: "audit", label: "Audit trail", scope: "audit" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "—" : time.toLocaleString();
}
function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      minor / (["JPY", "KRW"].includes(currency) ? 1 : 100),
    );
  } catch {
    return currency + " " + String(minor);
  }
}
function RoleLabel({ role }: { role: PlatformRole }) {
  return <Badge variant="outline">{role.replace("platform_", "").toUpperCase()}</Badge>;
}
function Status({ value }: { value: string }) {
  return <Badge variant="outline">{value.replace(/_/g, " ")}</Badge>;
}
function Notice({ error }: { error: unknown }) {
  return <ErrorState title="Could not load platform information" description={friendlyAuthError(error)} />;
}

function PlatformAdmin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const loadIdentity = useServerFn(getPlatformAdminIdentity);
  const loadOverview = useServerFn(getPlatformOverview);
  const loadOrganisations = useServerFn(listPlatformOrganisations);
  const loadBilling = useServerFn(listPlatformBilling);
  const loadAudit = useServerFn(listPlatformAudit);
  const loadStaff = useServerFn(listPlatformStaff);
  const saveVisibility = useServerFn(updatePlatformPlanVisibility);
  const saveStaff = useServerFn(updatePlatformStaff);

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<PlatformPlan | null>(null);
  const [reason, setReason] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [staffRole, setStaffRole] = useState<"platform_finance" | "platform_support" | "remove">("platform_support");
  const [staffReason, setStaffReason] = useState("");

  const identity = useQuery({
    queryKey: ["platform-admin-identity"], queryFn: () => loadIdentity(), retry: false,
  });
  const role = identity.data?.role ?? null;
  const authorized = Boolean(role && identity.data?.mfaReady);
  const overview = useQuery({
    queryKey: ["platform-admin-overview"],
    queryFn: () => loadOverview(),
    enabled: authorized && tab === "overview",
    retry: false,
  });
  const organisations = useQuery({
    queryKey: ["platform-admin-organisations", page, search],
    queryFn: () => loadOrganisations({ data: { page, search } }),
    enabled: authorized && tab === "organisations",
    retry: false,
  });
  const billing = useQuery({
    queryKey: ["platform-admin-billing"], queryFn: () => loadBilling(),
    enabled: authorized && tab === "billing" && hasPlatformScope(role, "billing"),
    retry: false,
  });
  const staff = useQuery({
    queryKey: ["platform-admin-staff"], queryFn: () => loadStaff(),
    enabled: authorized && tab === "staff" && hasPlatformScope(role, "audit"),
    retry: false,
  });
  const audit = useQuery({
    queryKey: ["platform-admin-audit"], queryFn: () => loadAudit(),
    enabled: authorized && tab === "audit" && hasPlatformScope(role, "audit"),
    retry: false,
  });

  const visibilityMutation = useMutation({
    mutationFn: (input: { code: string; isPublic: boolean; reason: string }) =>
      saveVisibility({ data: input }),
    onSuccess: async () => {
      setSelectedPlan(null); setReason("");
      await queryClient.invalidateQueries({ queryKey: ["platform-admin-billing"] });
      toast.success("Plan visibility updated and audited");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const staffMutation = useMutation({
    mutationFn: (input: { userId: string; role: "platform_finance" | "platform_support" | null; reason: string }) =>
      saveStaff({ data: input }),
    onSuccess: async () => {
      setStaffUserId(""); setStaffReason("");
      await queryClient.invalidateQueries({ queryKey: ["platform-admin-staff"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-admin-audit"] });
      toast.success("Staff role updated and audited");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setSearch(searchDraft.trim());
  }

  if (identity.isPending) return <LoadingState />;
  if (identity.isError) return <Notice error={identity.error} />;
  if (!role) {
    return (
      <Alert variant="destructive">
        <ShieldCheck className="size-4" />
        <AlertTitle>Platform access denied</AlertTitle>
        <AlertDescription>
          This area is only for authorized LinkBooks platform staff. Company ownership does not grant access.
          <div className="mt-3"><Link to="/" className="underline">Return to accounting</Link></div>
        </AlertDescription>
      </Alert>
    );
  }
  if (!identity.data?.mfaReady) {
    return (
      <Alert>
        <ShieldCheck className="size-4" />
        <AlertTitle>Additional verification required</AlertTitle>
        <AlertDescription>
          Platform administration requires a verified MFA (AAL2) session. Enable two-step verification
          in your profile and complete the verification challenge before accessing platform data.
          <div className="mt-3"><Link to="/profile" className="underline">Open profile security</Link></div>
        </AlertDescription>
      </Alert>
    );
  }

  const tabs = TAB_CONFIG.filter((item) => hasPlatformScope(role, item.scope));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Control"
        description="LinkBooks operations across organisations. This console is separate from company accounting settings."
        actions={<RoleLabel role={role} />}
      />
      <div className="flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label="Platform administration">
        {tabs.map((item) => (
          <Button key={item.id} type="button" size="sm"
            variant={tab === item.id ? "default" : "outline"}
            role="tab" aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}>{item.label}</Button>
        ))}
      </div>

      {tab === "overview" ? (
        overview.isPending ? <LoadingState /> : overview.isError ? <Notice error={overview.error} /> : overview.data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                { label: "Organisations", value: overview.data.organisations, icon: Building2 },
                { label: "Non-demo organisations", value: overview.data.liveOrganisations, icon: Building2 },
                { label: "Registered profiles", value: overview.data.users, icon: Users },
                { label: "Active subscriptions", value: overview.data.activeSubscriptions, icon: CreditCard },
                { label: "Trial subscriptions", value: overview.data.trials, icon: Settings2 },
                { label: "Checkout attempts", value: overview.data.checkoutAttempts, icon: CreditCard },
              ].map((item) => (
                <Card key={item.label}><CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2"><item.icon className="size-4" />{item.label}</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{item.value.toLocaleString()}</CardTitle>
                </CardHeader></Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Live database counts as of {formatDate(overview.data.capturedAt)}.
              Checkout attempts are not revenue or confirmed payments.
            </p>
          </>
        ) : null
      ) : null}

      {tab === "organisations" ? (
        <Card><CardHeader><CardTitle>Organisations</CardTitle>
          <CardDescription>Search customer organisations and review the associated subscription without opening their ledgers.</CardDescription>
          <form onSubmit={submitSearch} className="flex flex-wrap gap-2">
            <Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search by organisation name" aria-label="Search organisations" className="max-w-sm" />
            <Button type="submit">Search</Button>
            <Button type="button" variant="outline" onClick={() => {
              setSearchDraft(""); setSearch(""); setPage(0);
            }}>Clear</Button>
          </form>
        </CardHeader><CardContent>
          {organisations.isPending ? <LoadingState /> : organisations.isError ? <Notice error={organisations.error} /> : (
            <>
              <div className="overflow-x-auto"><Table><TableHeader><TableRow>
                <TableHead>Organisation</TableHead><TableHead>Country / currency</TableHead>
                <TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead>
              </TableRow></TableHeader><TableBody>
                {organisations.data?.rows.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell><div className="font-medium">{company.name}</div>
                      <div className="text-xs text-muted-foreground">{company.id}</div>
                      {company.is_demo ? <Badge variant="outline">Demo</Badge> : null}
                    </TableCell>
                    <TableCell>{company.country_code} / {company.base_currency}</TableCell>
                    <TableCell>{company.subscription?.plan_code ?? "None"}</TableCell>
                    <TableCell><Status value={company.archived_at ? "archived" : company.subscription?.status ?? "unsubscribed"} /></TableCell>
                    <TableCell>{formatDate(company.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table></div>
              {organisations.data?.rows.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No organisations match your search.</p> : null}
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{(organisations.data?.count ?? 0).toLocaleString()} matching organisations</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={(page + 1) * 25 >= (organisations.data?.count ?? 0)}
                    onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent></Card>
      ) : null}

      {tab === "billing" && hasPlatformScope(role, "billing") ? (
        billing.isPending ? <LoadingState /> : billing.isError ? <Notice error={billing.error} /> : billing.data ? (
          <div className="space-y-6">
            <Card><CardHeader><CardTitle>Plan catalogue</CardTitle>
              <CardDescription>Visibility affects customer-facing plan discovery. Existing subscriptions are not cancelled. Only platform owners can change visibility.</CardDescription>
            </CardHeader><CardContent><div className="overflow-x-auto">
              <Table><TableHeader><TableRow>
                <TableHead>Plan</TableHead><TableHead>USD / month</TableHead><TableHead>Seats</TableHead>
                <TableHead>Available</TableHead><TableHead>Public</TableHead><TableHead>Action</TableHead>
              </TableRow></TableHeader><TableBody>
                {billing.data.plans.map((plan) => (
                  <TableRow key={plan.code}>
                    <TableCell><div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-muted-foreground">{plan.code}</div></TableCell>
                    <TableCell>{money(plan.monthly_usd, "USD")}</TableCell>
                    <TableCell>{plan.users_included}</TableCell>
                    <TableCell><Status value={plan.is_active ? "active" : "inactive"} /></TableCell>
                    <TableCell><Status value={plan.is_public ? "public" : "hidden"} /></TableCell>
                    <TableCell>{role === "platform_owner" ? (
                      <Button size="sm" variant="outline" disabled={!plan.is_active && !plan.is_public}
                        onClick={() => { setSelectedPlan(plan); setReason(""); }}>
                        {plan.is_public ? "Hide plan" : "Publish plan"}
                      </Button>
                    ) : "Read only"}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </div></CardContent></Card>
            {selectedPlan && role === "platform_owner" ? (
              <Card><CardHeader><CardTitle>Confirm plan visibility change</CardTitle>
                <CardDescription>{selectedPlan.name} will be {selectedPlan.is_public ? "hidden" : "published"} in the legacy catalogue. This does not change active provider subscriptions or versioned prices.</CardDescription>
              </CardHeader><CardContent className="space-y-3">
                <label htmlFor="plan-reason" className="text-sm font-medium">Audit reason (required)</label>
                <Input id="plan-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the business reason for this change" maxLength={500}/>
                <div className="flex gap-2">
                  <Button disabled={reason.trim().length < 12 || visibilityMutation.isPending}
                    onClick={() => visibilityMutation.mutate({ code: selectedPlan.code, isPublic: !selectedPlan.is_public, reason })}>
                    Confirm and audit
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedPlan(null)}>Cancel</Button>
                </div>
              </CardContent></Card>
            ) : null}
            <Card><CardHeader><CardTitle>Recent checkout attempts</CardTitle>
              <CardDescription>Gateway checkout status, not recognized revenue. Latest 75 records.</CardDescription>
            </CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow>
              <TableHead>Time</TableHead><TableHead>Organisation ID</TableHead><TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader><TableBody>
              {billing.data.checkouts.map((item) => (
                <TableRow key={item.id}><TableCell>{formatDate(item.created_at)}</TableCell>
                  <TableCell className="text-xs">{item.company_id}</TableCell>
                  <TableCell>{item.plan_code} / {item.billing_interval}</TableCell>
                  <TableCell>{money(item.unit_amount_minor, item.currency)}</TableCell>
                  <TableCell>{item.provider}</TableCell><TableCell><Status value={item.status}/></TableCell>
                </TableRow>
              ))}
            </TableBody></Table></div>
              {billing.data.checkouts.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No checkout attempts recorded.</p> : null}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Recent payment events</CardTitle>
              <CardDescription>Webhook event metadata. Latest 50 records; no card details are displayed.</CardDescription>
            </CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow>
              <TableHead>Time</TableHead><TableHead>Provider</TableHead>
              <TableHead>Event</TableHead><TableHead>Organisation ID</TableHead>
            </TableRow></TableHeader><TableBody>
              {billing.data.events.map((item) => <TableRow key={item.id}>
                <TableCell>{formatDate(item.created_at)}</TableCell><TableCell>{item.provider}</TableCell>
                <TableCell>{item.event_type}</TableCell><TableCell className="text-xs">{item.company_id ?? "—"}</TableCell>
              </TableRow>)}
            </TableBody></Table></div>
              {billing.data.events.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No payment webhook events recorded.</p> : null}
            </CardContent></Card>
          </div>
        ) : null
      ) : null}

      {tab === "staff" && hasPlatformScope(role, "audit") ? (
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Platform staff access</CardTitle>
            <CardDescription>Platform roles are not organisation roles. Platform owner promotion is intentionally restricted to privileged provisioning.</CardDescription>
          </CardHeader><CardContent>
            {staff.isPending ? <LoadingState /> : staff.isError ? <Notice error={staff.error} /> : (
              <Table><TableHeader><TableRow><TableHead>User ID</TableHead><TableHead>Platform role</TableHead><TableHead>Granted</TableHead></TableRow></TableHeader><TableBody>
                {staff.data?.map((item) => <TableRow key={item.user_id}>
                  <TableCell className="text-xs">{item.user_id}</TableCell>
                  <TableCell><RoleLabel role={item.role}/></TableCell><TableCell>{formatDate(item.created_at)}</TableCell>
                </TableRow>)}
              </TableBody></Table>
            )}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Assign or revoke a staff role</CardTitle>
            <CardDescription>Enter an existing Supabase Auth user ID. This form cannot grant the platform owner role or change your own role.</CardDescription>
          </CardHeader><CardContent className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="staff-user">Existing user UUID</label>
            <Input id="staff-user" value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} placeholder="User ID"/>
            <label className="block text-sm font-medium" htmlFor="staff-role">Assignment</label>
            <select id="staff-role" value={staffRole} onChange={(e) => setStaffRole(e.target.value as typeof staffRole)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="platform_support">Support (organisation overview)</option>
              <option value="platform_finance">Finance (organisations and billing)</option>
              <option value="remove">Revoke platform staff access</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="staff-reason">Audit reason</label>
            <Input id="staff-reason" value={staffReason} onChange={(e) => setStaffReason(e.target.value)}
              maxLength={500} placeholder="Reason for granting or revoking access"/>
            <Button disabled={staffMutation.isPending || staffReason.trim().length < 12 ||
              !/^[0-9a-f-]{36}$/i.test(staffUserId)} onClick={() => staffMutation.mutate({
              userId: staffUserId, role: staffRole === "remove" ? null : staffRole, reason: staffReason,
            })}>
              Save staff assignment
            </Button>
          </CardContent></Card>
        </div>
      ) : null}

      {tab === "audit" && hasPlatformScope(role, "audit") ? (
        <Card><CardHeader><CardTitle>Platform change log</CardTitle>
          <CardDescription>Recent audited platform changes, newest first.</CardDescription>
        </CardHeader><CardContent>{audit.isPending ? <LoadingState /> : audit.isError ? <Notice error={audit.error} /> : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Action</TableHead>
            <TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>Reason</TableHead>
          </TableRow></TableHeader><TableBody>
            {audit.data?.map((item) => <TableRow key={item.id}>
              <TableCell>{formatDate(item.created_at)}</TableCell><TableCell>{item.action}</TableCell>
              <TableCell>{item.entity_type}: {item.entity_id}</TableCell>
              <TableCell className="text-xs">{item.actor_user_id ?? "System"}</TableCell>
              <TableCell className="max-w-xs break-words">{item.reason ?? "—"}</TableCell>
            </TableRow>)}
          </TableBody></Table></div>
        )}{audit.data?.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No platform changes recorded.</p> : null}
        </CardContent></Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck className="size-4" /> Server-verified role, MFA and database-enforced authorisation</span>
        <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["platform-admin"] })}>
          <RefreshCw className="mr-2 size-4" /> Refresh data
        </Button>
      </div>
    </div>
  );
}
