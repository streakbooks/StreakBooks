import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountLookup } from "@/components/lookup";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  EXPENSE_TRAVEL_MIGRATION,
  listExpensePerDiemRates,
  saveExpenseClaim,
  saveExpensePerDiemRate,
} from "@/lib/expenses/expenses.functions";
import {
  buildPerDiemClaimLine,
  calculatePerDiemNetMinor,
  inclusiveTravelDays,
  isPerDiemRateEffectiveOn,
  type ExpensePerDiemRate,
} from "@/lib/expenses/travel";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementTravelPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canSubmit = can("expenses.submit" as Permission);
  const canAdmin = can("expenses.admin" as Permission);
  const canView = canSubmit || canAdmin || can("expenses.view" as Permission);

  const [rateName, setRateName] = useState("Domestic overnight");
  const [rateLocation, setRateLocation] = useState("");
  const [rateAmount, setRateAmount] = useState("85.00");
  const [rateAccountId, setRateAccountId] = useState("");
  const [rateFrom, setRateFrom] = useState(today);

  const [tripStart, setTripStart] = useState(today);
  const [tripEnd, setTripEnd] = useState(today);
  const [tripRateId, setTripRateId] = useState("");
  const [tripDestination, setTripDestination] = useState("");

  const fetchRates = useServerFn(listExpensePerDiemRates);
  const fetchAccounts = useServerFn(listAccounts);
  const saveRate = useServerFn(saveExpensePerDiemRate);
  const saveClaim = useServerFn(saveExpenseClaim);

  const ratesQ = useQuery({
    queryKey: ["expense-per-diem-rates", company?.id],
    queryFn: () => fetchRates({ data: { companyId: company!.id, activeOnly: false } }),
    enabled: Boolean(company?.id) && canView,
  });

  const accountsQ = useQuery({
    queryKey: ["accounts", company?.id, "expense-travel"],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
  });

  const expenseAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) => account.is_active && account.is_postable && account.account_type === "expense",
      ),
    [accountsQ.data],
  );

  const activeRates = useMemo(
    () =>
      (ratesQ.data ?? []).filter(
        (rate) =>
          rate.isActive &&
          rate.currencyCode === currency &&
          isPerDiemRateEffectiveOn(rate, tripStart),
      ),
    [ratesQ.data, currency, tripStart],
  );

  const selectedRate = activeRates.find((r) => r.id === tripRateId) ?? null;

  const dayCount = useMemo(() => {
    try {
      return inclusiveTravelDays(tripStart, tripEnd);
    } catch {
      return null;
    }
  }, [tripStart, tripEnd]);

  const previewNet = useMemo(() => {
    if (!selectedRate || dayCount == null) return null;
    try {
      return calculatePerDiemNetMinor(dayCount, selectedRate.rateMinorPerDay);
    } catch {
      return null;
    }
  }, [selectedRate, dayCount]);

  const saveRateMut = useMutation({
    mutationFn: async () => {
      const rateMinor = Number(parseMinorOrThrow(rateAmount, "Rate per day"));
      return saveRate({
        data: {
          companyId: company!.id,
          draft: {
            name: rateName.trim(),
            locationLabel: rateLocation.trim() || null,
            rateMinorPerDay: rateMinor,
            currencyCode: currency,
            accountId: rateAccountId,
            effectiveFrom: rateFrom,
            isActive: true,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Per diem rate saved");
      await queryClient.invalidateQueries({
        queryKey: ["expense-per-diem-rates", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const createTripMut = useMutation({
    mutationFn: async () => {
      if (!selectedRate) throw new Error("Select an active per diem rate.");
      const line = buildPerDiemClaimLine({
        expenseDate: tripStart,
        travelStartDate: tripStart,
        travelEndDate: tripEnd,
        rate: selectedRate,
        destination: tripDestination,
      });
      return saveClaim({
        data: {
          companyId: company!.id,
          draft: {
            title: `Travel ${tripStart}–${tripEnd}`,
            description: line.description,
            claimDate: tripStart,
            claimCurrency: currency,
            paymentSource: "employee_paid",
            lines: [line],
          },
        },
      });
    },
    onSuccess: async (claim) => {
      toast.success(`Draft travel claim ${claim.claimNumber} created`);
      setTripDestination("");
      await queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title="Travel"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="travel" />}
      >
        <EmptyState
          title="No access"
          description="Your role cannot open travel or per diem rates."
        />
      </ListWorkspace>
    );
  }

  const migrationMissing =
    ratesQ.error && String(ratesQ.error.message ?? "").includes(EXPENSE_TRAVEL_MIGRATION);

  return (
    <ListWorkspace
      title="Travel"
      description="Configure per diem rates and create travel claim drafts."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/expense-management/$section" params={{ section: "my-expenses" }}>
            My expenses
          </Link>
        </Button>
      }
      subnav={<ExpenseManagementSubnav current="travel" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Per diem trips only in this release</AlertTitle>
        <AlertDescription>
          Booking integrations (flights, hotels, multi-leg itineraries) are not configured. Create
          per diem claim lines from company rates below.
        </AlertDescription>
      </Alert>

      {migrationMissing ? (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{EXPENSE_TRAVEL_MIGRATION}</AlertDescription>
        </Alert>
      ) : null}

      {ratesQ.isError && !migrationMissing ? (
        <QueryErrorState queries={[ratesQ]} title="Could not load per diem rates" />
      ) : null}

      {canAdmin && accountsQ.isError && accountsQ.data === undefined ? (
        <QueryErrorState queries={[accountsQ]} title="Could not load expense accounts" />
      ) : null}

      {canSubmit ? (
        <section className="mb-10 space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">New travel trip (per diem)</h2>
          <p className="text-sm text-muted-foreground">
            Creates a draft employee-paid claim with one per diem line. Inclusive calendar days ×
            daily rate.
          </p>
          {ratesQ.isError ? null : activeRates.length === 0 ? (
            <EmptyState
              title="No effective per diem rates"
              description={
                canAdmin
                  ? "Add an active rate below for this currency and trip start date."
                  : "Ask an expense admin to configure per diem rates."
              }
              action={
                canAdmin ? (
                  <Button
                    size="sm"
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("em-perdiem-rate")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    Add per diem rate
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="trip-start">Start date</Label>
                <Input
                  id="trip-start"
                  type="date"
                  value={tripStart}
                  onChange={(e) => setTripStart(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trip-end">End date</Label>
                <Input
                  id="trip-end"
                  type="date"
                  value={tripEnd}
                  onChange={(e) => setTripEnd(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Per diem rate</Label>
                <RecordLookupSelect value={tripRateId} onValueChange={setTripRateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select rate" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeRates.map((rate) => (
                      <SelectItem key={rate.id} value={rate.id}>
                        {rate.name}
                        {rate.locationLabel ? ` (${rate.locationLabel})` : ""} —{" "}
                        {fromMinorUnits(rate.rateMinorPerDay, rate.currencyCode)} / day
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trip-dest">Destination</Label>
                <Input
                  id="trip-dest"
                  value={tripDestination}
                  onChange={(e) => setTripDestination(e.target.value)}
                  placeholder="Optional override"
                />
              </div>
              <div className="grid gap-2">
                <Label>Days</Label>
                <p className="flex h-10 items-center text-sm">{dayCount ?? "—"}</p>
              </div>
              <div className="grid gap-2">
                <Label>Estimated amount</Label>
                <p className="flex h-10 items-center text-sm">
                  {previewNet == null ? "—" : fromMinorUnits(previewNet, currency)}
                </p>
              </div>
              <div className="md:col-span-2">
                <Button
                  onClick={() => createTripMut.mutate()}
                  disabled={createTripMut.isPending || !tripRateId || dayCount == null}
                >
                  {createTripMut.isPending ? "Creating…" : "Create draft claim"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {canAdmin ? (
        <section id="em-perdiem-rate" className="mb-10 space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Add per diem rate</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pd-name">Name</Label>
              <Input id="pd-name" value={rateName} onChange={(e) => setRateName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pd-loc">Location</Label>
              <Input
                id="pd-loc"
                value={rateLocation}
                onChange={(e) => setRateLocation(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pd-amount">Rate per day ({currency})</Label>
              <Input
                id="pd-amount"
                inputMode="decimal"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pd-from">Effective from</Label>
              <Input
                id="pd-from"
                type="date"
                value={rateFrom}
                onChange={(e) => setRateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>Expense account</Label>
              <AccountLookup
                companyId={company.id}
                accounts={expenseAccounts}
                value={rateAccountId}
                onChange={(next) => setRateAccountId(next ?? "")}
                allowClear
                disabled={saveRateMut.isPending}
                ariaLabel="Per diem expense account"
                purpose="posting"
              />
            </div>
            <div>
              <Button
                onClick={() => saveRateMut.mutate()}
                disabled={saveRateMut.isPending || !rateAccountId}
              >
                {saveRateMut.isPending ? "Saving…" : "Save rate"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configured rates</h2>
        {ratesQ.isLoading ? (
          <LoadingState />
        ) : ratesQ.isError ? null : (ratesQ.data ?? []).length === 0 ? (
          <EmptyState
            title="No per diem rates yet"
            description="Expense admins can add rates by location and effective period."
            action={
              canAdmin ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("em-perdiem-rate")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    document.getElementById("pd-name")?.focus();
                  }}
                >
                  Add per diem rate
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rate / day</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ratesQ.data as ExpensePerDiemRate[]).map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell>
                    <div className="font-medium">{rate.name}</div>
                    {rate.locationLabel ? (
                      <div className="text-xs text-muted-foreground">{rate.locationLabel}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{fromMinorUnits(rate.rateMinorPerDay, rate.currencyCode)}</TableCell>
                  <TableCell>
                    {rate.effectiveFrom}
                    {rate.effectiveTo ? ` → ${rate.effectiveTo}` : " onward"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rate.isActive ? "default" : "secondary"}>
                      {rate.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </ListWorkspace>
  );
}
