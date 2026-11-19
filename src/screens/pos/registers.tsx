import { LookupSelect } from "@/components/lookup/LookupSelect";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { PosNavigation } from "@/components/pos/PosNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  getPosWorkspace,
  createPosRegister,
  setPosLocationAccess,
  openPosSession,
  closePosSession,
} from "@/lib/pos/registers.functions";
import { recordPosCashMovement } from "@/lib/pos/cash-sale.functions";
import type { PosRecordCashMovementInput } from "@/lib/pos/cash-sale";
import {
  posCountFromDisplay,
  type PosWorkspace,
  type PosSessionCommand,
  type PosCreateRegisterInput,
  type PosLocationAccessInput,
} from "@/lib/pos/register-contracts";

const workspaceKey = (companyId: string) => ["pos-registers", companyId];
const selectStyle = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
function Failure({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {friendlyAuthError(error)}
    </p>
  ) : null;
}
export function PosRegistersScreen() {
  const context = useActiveCompany();
  const allowed = useCanDo("pos.view");
  if (context.isError) return <QueryErrorState queries={[context]} />;
  if (context.isPending) return <LoadingState />;
  if (!context.company)
    return (
      <CompanyEmptyState
        title="No organisation selected"
        description="Open a company to manage registers."
      />
    );
  if (!allowed)
    return (
      <EmptyState
        title="POS access required"
        description="Ask your administrator for POS view permission."
      />
    );
  return <RegistersWorkspace key={context.company.id} companyId={context.company.id} />;
}
function RegistersWorkspace({ companyId }: { companyId: string }) {
  const get = useServerFn(getPosWorkspace);
  const query = useQuery({
    queryKey: workspaceKey(companyId),
    queryFn: () => get({ data: { companyId } }),
    gcTime: 0,
  });
  return (
    <ListWorkspace
      title="Registers & sessions"
      description="Open and reconcile physical cash floats by location."
      subnav={<PosNavigation />}
    >
      <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        Opening float records cash already held; it does not create a transfer or journal. Cash sales
        increase expected drawer cash; controlled cash in/out adjusts the expected balance without
        posting a sale. Close only after physically counting to the expected cash amount shown for
        the session. A variance keeps the session open until an approved accounting adjustment is
        available.
      </p>
      <QueryErrorState queries={[query]} />
      {query.isPending ? (
        <LoadingState />
      ) : query.isSuccess ? (
        <RegisterContent companyId={companyId} workspace={query.data} />
      ) : null}
    </ListWorkspace>
  );
}
function RegisterContent({ companyId, workspace }: { companyId: string; workspace: PosWorkspace }) {
  return (
    <div className="space-y-6">
      {workspace.canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <RegisterSetup companyId={companyId} workspace={workspace} />
          <LocationAccess companyId={companyId} workspace={workspace} />
        </div>
      ) : null}
      {workspace.registers.length === 0 ? (
        <EmptyState
          title="No accessible registers"
          description="An administrator must create a register at an existing active location and grant cashier access."
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {workspace.registers.map((register) => {
          const session = workspace.openSessions.find((item) => item.register_id === register.id);
          return (
            <section
              key={register.id}
              aria-label={`${register.name} (${register.code})`}
              className="space-y-3 rounded-xl border border-border p-4"
            >
              <h2 className="text-lg font-semibold">{register.name}</h2>
              <p className="text-sm text-muted-foreground">
                {register.code} · {register.location_name}
              </p>
              {session ? (
                <>
                  <p>Open · {new Date(session.opened_at).toLocaleString()}</p>
                  <p>
                    Opening float: {session.currency_code}{" "}
                    {fromMinorUnits(BigInt(session.opening_float_minor), session.currency_code)}
                  </p>
                  <p>
                    Expected cash in drawer: {session.currency_code}{" "}
                    {fromMinorUnits(BigInt(session.expected_cash_minor), session.currency_code)}
                  </p>
                  {workspace.canAdjustCash ? (
                    <CashMovementForm
                      companyId={companyId}
                      sessionId={session.id}
                      currency={session.currency_code}
                    />
                  ) : null}
                  {workspace.canClose &&
                  (workspace.canManage || session.opened_by === workspace.userId) ? (
                    <SessionAction
                      key={session.id}
                      companyId={companyId}
                      targetId={session.id}
                      currency={session.currency_code}
                      mode="close"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      The opening cashier or an authorized supervisor must close this session.
                    </p>
                  )}
                </>
              ) : workspace.canOpen && register.is_active ? (
                <SessionAction
                  key={register.id}
                  companyId={companyId}
                  targetId={register.id}
                  currency={workspace.currency}
                  mode="open"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Opening requires an active register and register-open permission.
                </p>
              )}
            </section>
          );
        })}
      </div>
      {workspace.registers.length === 100 ? (
        <p>Showing the first 100 accessible registers.</p>
      ) : null}
      <section aria-label="Recent closed sessions" className="space-y-3">
        <h2 className="text-lg font-semibold">Recent closed sessions</h2>
        {workspace.recentSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No closed sessions at accessible registers.
          </p>
        ) : (
          <ul className="space-y-2">
            {workspace.recentSessions.map((session) => (
              <li key={session.id} className="rounded-lg border border-border p-3 text-sm">
                {workspace.registers.find((register) => register.id === session.register_id)?.name}{" "}
                · Closed {session.closed_at ? new Date(session.closed_at).toLocaleString() : ""} ·
                Counted {session.currency_code}{" "}
                {fromMinorUnits(BigInt(session.closing_count_minor ?? "0"), session.currency_code)}{" "}
                · Variance 0
              </li>
            ))}
          </ul>
        )}
        {workspace.recentSessions.length === 50 ? (
          <p className="text-sm text-muted-foreground">Showing the latest 50 closed sessions.</p>
        ) : null}
      </section>
    </div>
  );
}
function SessionAction({
  companyId,
  targetId,
  currency,
  mode,
}: {
  companyId: string;
  targetId: string;
  currency: string;
  mode: "open" | "close";
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const operation = useRef<{ payload: string; id: string } | null>(null);
  const open = useServerFn(openPosSession);
  const close = useServerFn(closePosSession);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: PosSessionCommand) => (mode === "open" ? open({ data }) : close({ data })),
    onSuccess: () => client.invalidateQueries({ queryKey: workspaceKey(companyId) }),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    try {
      const amountMinor = posCountFromDisplay(amount, currency);
      const payload = JSON.stringify([companyId, targetId, amountMinor, mode]);
      if (operation.current?.payload !== payload)
        operation.current = { payload, id: crypto.randomUUID() };
      setError(null);
      mutation.mutate({ companyId, targetId, operationId: operation.current.id, amountMinor });
    } catch (failure) {
      setError(failure);
    }
  }
  const label = mode === "open" ? "Opening float" : "Physical count";
  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor={`count-${targetId}`}>
        {label} ({currency})
      </Label>
      {mode === "close" ? (
        <p className="text-sm text-muted-foreground">
          Count all cash in the drawer and enter the total. It must match expected cash, not just
          the opening float.
        </p>
      ) : null}
      <Input
        id={`count-${targetId}`}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="decimal"
        required
        disabled={mutation.isPending}
        autoComplete="off"
      />
      <Failure error={error ?? (mutation.isError ? mutation.error : null)} />
      <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : mode === "open" ? "Open register" : "Close session"}
      </Button>
    </form>
  );
}
function CashMovementForm({
  companyId,
  sessionId,
  currency,
}: {
  companyId: string;
  sessionId: string;
  currency: string;
}) {
  const [kind, setKind] = useState<"cash_in" | "cash_out">("cash_in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const operation = useRef<{ payload: string; id: string } | null>(null);
  const record = useServerFn(recordPosCashMovement);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: PosRecordCashMovementInput) => record({ data }),
    onSuccess: () => {
      setAmount("");
      setNote("");
      operation.current = null;
      return client.invalidateQueries({ queryKey: workspaceKey(companyId) });
    },
  });
  return (
    <form
      className="space-y-2 rounded-lg border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        try {
          const amountMinor = posCountFromDisplay(amount, currency);
          const payload = JSON.stringify([companyId, sessionId, kind, amountMinor, note]);
          if (operation.current?.payload !== payload)
            operation.current = { payload, id: crypto.randomUUID() };
          setError(null);
          mutation.mutate({
            companyId,
            sessionId,
            operationId: operation.current.id,
            kind,
            amountMinor,
            ...(note.trim() ? { note: note.trim() } : {}),
          });
        } catch (failure) {
          setError(failure);
        }
      }}
    >
      <h3 className="font-medium">Cash in / out</h3>
      <div>
        <Label htmlFor={`movement-kind-${sessionId}`}>Movement</Label>
        <select
          id={`movement-kind-${sessionId}`}
          className={selectStyle}
          value={kind}
          onChange={(event) => setKind(event.target.value as "cash_in" | "cash_out")}
          disabled={mutation.isPending}
        >
          <option value="cash_in">Cash in</option>
          <option value="cash_out">Cash out</option>
        </select>
      </div>
      <div>
        <Label htmlFor={`movement-amount-${sessionId}`}>Amount ({currency})</Label>
        <Input
          id={`movement-amount-${sessionId}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          required
          disabled={mutation.isPending}
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor={`movement-note-${sessionId}`}>Note (optional)</Label>
        <Input
          id={`movement-note-${sessionId}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          disabled={mutation.isPending}
        />
      </div>
      <Failure error={error ?? (mutation.isError ? mutation.error : null)} />
      <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Record movement"}
      </Button>
      {mutation.isSuccess ? <p role="status">Expected cash updated.</p> : null}
    </form>
  );
}
function RegisterSetup({ companyId, workspace }: { companyId: string; workspace: PosWorkspace }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const operation = useRef<{ payload: string; id: string } | null>(null);
  const create = useServerFn(createPosRegister);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: PosCreateRegisterInput) => create({ data }),
    onSuccess: async () => {
      setCode("");
      setName("");
      operation.current = null;
      await client.invalidateQueries({ queryKey: workspaceKey(companyId) });
    },
  });
  return (
    <section aria-label="Register setup" className="space-y-3 rounded-xl border border-border p-4">
      <h2 className="text-lg font-semibold">Create register</h2>
      <p className="text-sm text-muted-foreground">
        Reuse physical locations from HR organization settings. Map an existing cash asset account;
        opening a session does not add funds to it.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (mutation.isPending) return;
          const payload = JSON.stringify([companyId, code, name, locationId, cashAccountId]);
          if (operation.current?.payload !== payload)
            operation.current = { payload, id: crypto.randomUUID() };
          mutation.mutate({
            companyId,
            registerId: operation.current.id,
            code,
            name,
            locationId,
            cashAccountId,
          });
        }}
      >
        <div>
          <Label htmlFor="register-code">Register code</Label>
          <Input
            id="register-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={40}
            required
            disabled={mutation.isPending}
          />
        </div>
        <div>
          <Label htmlFor="register-name">Register name</Label>
          <Input
            id="register-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            disabled={mutation.isPending}
          />
        </div>
        <div>
          <Label htmlFor="register-location">Location</Label>
          <LookupSelect
            id="register-location"
            ariaLabel="Location"
            value={locationId}
            onChange={setLocationId}
            options={workspace.locations.map((location) => ({
              id: location.id,
              label: `${location.name} (${location.code})`,
            }))}
            placeholder="Choose location"
            required
            disabled={mutation.isPending}
          />
        </div>
        <div>
          <Label htmlFor="register-account">Cash asset account</Label>
          <LookupSelect
            id="register-account"
            ariaLabel="Cash asset account"
            value={cashAccountId}
            onChange={setCashAccountId}
            options={workspace.cashAccounts.map((account) => ({
              id: account.id,
              label: `${account.code} · ${account.name}`,
            }))}
            placeholder="Choose account"
            required
            disabled={mutation.isPending}
          />
        </div>
        <Failure error={mutation.isError ? mutation.error : null} />
        <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create register"}
        </Button>
        {mutation.isSuccess ? <p role="status">Register created.</p> : null}
        {workspace.locations.length === 100 || workspace.cashAccounts.length === 500 ? (
          <p className="text-sm text-muted-foreground">
            Setup lists are limited to 100 locations and 500 eligible accounts.
          </p>
        ) : null}
      </form>
    </section>
  );
}
function LocationAccess({ companyId, workspace }: { companyId: string; workspace: PosWorkspace }) {
  const [locationId, setLocationId] = useState("");
  const [userId, setUserId] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const save = useServerFn(setPosLocationAccess);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: PosLocationAccessInput) => save({ data }),
    onSuccess: () => {
      setRevokeTarget(null);
      return client.invalidateQueries({ queryKey: workspaceKey(companyId) });
    },
  });
  return (
    <section
      aria-label="Cashier location access"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <h2 className="text-lg font-semibold">Cashier location access</h2>
      <p className="text-sm text-muted-foreground">
        Grant location access to an active company member. POS role permissions are also required.
        Member names require company member-view access.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) mutation.mutate({ companyId, locationId, userId, allowed });
        }}
      >
        <div>
          <Label htmlFor="access-location">Access location</Label>
          <LookupSelect
            id="access-location"
            ariaLabel="Access location"
            value={locationId}
            onChange={setLocationId}
            options={workspace.locations.map((location) => ({
              id: location.id,
              label: location.name,
            }))}
            placeholder="Choose location"
            required
            disabled={mutation.isPending}
          />
        </div>
        <div>
          <Label htmlFor="access-member">Company member</Label>
          <LookupSelect
            id="access-member"
            ariaLabel="Company member"
            value={userId}
            onChange={setUserId}
            options={workspace.members.map((member) => ({
              id: member.id,
              label: member.email ? `${member.name} (${member.email})` : member.name,
            }))}
            placeholder="Choose member"
            required
            disabled={mutation.isPending}
          />
        </div>
        <div>
          <Label htmlFor="access-action">Access action</Label>
          <select
            id="access-action"
            className={selectStyle}
            value={allowed ? "grant" : "revoke"}
            onChange={(e) => setAllowed(e.target.value === "grant")}
            disabled={mutation.isPending}
          >
            <option value="grant">Grant</option>
            <option value="revoke">Revoke</option>
          </select>
        </div>
        <Failure error={mutation.isError ? mutation.error : null} />
        <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save location access"}
        </Button>
        {mutation.isSuccess ? <p role="status">Location access updated.</p> : null}
      </form>
      {workspace.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Company member-view permission and an active member are required to select a cashier.
        </p>
      ) : null}
      <h3 className="font-medium">Current location grants</h3>
      {workspace.locationAccess.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cashier location grants.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {workspace.locationAccess.map((access) => {
            const target = `${access.location_id}:${access.user_id}`;
            const member =
              workspace.members.find((item) => item.id === access.user_id)?.name ??
              "Member not in current list";
            const location =
              workspace.locations.find((item) => item.id === access.location_id)?.name ??
              "Inactive location";
            return (
              <li key={target} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {member} · {location}
                </span>
                {revokeTarget === target ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">
                      Revoke this cashier's access to this location?
                    </span>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          companyId,
                          locationId: access.location_id,
                          userId: access.user_id,
                          allowed: false,
                        })
                      }
                    >
                      Confirm revoke
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => setRevokeTarget(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending}
                    aria-label={`Revoke location access for ${member} at ${location}`}
                    onClick={() => setRevokeTarget(target)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {workspace.members.length === 100 || workspace.locationAccess.length === 1000 ? (
        <p className="text-sm text-muted-foreground">
          Showing up to 100 active members and 1,000 grants.
        </p>
      ) : null}
    </section>
  );
}
