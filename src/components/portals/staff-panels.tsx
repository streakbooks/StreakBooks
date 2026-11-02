import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format/format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  decideBankRequest,
  decideStaffSubmission,
  getPortalSettings,
  invitePortalUser,
  listBankRequests,
  listContactPortalAccess,
  listPortalAlerts,
  listPortalMessages,
  listStaffSubmissions,
  postPortalMessage,
  resolvePortalAlert,
  retryPortalPayment,
  revokePortalAccess,
  runPortalReminders,
  savePortalSettings,
} from "@/lib/portals/portals.functions";

type Row = Record<string, unknown>;
type Account = { id: string; code: string; name: string };
type Actor = { user_id: string; name: string; email: string; role: string };

export function PortalSettingsPanel({
  companyId,
  canEdit,
}: {
  companyId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getPortalSettings);
  const save = useServerFn(savePortalSettings);
  const remind = useServerFn(runPortalReminders);
  const fetchAlerts = useServerFn(listPortalAlerts);
  const resolve = useServerFn(resolvePortalAlert);
  const retry = useServerFn(retryPortalPayment);
  const query = useQuery({
    queryKey: ["portal-settings", companyId],
    queryFn: () => fetchSettings({ data: { companyId } }) as Promise<Row>,
  });
  const alerts = useQuery({
    queryKey: ["portal-alerts", companyId],
    queryFn: () => fetchAlerts({ data: { companyId } }) as Promise<Row[]>,
  });
  const settings = query.data;
  const [form, setForm] = useState<Row | null>(null);
  const current = form ?? settings ?? null;

  const persist = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          settlementAccountId: empty(current?.["settlement_account_id"]),
          settlementUserId: empty(current?.["settlement_user_id"]),
          feeExpenseAccountId: empty(current?.["fee_expense_account_id"]),
          defaultPurchaseAccountId: empty(current?.["default_purchase_account_id"]),
          allowSandbox: Boolean(current?.["allow_sandbox"]),
          requireMfa: Boolean(current?.["require_mfa"]),
          inviteDays: Number(current?.["invite_days"] ?? 14),
        },
      }),
    onSuccess: async () => {
      toast.success("Portal settings saved");
      setForm(null);
      await qc.invalidateQueries({ queryKey: ["portal-settings", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const reminders = useMutation({
    mutationFn: () => remind({ data: { companyId } }),
    onSuccess: (result) => {
      const outcome = result as { count: number; emailed: number };
      toast.success(
        `${outcome.count} portal reminder${outcome.count === 1 ? "" : "s"} recorded, ${outcome.emailed} emailed.`,
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError || !current)
    return (
      <ErrorState description={friendlyAuthError(query.error)} onRetry={() => query.refetch()} />
    );

  function set<K extends string>(key: K, value: unknown) {
    setForm({ ...(form ?? settings ?? {}), [key]: value });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Portal balances come from invoices, credit notes and posted receipts. Turn the feature on
        under Features before invitations or sign-in will succeed.
        {settings?.["enabled"]
          ? " Portals are on for this organisation."
          : " Portals are off for this organisation."}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <AccountSelect
          label="Settlement bank account"
          value={String(current["settlement_account_id"] ?? "")}
          accounts={(settings?.["bank_accounts"] as Account[]) ?? []}
          onChange={(value) => set("settlement_account_id", value)}
        />
        <label className="text-sm">
          Settlement user
          <RecordLookupSelect
            className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2"
            value={String(current["settlement_user_id"] ?? "")}
            onValueChange={(event) => set("settlement_user_id", event)}
            disabled={!canEdit}
          >
            <option value="">Not set</option>
            {((settings?.["actors"] as Actor[]) ?? []).map((actor) => (
              <option key={actor.user_id} value={actor.user_id}>
                {actor.name || actor.email} ({actor.role})
              </option>
            ))}
          </RecordLookupSelect>
        </label>
        <AccountSelect
          label="Card-fee expense account"
          value={String(current["fee_expense_account_id"] ?? "")}
          accounts={(settings?.["expense_accounts"] as Account[]) ?? []}
          onChange={(value) => set("fee_expense_account_id", value)}
        />
        <AccountSelect
          label="Default purchase account"
          value={String(current["default_purchase_account_id"] ?? "")}
          accounts={(settings?.["purchase_accounts"] as Account[]) ?? []}
          onChange={(value) => set("default_purchase_account_id", value)}
        />
        <label className="text-sm">
          Invitation life (days)
          <Input
            className="mt-1"
            type="number"
            min={1}
            max={90}
            value={String(current["invite_days"] ?? 14)}
            onChange={(event) => set("invite_days", event.target.value)}
            disabled={!canEdit}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(current["require_mfa"])}
          onChange={(event) => set("require_mfa", event.target.checked)}
          disabled={!canEdit}
        />
        Require an authenticator for new portal invitations
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(current["allow_sandbox"])}
          onChange={(event) => set("allow_sandbox", event.target.checked)}
          disabled={!canEdit}
        />
        Allow sandbox checkout when Stripe and Razorpay are not configured. A sandbox confirmation
        posts a real receipt and collects no card funds.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canEdit || persist.isPending} onClick={() => persist.mutate()}>
          Save portal settings
        </Button>
        <Button variant="outline" disabled={reminders.isPending} onClick={() => reminders.mutate()}>
          Send due payment reminders
        </Button>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">Payment alerts</h2>
        {alerts.isError ? (
          <ErrorState
            description={friendlyAuthError(alerts.error)}
            onRetry={() => alerts.refetch()}
          />
        ) : null}
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {(alerts.data ?? []).map((alert) => (
            <li
              key={String(alert["id"])}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
            >
              <span>
                {String(alert["message"])}{" "}
                {alert["amount_minor"]
                  ? `· ${formatMoney(Number(alert["amount_minor"]), String(alert["currency_code"] ?? "GBP"))}`
                  : ""}
              </span>
              <span className="flex gap-2">
                {alert["status"] === "captured_unposted" && alert["intent_id"] ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void retry({ data: { companyId, intentId: String(alert["intent_id"]) } })
                        .then(() =>
                          qc.invalidateQueries({ queryKey: ["portal-alerts", companyId] }),
                        )
                        .catch((error) => toast.error(friendlyAuthError(error)));
                    }}
                  >
                    Retry posting
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void resolve({ data: { companyId, alertId: String(alert["id"]) } })
                      .then(() => qc.invalidateQueries({ queryKey: ["portal-alerts", companyId] }))
                      .catch((error) => toast.error(friendlyAuthError(error)));
                  }}
                >
                  Resolve
                </Button>
              </span>
            </li>
          ))}
          {(alerts.data ?? []).length === 0 ? (
            <li className="px-3 py-6 text-muted-foreground">No open payment alerts.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

export function ContactPortalPanel({
  companyId,
  contactId,
  isCustomer,
  isSupplier,
}: {
  companyId: string;
  contactId: string;
  isCustomer: boolean;
  isSupplier: boolean;
}) {
  const qc = useQueryClient();
  const fetchAccess = useServerFn(listContactPortalAccess);
  const invite = useServerFn(invitePortalUser);
  const revoke = useServerFn(revokePortalAccess);
  const fetchMessages = useServerFn(listPortalMessages);
  const sendMessage = useServerFn(postPortalMessage);
  const [role, setRole] = useState<"customer" | "supplier">(isCustomer ? "customer" : "supplier");
  const [email, setEmail] = useState("");
  const [mfa, setMfa] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const access = useQuery({
    queryKey: ["portal-access-contact", companyId, contactId],
    queryFn: () => fetchAccess({ data: { companyId, contactId } }) as Promise<Row[]>,
  });
  const messages = useQuery({
    queryKey: ["portal-messages-staff", companyId, contactId],
    queryFn: () => fetchMessages({ data: { companyId, contactId } }) as Promise<Row[]>,
  });
  const sendInvite = useMutation({
    mutationFn: () => invite({ data: { companyId, contactId, role, email, mfaRequired: mfa } }),
    onSuccess: async (result) => {
      const outcome = result as { link: string; emailed: { sent: boolean; reason: string } };
      setLink(outcome.link);
      toast.success(
        outcome.emailed.sent
          ? "Invitation emailed"
          : "Invitation created. Copy the link; email was not sent.",
      );
      await qc.invalidateQueries({ queryKey: ["portal-access-contact", companyId, contactId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const message = useMutation({
    mutationFn: () => sendMessage({ data: { companyId, contactId, body } }),
    onSuccess: async () => {
      setBody("");
      await qc.invalidateQueries({ queryKey: ["portal-messages-staff", companyId, contactId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="space-y-6">
      <form
        className="max-w-lg space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          sendInvite.mutate();
        }}
      >
        <label className="block text-sm">
          Role
          <select
            className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2"
            value={role}
            onChange={(event) => setRole(event.target.value as "customer" | "supplier")}
          >
            {isCustomer ? <option value="customer">Customer</option> : null}
            {isSupplier ? <option value="supplier">Supplier</option> : null}
          </select>
        </label>
        <div>
          <Label htmlFor="portal-invite-email">Email</Label>
          <Input
            id="portal-invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Uses the contact email when blank"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mfa} onChange={(event) => setMfa(event.target.checked)} />
          Require an authenticator after they accept
        </label>
        <Button type="submit" disabled={sendInvite.isPending || (!isCustomer && !isSupplier)}>
          Create invitation
        </Button>
      </form>
      {link ? (
        <p className="break-all rounded-md border border-border p-3 text-sm">Shown once: {link}</p>
      ) : null}
      {access.isError ? (
        <ErrorState
          description={friendlyAuthError(access.error)}
          onRetry={() => access.refetch()}
        />
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {(access.data ?? []).map((row) => (
          <li
            key={String(row["membership_id"])}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
          >
            <span>
              {String(row["email"])} · {String(row["role"])} · {String(row["status"])}
            </span>
            {row["status"] !== "revoked" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void revoke({ data: { companyId, membershipId: String(row["membership_id"]) } })
                    .then(() =>
                      qc.invalidateQueries({
                        queryKey: ["portal-access-contact", companyId, contactId],
                      }),
                    )
                    .catch((error) => toast.error(friendlyAuthError(error)));
                }}
              >
                Revoke
              </Button>
            ) : null}
          </li>
        ))}
        {(access.data ?? []).length === 0 && !access.isPending ? (
          <li className="px-3 py-6 text-muted-foreground">No portal invitations.</li>
        ) : null}
      </ul>
      <section className="space-y-2">
        <h2 className="font-semibold">Messages</h2>
        <ul className="space-y-2 text-sm">
          {(messages.data ?? []).map((row) => (
            <li key={String(row["id"])} className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">{String(row["author_role"])}</p>
              <p>{String(row["body"])}</p>
            </li>
          ))}
        </ul>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            message.mutate();
          }}
        >
          <Label htmlFor="staff-portal-message">Reply</Label>
          <Textarea
            id="staff-portal-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button type="submit" disabled={message.isPending || !body.trim()}>
            Send
          </Button>
        </form>
      </section>
    </div>
  );
}

export function PortalInbox({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const fetchSubmissions = useServerFn(listStaffSubmissions);
  const decide = useServerFn(decideStaffSubmission);
  const fetchBanks = useServerFn(listBankRequests);
  const decideBank = useServerFn(decideBankRequest);
  const [reason, setReason] = useState<Record<string, string>>({});
  const submissions = useQuery({
    queryKey: ["portal-submissions", companyId],
    queryFn: () => fetchSubmissions({ data: { companyId } }) as Promise<Row[]>,
  });
  const banks = useQuery({
    queryKey: ["portal-banks", companyId],
    queryFn: () => fetchBanks({ data: { companyId } }) as Promise<Row[]>,
  });
  function refresh() {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["portal-submissions", companyId] }),
      qc.invalidateQueries({ queryKey: ["portal-banks", companyId] }),
    ]);
  }
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-semibold">Supplier submissions</h2>
        <p className="text-sm text-muted-foreground">
          Approving a bill creates an awaiting-approval bill. Approving a credit note creates a
          draft. Neither is posted until the usual authorise step.
        </p>
        {submissions.isError ? (
          <ErrorState
            description={friendlyAuthError(submissions.error)}
            onRetry={() => submissions.refetch()}
          />
        ) : null}
        <ul className="space-y-3">
          {(submissions.data ?? [])
            .filter((row) => row["status"] === "submitted")
            .map((row) => (
              <li key={String(row["id"])} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {String(row["contact_name"])} · {String(row["kind"])} ·{" "}
                  {String(row["supplier_reference"])}
                </p>
                <p>
                  {formatMoney(
                    Number(row["total_minor"] ?? 0),
                    String(row["currency_code"] ?? "GBP"),
                  )}
                </p>
                {row["order_number"] ? <p>Purchase order {String(row["order_number"])}</p> : null}
                {row["bill_id"] ? (
                  <Link
                    className="underline"
                    to="/purchases/bills/$billId"
                    params={{ billId: String(row["bill_id"]) }}
                  >
                    Open bill
                  </Link>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      void decide({
                        data: { companyId, submissionId: String(row["id"]), decision: "approve" },
                      })
                        .then(refresh)
                        .catch((error) => toast.error(friendlyAuthError(error)));
                    }}
                  >
                    Accept into drafts
                  </Button>
                  <Input
                    className="max-w-xs"
                    placeholder="Rejection reason"
                    value={reason[String(row["id"])] ?? ""}
                    onChange={(event) =>
                      setReason({ ...reason, [String(row["id"])]: event.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void decide({
                        data: {
                          companyId,
                          submissionId: String(row["id"]),
                          decision: "reject",
                          reason: reason[String(row["id"])] ?? "",
                        },
                      })
                        .then(refresh)
                        .catch((error) => toast.error(friendlyAuthError(error)));
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          {(submissions.data ?? []).filter((row) => row["status"] === "submitted").length === 0 &&
          !submissions.isPending ? (
            <li className="text-sm text-muted-foreground">No submissions are waiting.</li>
          ) : null}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Bank-detail changes</h2>
        <p className="text-sm text-muted-foreground">
          Accepting stores the details on the supplier. It does not move money.
        </p>
        {banks.isError ? (
          <ErrorState
            description={friendlyAuthError(banks.error)}
            onRetry={() => banks.refetch()}
          />
        ) : null}
        <ul className="space-y-3">
          {(banks.data ?? []).map((row) => (
            <li key={String(row["id"])} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{String(row["contact_name"])}</p>
              <p>
                {String(row["account_name"])} · {String(row["bank_name"])} ·{" "}
                {String(row["account_number"])} · {String(row["routing_code"])}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    void decideBank({
                      data: { companyId, requestId: String(row["id"]), decision: "approve" },
                    })
                      .then(refresh)
                      .catch((error) => toast.error(friendlyAuthError(error)));
                  }}
                >
                  Verify and save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void decideBank({
                      data: {
                        companyId,
                        requestId: String(row["id"]),
                        decision: "reject",
                        note: "Not verified",
                      },
                    })
                      .then(refresh)
                      .catch((error) => toast.error(friendlyAuthError(error)));
                  }}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AccountSelect({
  label,
  value,
  accounts,
  onChange,
}: {
  label: string;
  value: string;
  accounts: Account[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <RecordLookupSelect
        className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2"
        value={value}
        onValueChange={(event) => onChange(event)}
      >
        <option value="">Not set</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.code} — {account.name}
          </option>
        ))}
      </RecordLookupSelect>
    </label>
  );
}

function empty(value: unknown): string | null {
  const text = String(value ?? "");
  return text.length ? text : null;
}
