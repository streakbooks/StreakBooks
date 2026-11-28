import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { donorStatementCsv, donorStatementPdf } from "@/lib/nonprofit/donor-statement";
import {
  addNonprofitHouseholdMember,
  createNonprofitCongregation,
  createNonprofitHousehold,
  createNonprofitRecord,
  getNonprofitHouseholdStatement,
  postNonprofitCollectionBatch,
  recordNonprofitAttendance,
  scheduleNonprofitVolunteer,
  setNonprofitOrganisationKind,
} from "@/lib/nonprofit/nonprofit.functions";
import { ORGANISATION_KINDS, organisationTerms } from "@/lib/nonprofit/terminology";
import type { HouseholdStatement, NonprofitRecord } from "@/lib/nonprofit/types";
import { toast } from "sonner";

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function useRefresh(companyId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["nonprofit-workspace", companyId] });
}

export function OrganisationKindForm({ companyId, kind }: { companyId: string; kind: string }) {
  const save = useServerFn(setNonprofitOrganisationKind);
  const refresh = useRefresh(companyId);
  const [next, setNext] = useState(kind);
  const mutation = useMutation({
    mutationFn: () => save({ data: { companyId, kind: next } }),
    onSuccess: async () => {
      toast.success("Organisation terminology saved");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="organisation-kind">Organisation type</Label>
        <select
          id="organisation-kind"
          className="h-10 rounded-md border bg-background px-2"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        >
          {/* lookup-fixed-enum: ngo, charity, church, temple, mosque, gurdwara, ministry, foundation */}
          {ORGANISATION_KINDS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <p className="self-end text-sm text-muted-foreground md:col-span-2">
        {organisationTerms(next).sections.donors}, {organisationTerms(next).sections.donations},{" "}
        {organisationTerms(next).sections.programmes}. This does not change the ledger accounts.
      </p>
      <Button type="submit" disabled={mutation.isPending}>
        Save organisation type
      </Button>
    </form>
  );
}

export function CollectionBatchForm({
  companyId,
  currency,
  donors,
  funds,
  collections,
}: {
  companyId: string;
  currency: string;
  donors: NonprofitRecord[];
  funds: NonprofitRecord[];
  collections: NonprofitRecord[];
}) {
  const save = useServerFn(postNonprofitCollectionBatch);
  const refresh = useRefresh(companyId);
  const [fundId, setFundId] = useState(text(funds[0]?.id));
  const [collectedOn, setCollectedOn] = useState("2026-11-28");
  const [givingKind, setGivingKind] = useState("tithe");
  const [donorId, setDonorId] = useState(text(donors[0]?.id));
  const [amount, setAmount] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [lines, setLines] = useState<
    { donorId: string; amountMinor: number; anonymous: boolean; label: string }[]
  >([]);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          fundId,
          congregationId: "",
          collectedOn,
          givingKind,
          currencyCode: currency,
          idempotencyKey: crypto.randomUUID(),
          lines: lines.map((line) => ({
            donorId: line.donorId,
            amountMinor: line.amountMinor,
            anonymous: line.anonymous,
          })),
        },
      }),
    onSuccess: async () => {
      toast.success("Collection posted to the ledger");
      setLines([]);
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection batch</CardTitle>
        <CardDescription>
          Each line posts through the existing donation journal. Anonymous lines omit the member.
          Card numbers are not collected.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm">
            Fund
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={fundId}
              onChange={(event) => setFundId(event.target.value)}
            >
              {/* lookup-fixed-enum: funds already loaded for this organisation */}
              {funds.map((fund) => (
                <option key={text(fund.id)} value={text(fund.id)}>
                  {text(fund.code)} {text(fund.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            Date
            <Input
              type="date"
              value={collectedOn}
              onChange={(event) => setCollectedOn(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Giving kind
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={givingKind}
              onChange={(event) => setGivingKind(event.target.value)}
            >
              <option value="tithe">Tithe</option>
              <option value="offering">Offering</option>
              <option value="special_collection">Special collection</option>
              <option value="donation">Donation</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-2 text-sm">
            Member
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={donorId}
              disabled={anonymous}
              onChange={(event) => setDonorId(event.target.value)}
            >
              {/* lookup-fixed-enum: members already loaded for this organisation */}
              {donors.map((donor) => (
                <option key={text(donor.id)} value={text(donor.id)}>
                  {text(donor.display_name)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            Amount
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
            />
            Anonymous
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const amountMinor = Number(toMinorUnits(amount, currency));
              if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
                toast.error("Enter an amount");
                return;
              }
              if (!anonymous && donorId === "") {
                toast.error("Choose a member or mark the line anonymous");
                return;
              }
              const donor = donors.find((item) => text(item.id) === donorId);
              setLines((current) => [
                ...current,
                {
                  donorId,
                  amountMinor,
                  anonymous,
                  label: anonymous ? "Anonymous" : text(donor?.display_name),
                },
              ]);
              setAmount("");
            }}
          >
            Add line
          </Button>
        </div>
        <ul className="text-sm">
          {lines.map((line, index) => (
            <li key={`${line.label}-${index}`}>
              {line.label}: {fromMinorUnits(line.amountMinor, currency)}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          disabled={lines.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Post collection
        </Button>
        <p className="text-sm text-muted-foreground">
          {collections.length === 0
            ? "No posted collections yet."
            : `${collections.length} posted collections.`}
        </p>
      </CardContent>
    </Card>
  );
}

export function RecurringGiftForm({
  companyId,
  currency,
  donors,
  funds,
}: {
  companyId: string;
  currency: string;
  donors: NonprofitRecord[];
  funds: NonprofitRecord[];
}) {
  const save = useServerFn(createNonprofitRecord);
  const refresh = useRefresh(companyId);
  const [donorId, setDonorId] = useState(text(donors[0]?.id));
  const [fundId, setFundId] = useState(text(funds[0]?.id));
  const [amount, setAmount] = useState("");
  const [nextOn, setNextOn] = useState("2026-12-06");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          kind: "recurring",
          payload: {
            donor_id: donorId,
            fund_id: fundId,
            amount_minor: Number(toMinorUnits(amount, currency)),
            method: "bank_transfer",
            next_on: nextOn,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Recurring gift saved. No card was charged and no journal was posted.");
      setAmount("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring giving</CardTitle>
        <CardDescription>
          Stores the pledge schedule only. It does not charge a card or post a journal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <select
            className="h-10 rounded-md border bg-background px-2"
            value={donorId}
            onChange={(event) => setDonorId(event.target.value)}
          >
            {/* lookup-fixed-enum: members already loaded for this organisation */}
            {donors.map((donor) => (
              <option key={text(donor.id)} value={text(donor.id)}>
                {text(donor.display_name)}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-2"
            value={fundId}
            onChange={(event) => setFundId(event.target.value)}
          >
            {/* lookup-fixed-enum: funds already loaded for this organisation */}
            {funds.map((fund) => (
              <option key={text(fund.id)} value={text(fund.id)}>
                {text(fund.code)}
              </option>
            ))}
          </select>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Amount"
            required
          />
          <Input
            type="date"
            value={nextOn}
            onChange={(event) => setNextOn(event.target.value)}
            required
          />
          <Button type="submit" disabled={mutation.isPending}>
            Save schedule
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function CongregationPanel({
  companyId,
  currency,
  organisationName,
  kind,
  donors,
  volunteers,
  events,
  congregations,
  households,
  schedules,
}: {
  companyId: string;
  currency: string;
  organisationName: string;
  kind: string;
  donors: NonprofitRecord[];
  volunteers: NonprofitRecord[];
  events: NonprofitRecord[];
  congregations: NonprofitRecord[];
  households: NonprofitRecord[];
  schedules: NonprofitRecord[];
}) {
  const terms = organisationTerms(kind);
  const refresh = useRefresh(companyId);
  const createCongregation = useServerFn(createNonprofitCongregation);
  const createHousehold = useServerFn(createNonprofitHousehold);
  const addMember = useServerFn(addNonprofitHouseholdMember);
  const createRecord = useServerFn(createNonprofitRecord);
  const recordAttendance = useServerFn(recordNonprofitAttendance);
  const schedule = useServerFn(scheduleNonprofitVolunteer);
  const fetchStatement = useServerFn(getNonprofitHouseholdStatement);
  const [congregationName, setCongregationName] = useState("");
  const [location, setLocation] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [householdId, setHouseholdId] = useState(text(households[0]?.id));
  const [donorId, setDonorId] = useState(text(donors[0]?.id));
  const [role, setRole] = useState("head");
  const [eventName, setEventName] = useState("");
  const [eventOn, setEventOn] = useState("2026-11-29");
  const [eventId, setEventId] = useState(text(events[0]?.id));
  const [volunteerId, setVolunteerId] = useState(text(volunteers[0]?.id));
  const [roleName, setRoleName] = useState("Usher");
  const [statement, setStatement] = useState<HouseholdStatement | null>(null);

  const congregation = useMutation({
    mutationFn: () => createCongregation({ data: { companyId, name: congregationName, location } }),
    onSuccess: async () => {
      toast.success("Congregation saved");
      setCongregationName("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const household = useMutation({
    mutationFn: () =>
      createHousehold({
        data: { companyId, name: householdName, congregationId: text(congregations[0]?.id) },
      }),
    onSuccess: async () => {
      toast.success(`${terms.household} saved`);
      setHouseholdName("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const member = useMutation({
    mutationFn: () => addMember({ data: { companyId, householdId, donorId, role } }),
    onSuccess: async () => {
      toast.success("Household member saved");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const event = useMutation({
    mutationFn: () =>
      createRecord({
        data: { companyId, kind: "event", payload: { name: eventName, event_on: eventOn } },
      }),
    onSuccess: async () => {
      toast.success("Event saved");
      setEventName("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const attendance = useMutation({
    mutationFn: () => recordAttendance({ data: { companyId, eventId, donorId, present: true } }),
    onSuccess: async () => {
      toast.success("Attendance saved");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const assignment = useMutation({
    mutationFn: () => schedule({ data: { companyId, volunteerId, eventId, roleName } }),
    onSuccess: async () => {
      toast.success("Volunteer scheduled");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const familyStatement = useQuery({
    queryKey: ["nonprofit-household-statement", companyId, householdId],
    queryFn: () =>
      fetchStatement({
        data: { companyId, householdId, from: "2026-01-01", asOf: "2026-12-31" },
      }),
    enabled: false,
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
          <CardDescription>
            Congregations and branches share this organisation's ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              congregation.mutate();
            }}
          >
            <Input
              value={congregationName}
              onChange={(formEvent) => setCongregationName(formEvent.target.value)}
              placeholder="Name"
              required
            />
            <Input
              value={location}
              onChange={(formEvent) => setLocation(formEvent.target.value)}
              placeholder="Location"
            />
            <Button type="submit" disabled={congregation.isPending}>
              Save congregation
            </Button>
          </form>
          <ul className="text-sm">
            {congregations.map((item) => (
              <li key={text(item.id)}>
                {text(item.name)} {text(item.location)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{terms.household} giving</CardTitle>
          <CardDescription>
            The family total adds each member's recognised gifts. It is not a tax certificate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              household.mutate();
            }}
          >
            <Input
              value={householdName}
              onChange={(formEvent) => setHouseholdName(formEvent.target.value)}
              placeholder={`${terms.household} name`}
              required
            />
            <Button type="submit" disabled={household.isPending}>
              Save {terms.household.toLowerCase()}
            </Button>
          </form>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              member.mutate();
            }}
          >
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={householdId}
              onChange={(formEvent) => setHouseholdId(formEvent.target.value)}
            >
              {/* lookup-fixed-enum: households already loaded for this organisation */}
              {households.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.name)}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={donorId}
              onChange={(formEvent) => setDonorId(formEvent.target.value)}
            >
              {/* lookup-fixed-enum: members already loaded for this organisation */}
              {donors.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.display_name)}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={role}
              onChange={(formEvent) => setRole(formEvent.target.value)}
            >
              <option value="head">Head</option>
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
            <Button type="submit" disabled={member.isPending || householdId === ""}>
              Add member
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            disabled={householdId === "" || familyStatement.isFetching}
            onClick={async () => {
              const result = await familyStatement.refetch();
              if (result.data) setStatement(result.data);
              if (result.error) toast.error(friendlyAuthError(result.error));
            }}
          >
            Build family statement
          </Button>
          {statement ? (
            <FamilyStatement
              organisationName={organisationName}
              currency={currency}
              statement={statement}
            />
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Attendance and volunteer schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              event.mutate();
            }}
          >
            <Input
              value={eventName}
              onChange={(formEvent) => setEventName(formEvent.target.value)}
              placeholder="Service or event"
              required
            />
            <Input
              type="date"
              value={eventOn}
              onChange={(formEvent) => setEventOn(formEvent.target.value)}
              required
            />
            <Button type="submit" disabled={event.isPending}>
              Save event
            </Button>
          </form>
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              attendance.mutate();
            }}
          >
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={eventId}
              onChange={(formEvent) => setEventId(formEvent.target.value)}
            >
              {/* lookup-fixed-enum: events already loaded for this organisation */}
              {events.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.name)} ({text(item.present_count)} present)
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={donorId}
              onChange={(formEvent) => setDonorId(formEvent.target.value)}
            >
              {/* lookup-fixed-enum: members already loaded for this organisation */}
              {donors.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.display_name)}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={attendance.isPending || eventId === ""}>
              Mark present
            </Button>
          </form>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              assignment.mutate();
            }}
          >
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={volunteerId}
              onChange={(formEvent) => setVolunteerId(formEvent.target.value)}
            >
              {/* lookup-fixed-enum: volunteers already loaded for this organisation */}
              {volunteers.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.display_name)}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-2"
              value={eventId}
              onChange={(formEvent) => setEventId(formEvent.target.value)}
            >
              {/* lookup-fixed-enum: events already loaded for this organisation */}
              {events.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.name)}
                </option>
              ))}
            </select>
            <Input
              value={roleName}
              onChange={(formEvent) => setRoleName(formEvent.target.value)}
              required
            />
            <Button
              type="submit"
              disabled={assignment.isPending || volunteerId === "" || eventId === ""}
            >
              Schedule
            </Button>
          </form>
          <ul className="text-sm">
            {schedules.map((item) => (
              <li key={text(item.id)}>
                {text(item.display_name)} — {text(item.name)} — {text(item.role)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function FamilyStatement({
  organisationName,
  currency,
  statement,
}: {
  organisationName: string;
  currency: string;
  statement: HouseholdStatement;
}) {
  const lines = statement.currencies.map((row) => ({
    label: "Recognised gifts",
    currency: row.currency_code,
    amountMinor: row.net_minor,
  }));
  const download = (filename: string, contents: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-2 text-sm">
      <p>{statement.wording}</p>
      <ul>
        {statement.members.map((member) => (
          <li key={member.donor_id}>
            {member.display_name}: {fromMinorUnits(member.net_minor, currency)}
          </li>
        ))}
      </ul>
      <p>
        Reconciled: {statement.currencies.every((row) => row.reconciled) ? "yes" : "no"}. Tax
        certificate: {statement.tax_certificate ? "yes" : "no"}.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            download(
              "family-statement.csv",
              donorStatementCsv({
                organisationName,
                donorName: statement.name,
                periodFrom: statement.period_from,
                asOf: statement.as_of,
                wording: statement.wording,
                lines,
              }),
              "text/csv",
            )
          }
        >
          Download CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            download(
              "family-statement.pdf",
              donorStatementPdf({
                organisationName,
                donorName: statement.name,
                periodFrom: statement.period_from,
                asOf: statement.as_of,
                wording: statement.wording,
                lines,
              }),
              "application/pdf",
            )
          }
        >
          Download PDF
        </Button>
      </div>
    </div>
  );
}
