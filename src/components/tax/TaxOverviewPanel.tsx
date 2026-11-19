import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTaxCodes, listTaxRates } from "@/lib/tax/tax.functions";
import { listTaxReturns } from "@/lib/tax/tax-return.functions";
import { summarizeTaxWorkspace } from "@/lib/tax/tax-workspace";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TaxOverviewSettings = {
  tax_regime: string | null;
  registration_number: string | null;
  filing_frequency: string | null;
};

type LinkTab = "registration" | "returns" | "rates" | "codes" | "mappings" | "packs";

function Shortcut({ tab, children }: { tab: LinkTab; children: ReactNode }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to="/tax" search={{ tab }} resetScroll={false}>
        {children}
      </Link>
    </Button>
  );
}

export function TaxOverviewPanel({
  companyId,
  settings,
}: {
  companyId: string;
  settings: TaxOverviewSettings | null;
}) {
  const fetchRates = useServerFn(listTaxRates);
  const fetchCodes = useServerFn(listTaxCodes);
  const fetchReturns = useServerFn(listTaxReturns);
  const ratesQ = useQuery({
    queryKey: ["tax-rates", companyId],
    queryFn: () => fetchRates({ data: { companyId } }),
  });
  const codesQ = useQuery({
    queryKey: ["tax-codes", companyId],
    queryFn: () => fetchCodes({ data: { companyId } }),
  });
  const returnsQ = useQuery({
    queryKey: ["tax-returns", companyId],
    queryFn: () => fetchReturns({ data: { companyId } }),
  });

  if (ratesQ.isPending || codesQ.isPending || returnsQ.isPending) return <LoadingState />;
  if (ratesQ.isError || codesQ.isError || returnsQ.isError) {
    return (
      <QueryErrorState
        queries={[ratesQ, codesQ, returnsQ]}
        title="Could not load tax overview"
      />
    );
  }

  const summary = summarizeTaxWorkspace({
    regime: settings?.tax_regime,
    registrationNumber: settings?.registration_number,
    filingFrequency: settings?.filing_frequency,
    rates: ratesQ.data,
    codes: codesQ.data,
    returns: returnsQ.data.returns,
    returnsAvailable: returnsQ.data.available,
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tax regime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xl font-semibold capitalize">
              {settings?.tax_regime?.replace("_", " ") || "Not set"}
            </p>
            <Badge variant="outline">Manual configuration</Badge>
            <div>
              <Shortcut tab="registration">Review registration</Shortcut>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active tax rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-semibold tabular-nums">
              {summary.activeRates}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {summary.totalRates}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Active flag only; check effective dates before use.
            </p>
            <div>
              <Shortcut tab="rates">Manage rates</Shortcut>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active tax codes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-semibold tabular-nums">
              {summary.activeCodes}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {summary.totalCodes}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Codes must also reference a usable rate.
            </p>
            <div>
              <Shortcut tab="codes">Manage codes</Shortcut>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tax returns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {returnsQ.data.available ? (
              <p className="text-sm">
                <strong className="text-2xl tabular-nums">{summary.draftReturns}</strong> drafts ·{" "}
                <strong>{summary.filedReturns}</strong> recorded filed
              </p>
            ) : (
              <Badge variant="secondary">Storage unavailable</Badge>
            )}
            <p className="text-xs text-muted-foreground">
              Recorded as filed in LinkBooks, not submitted electronically.
            </p>
            <div>
              <Shortcut tab="returns">Review returns</Shortcut>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.tasks.length ? (
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {summary.tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No basic setup warnings found. This is not a validation of rates, tax law, eligibility
              or filing compliance.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Shortcut tab="mappings">Review GL mappings</Shortcut>
            <Shortcut tab="packs">View country packs</Shortcut>
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports/$reportId" params={{ reportId: "tax-summary" }}>
                Open tax summary
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Tax reporting scope</AlertTitle>
        <AlertDescription>
          Tax configuration and return calculations depend on posted documents and organisation
          settings. LinkBooks does not submit returns to authorities, verify local tax rates or
          certify statutory compliance.
        </AlertDescription>
      </Alert>
    </div>
  );
}
