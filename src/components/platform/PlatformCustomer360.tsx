import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Row } from "@/lib/platform/catalog";
import { platformDate } from "@/lib/platform/support";
import { SupportRequestForm } from "./PlatformSupport";

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
function records(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Row => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}
export function PlatformRecordFields({ row }: { row: Row }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {Object.entries(row).map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="font-medium text-muted-foreground">{key.replaceAll("_", " ")}</dt>
          <dd className="break-words">
            {key.endsWith("_at") || key.endsWith("At") || key === "trialEnds"
              ? platformDate(value)
              : typeof value === "object" && value !== null
                ? JSON.stringify(value)
                : text(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function PlatformRelatedRecords({ related }: { related: Row }) {
  return (
    <div className="space-y-4">
      {Object.entries(related).map(([key, value]) => (
        <section key={key} className="space-y-2">
          <h3 className="font-semibold capitalize">{key.replaceAll("_", " ")}</h3>
          {Array.isArray(value) ? (
            <MetadataTable rows={records(value)} empty="No related records." />
          ) : typeof value === "object" && value !== null ? (
            <PlatformRecordFields row={value as Row} />
          ) : (
            <p className="text-sm">{text(value)}</p>
          )}
        </section>
      ))}
    </div>
  );
}
export function MetadataTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const columns = Object.keys(rows[0]!);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap border-b bg-muted p-3 font-medium">
                {column.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row["id"] ?? row["user_id"] ?? index)}>
              {columns.map((column) => (
                <td key={column} className="max-w-sm break-words border-b p-3">
                  {column.endsWith("_at") || column === "at"
                    ? platformDate(row[column])
                    : text(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function PlatformCustomer360({
  business,
  related,
  canRequestSupport,
}: {
  business: Row;
  related: Row;
  canRequestSupport: boolean;
}) {
  const [requesting, setRequesting] = useState(false);
  const subscription = related["subscription"];
  const members = records(related["members"]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Business account information · Times use your device time zone.
      </p>
      <Tabs defaultValue="summary">
        <TabsList className="flex h-auto flex-wrap justify-start" aria-label="Customer information">
          <TabsTrigger value="summary">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="activity">Billing activity</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-4">
          <PlatformRecordFields row={business} />
          {canRequestSupport ? (
            <Button
              variant="outline"
              onClick={() => setRequesting((value) => !value)}
              aria-expanded={requesting}
            >
              {requesting ? "Close support request" : "Request temporary support access"}
            </Button>
          ) : null}
          {requesting && canRequestSupport ? (
            <SupportRequestForm
              companyId={String(business["id"])}
              business={text(business["name"])}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="team" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {members.length} members shown, up to 100. This is not a total for larger teams.
          </p>
          <MetadataTable rows={members} empty="No memberships recorded for this business." />
        </TabsContent>
        <TabsContent value="subscription">
          {typeof subscription === "object" && subscription !== null ? (
            <PlatformRecordFields row={subscription as Row} />
          ) : (
            <p className="text-sm">No subscription is recorded for this business.</p>
          )}
        </TabsContent>
        <TabsContent value="activity" className="space-y-3">
          {related["events"] === null || related["events"] === undefined ? (
            <p className="text-sm">Billing activity requires billing view permission.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Latest 50 recorded provider events. These events do not establish an outstanding
                balance.
              </p>
              <MetadataTable
                rows={records(related["events"])}
                empty="No billing events recorded for this business."
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
