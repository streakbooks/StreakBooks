import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { EmptyState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useCan } from "@/hooks/use-can";
import {
  buildIntegrationRegister,
  countRegisterByStatus,
  INTEGRATION_CATEGORY_GROUPS,
  INTEGRATION_REGISTER_STATUSES,
} from "@/lib/app-store/integration-register";
import type { Permission } from "@/lib/permissions";

export function AppStoreRegisterPage() {
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [group, setGroup] = useState<string>("all");

  const entries = useMemo(() => buildIntegrationRegister(), []);
  const counts = useMemo(() => countRegisterByStatus(entries), [entries]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (status !== "all" && entry.registerStatus !== status) return false;
      if (group !== "all" && !entry.categoryGroups.includes(group as never)) return false;
      if (!q) return true;
      return `${entry.name} ${entry.code} ${entry.publisher} ${entry.notes}`
        .toLowerCase()
        .includes(q);
    });
  }, [entries, query, status, group]);

  const completed = entries.filter((e) => e.e2eVerified && e.registerStatus === "Available");
  const planned = entries.filter((e) => !(e.e2eVerified && e.registerStatus === "Available"));

  if (!canView) {
    return (
      <>
        <PageHeader title="Integration Register" description="App Store" />
        <EmptyState title="No access" description="Requires appstore.view." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Integration Register"
        description="Authoritative status for every researched, planned, in-development, testing, available or unsupported integration. Install is never offered without verified E2E sync."
      />
      <AppStoreSubnav current="register" />

      <Alert className="mb-6">
        <AlertTitle>Completed vs planned</AlertTitle>
        <AlertDescription>
          Completed (verified Available): {completed.length}. Planned / not verified:{" "}
          {planned.length}. No partnerships are invented. CSV/API import alternatives remain
          available via Data Import Centre when live connectors are not ready.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {INTEGRATION_REGISTER_STATUSES.map((s) => (
          <div key={s} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{s}</p>
            <p className="text-2xl font-semibold tabular-nums">{counts[s]}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search register"
          aria-label="Search integration register"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INTEGRATION_REGISTER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger aria-label="Category group filter">
            <SelectValue placeholder="Category group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All category groups</SelectItem>
            {INTEGRATION_CATEGORY_GROUPS.map((g) => (
              <SelectItem key={g.group} value={g.group}>
                {g.group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Register status</TableHead>
              <TableHead>Security</TableHead>
              <TableHead>Install</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Notes / fallback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow key={entry.code}>
                <TableCell>
                  <div className="font-medium">{entry.name}</div>
                  <div className="text-xs text-muted-foreground">{entry.publisher}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{entry.kind}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={entry.registerStatus === "Available" ? "default" : "secondary"}>
                    {entry.registerStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={entry.securityReviewPassed ? "secondary" : "outline"}>
                      Review {entry.securityReviewPassed ? "passed" : "pending"}
                    </Badge>
                    <Badge variant={entry.realCustomerDataEnabled ? "destructive" : "outline"}>
                      Real data {entry.realCustomerDataEnabled ? "on" : "locked"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {entry.installAvailable ? (
                    <Badge>Available</Badge>
                  ) : (
                    <Badge variant="outline">Not available</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-[14rem] text-xs text-muted-foreground">
                  {entry.categoryGroups.join(", ")}
                </TableCell>
                <TableCell className="max-w-sm">
                  <p className="text-xs text-muted-foreground line-clamp-2">{entry.notes}</p>
                  {entry.csvFallbackPath ? (
                    <Button asChild variant="link" className="h-auto px-0 text-xs">
                      {entry.csvFallbackPath === "/imports" ? (
                        <Link to="/imports" search={{ module: undefined }}>
                          CSV / import alternative
                        </Link>
                      ) : entry.csvFallbackPath === "/banking" ? (
                        <Link to="/banking">Banking import</Link>
                      ) : (
                        <a href={entry.csvFallbackPath}>Open alternative</a>
                      )}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching entries"
          description="Clear filters to see the full register."
        />
      ) : null}
    </>
  );
}
