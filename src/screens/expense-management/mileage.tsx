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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  EXPENSE_MILEAGE_MIGRATION,
  listExpenseMileageRates,
  saveExpenseClaim,
  saveExpenseMileageRate,
} from "@/lib/expenses/expenses.functions";
import {
  buildMileageClaimLine,
  calculateMileageNetMinor,
  isMileageRateEffectiveOn,
  type ExpenseMileageRate,
} from "@/lib/expenses/mileage";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementMileagePage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canSubmit = can("expenses.submit" as Permission);
  const canAdmin = can("expenses.admin" as Permission);
  const canView = canSubmit || canAdmin || can("expenses.view" as Permission);

  const [rateName, setRateName] = useState("Standard car");
  const [rateUnit, setRateUnit] = useState<"km" | "mi">("km");
  const [rateAmount, setRateAmount] = useState("0.67");
  const [rateAccountId, setRateAccountId] = useState("");
  const [rateFrom, setRateFrom] = useState(today);

  const [tripDate, setTripDate] = useState(today);
  const [tripDistance, setTripDistance] = useState("");
  const [tripRateId, setTripRateId] = useState("");
  const [tripOrigin, setTripOrigin] = useState("");
  const [tripDestination, setTripDestination] = useState("");

  const fetchRates = useServerFn(listExpenseMileageRates);
  const fetchAccounts = useServerFn(listAccounts);
  const saveRate = useServerFn(saveExpenseMileageRate);
  const saveClaim = useServerFn(saveExpenseClaim);

  const ratesQ = useQuery({
    queryKey: ["expense-mileage-rates", company?.id],
    queryFn: () => fetchRates({ data: { companyId: company!.id, activeOnly: false } }),
    enabled: Boolean(company?.id) && canView,
  });

  const accountsQ = useQuery({
    queryKey: ["accounts", company?.id, "expense-mileage"],
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

  const activeRatesForTrip = useMemo(
    () =>
      (ratesQ.data ?? []).filter(
        (rate) =>
          rate.isActive &&
          rate.currencyCode === currency &&
          isMileageRateEffectiveOn(rate, tripDate),
      ),
    [ratesQ.data, currency, tripDate],
  );

  const selectedRate = activeRatesForTrip.find((r) => r.id === tripRateId) ?? null;

  const previewNet = useMemo(() => {
    if (!selectedRate || !tripDistance.trim()) return null;
    const distance = Number(tripDistance);
    if (!Number.isFinite(distance) || distance <= 0) return null;
    try {
      return calculateMileageNetMinor(distance, selectedRate.rateMinorPerUnit);
    } catch {
      return null;
    }
  }, [selectedRate, tripDistance]);

  const saveRateMut = useMutation({
    mutationFn: async () => {
      const rateMinor = Number(parseMinorOrThrow(rateAmount, "Rate per unit"));
      return saveRate({
        data: {
          companyId: company!.id,
          draft: {
            name: rateName.trim(),
            distanceUnit: rateUnit,
            rateMinorPerUnit: rateMinor,
            currencyCode: currency,
            accountId: rateAccountId,
            effectiveFrom: rateFrom,
            isActive: true,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Mileage rate saved");
      await queryClient.invalidateQueries({
        queryKey: ["expense-mileage-rates", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const createTripMut = useMutation({
    mutationFn: async () => {
      if (!selectedRate) throw new Error("Select an active mileage rate.");
      const distance = Number(tripDistance);
      if (!Number.isFinite(distance) || distance <= 0) {
        throw new Error("Enter a distance greater than zero.");
      }
      const line = buildMileageClaimLine({
        expenseDate: tripDate,
        distanceValue: distance,
        distanceUnit: selectedRate.distanceUnit,
        rate: selectedRate,
        origin: tripOrigin,
        destination: tripDestination,
      });
      return saveClaim({
        data: {
          companyId: company!.id,
          draft: {
            title: `Mileage ${tripDate}`,
            description: line.description,
            claimDate: tripDate,
            claimCurrency: currency,
            paymentSource: "employee_paid",
            lines: [line],
          },
        },
      });
    },
    onSuccess: async (claim) => {
      toast.success(`Draft mileage claim ${claim.claimNumber} created`);
      setTripDistance("");
      setTripOrigin("");
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
        title="Mileage"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="mileage" />}
      >
        <EmptyState title="No access" description="Your role cannot open mileage rates or trips." />
      </ListWorkspace>
    );
  }

  const migrationMissing =
    ratesQ.error && String(ratesQ.error.message ?? "").includes(EXPENSE_MILEAGE_MIGRATION);

  return (
    <ListWorkspace
      title="Mileage"
      description="Configure company rates and create mileage claim drafts."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/expense-management/$section" params={{ section: "my-expenses" }}>
            My expenses
          </Link>
        </Button>
      }
      subnav={<ExpenseManagementSubnav current="mileage" />}
    >
      {migrationMissing ? (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{EXPENSE_MILEAGE_MIGRATION}</AlertDescription>
        </Alert>
      ) : null}

      {ratesQ.isError && !migrationMissing ? (
        <QueryErrorState queries={[ratesQ]} title="Could not load mileage rates" />
      ) : null}

      {canAdmin && accountsQ.isError && accountsQ.data === undefined ? (
        <QueryErrorState queries={[accountsQ]} title="Could not load expense accounts" />
      ) : null}

      {canSubmit ? (
        <section className="mb-10 space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">New mileage trip</h2>
          <p className="text-sm text-muted-foreground">
            Creates a draft employee-paid claim with one mileage line. Submit and approve it through
            the normal claim workflow.
          </p>
          {ratesQ.isError ? null : !ratesQ.isSuccess ? null : activeRatesForTrip.length === 0 ? (
            <EmptyState
              title="No effective mileage rates"
              description={
                canAdmin
                  ? "Add an active rate below for this currency and date."
                  : "Ask an expense admin to configure mileage rates."
              }
              action={
                canAdmin ? (
                  <Button
                    size="sm"
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("em-mileage-rate")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    Add mileage rate
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="trip-date">Trip date</Label>
                <Input
                  id="trip-date"
                  type="date"
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Mileage rate</Label>
                <RecordLookupSelect value={tripRateId} onValueChange={setTripRateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select rate" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeRatesForTrip.map((rate) => (
                      <SelectItem key={rate.id} value={rate.id}>
                        {rate.name} — {fromMinorUnits(rate.rateMinorPerUnit, rate.currencyCode)} /{" "}
                        {rate.distanceUnit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trip-distance">
                  Distance ({selectedRate?.distanceUnit ?? "unit"})
                </Label>
                <Input
                  id="trip-distance"
                  inputMode="decimal"
                  value={tripDistance}
                  onChange={(e) => setTripDistance(e.target.value)}
                  placeholder="e.g. 42.5"
                />
              </div>
              <div className="grid gap-2">
                <Label>Estimated amount</Label>
                <p className="flex h-10 items-center text-sm">
                  {previewNet == null ? "—" : fromMinorUnits(previewNet, currency)}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trip-origin">From</Label>
                <Input
                  id="trip-origin"
                  value={tripOrigin}
                  onChange={(e) => setTripOrigin(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trip-dest">To</Label>
                <Input
                  id="trip-dest"
                  value={tripDestination}
                  onChange={(e) => setTripDestination(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  onClick={() => createTripMut.mutate()}
                  disabled={createTripMut.isPending || !tripRateId || !ratesQ.isSuccess}
                >
                  {createTripMut.isPending ? "Creating…" : "Create draft claim"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {canAdmin ? (
        <section id="em-mileage-rate" className="mb-10 space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Add mileage rate</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="rate-name">Name</Label>
              <Input
                id="rate-name"
                value={rateName}
                onChange={(e) => setRateName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rate-amount">Rate per unit ({currency})</Label>
              <Input
                id="rate-amount"
                inputMode="decimal"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Distance unit</Label>
              <Select value={rateUnit} onValueChange={(v) => setRateUnit(v as "km" | "mi")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="km">Kilometres</SelectItem>
                  <SelectItem value="mi">Miles</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rate-from">Effective from</Label>
              <Input
                id="rate-from"
                type="date"
                value={rateFrom}
                onChange={(e) => setRateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>Expense account</Label>
              {accountsQ.isError ? null : accountsQ.isSuccess ? (
                <AccountLookup
                  companyId={company.id}
                  accounts={expenseAccounts}
                  value={rateAccountId}
                  onChange={(next) => setRateAccountId(next ?? "")}
                  allowClear
                  disabled={saveRateMut.isPending}
                  ariaLabel="Mileage expense account"
                  purpose="posting"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Loading expense accounts…</p>
              )}
            </div>
            <div>
              <Button
                onClick={() => saveRateMut.mutate()}
                disabled={
                  saveRateMut.isPending ||
                  !rateAccountId ||
                  !accountsQ.isSuccess ||
                  accountsQ.isError
                }
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
        ) : ratesQ.isError ? null : !ratesQ.isSuccess ? (
          <LoadingState />
        ) : (ratesQ.data ?? []).length === 0 ? (
          <EmptyState
            title="No mileage rates yet"
            description="Expense admins can add rates for vehicles and periods."
            action={
              canAdmin ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("em-mileage-rate")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    document.getElementById("rate-name")?.focus();
                  }}
                >
                  Add mileage rate
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ratesQ.data as ExpenseMileageRate[]).map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell>
                    <div className="font-medium">{rate.name}</div>
                    {rate.vehicleClass ? (
                      <div className="text-xs text-muted-foreground">{rate.vehicleClass}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {fromMinorUnits(rate.rateMinorPerUnit, rate.currencyCode)} / {rate.distanceUnit}
                  </TableCell>
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
