import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { RecordDiscussButton } from "@/components/messaging/RecordDiscussButton";
import { ContactLookup } from "@/components/lookup";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listContacts } from "@/lib/contacts/contacts.functions";
import {
  EXPENSE_DISPUTES_REBILLING_MIGRATION,
  EXPENSE_FX_REFUND_MIGRATION,
  EXPENSE_POSTING_MIGRATION,
  EXPENSE_RISK_MIGRATION,
  findExpenseClaimDuplicates,
  getExpenseClaim,
  getExpenseManagementSettings,
  markExpenseClaimRebilled,
  postExpenseClaim,
  prepareExpenseClaimForRebilling,
  scanExpenseClaimRisks,
  validateExpenseClaimFx,
} from "@/lib/expenses/expenses.functions";
import { buildRebillSalesLines, canPrepareClaimForRebilling } from "@/lib/expenses/rebilling";
import { riskScoreBand } from "@/lib/expenses/risk";
import { saveInvoiceDraft } from "@/lib/sales/sales.functions";
import type { Permission } from "@/lib/permissions";

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ExpenseManagementClaimDetailPage({ claimId }: { claimId: string }) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canPost = can("expenses.post" as Permission) || can("expenses.admin" as Permission);
  const canRebill = can("expenses.submit" as Permission) || can("expenses.admin" as Permission);
  const canDraftInvoice = can("sales.draft" as Permission) || can("expenses.admin" as Permission);
  const fetchClaim = useServerFn(getExpenseClaim);
  const postClaim = useServerFn(postExpenseClaim);
  const fetchSettings = useServerFn(getExpenseManagementSettings);
  const fetchContacts = useServerFn(listContacts);
  const prepareRebill = useServerFn(prepareExpenseClaimForRebilling);
  const markRebilled = useServerFn(markExpenseClaimRebilled);
  const createInvoice = useServerFn(saveInvoiceDraft);
  const scanRisks = useServerFn(scanExpenseClaimRisks);
  const findDuplicates = useServerFn(findExpenseClaimDuplicates);
  const validateFx = useServerFn(validateExpenseClaimFx);
  const [customerContactId, setCustomerContactId] = useState("");
  const [fxChecked, setFxChecked] = useState(false);

  const claimQ = useQuery({
    queryKey: ["expense-claim", company?.id, claimId],
    queryFn: () => fetchClaim({ data: { companyId: company!.id, claimId } }),
    enabled: Boolean(company?.id && claimId),
    retry: false,
  });

  const settingsQ = useQuery({
    queryKey: ["expense-management-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canRebill,
    retry: false,
  });

  const riskQ = useQuery({
    queryKey: ["expense-claim-risks", company?.id, claimId],
    queryFn: () => scanRisks({ data: { companyId: company!.id, claimId } }),
    enabled: Boolean(company?.id && claimId),
    retry: false,
  });

  const fxQ = useQuery({
    queryKey: ["expense-claim-fx", company?.id, claimId],
    queryFn: () => validateFx({ data: { companyId: company!.id, claimId } }),
    enabled: Boolean(company?.id && claimId) && fxChecked,
    retry: false,
  });

  const fxMut = useMutation({
    mutationFn: async () => {
      setFxChecked(true);
      return validateFx({ data: { companyId: company!.id, claimId } });
    },
    onSuccess: (result) => {
      void queryClient.setQueryData(["expense-claim-fx", company?.id, claimId], result);
      toast.success(result.ok ? "FX check passed" : `${result.issues.length} FX issue(s)`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const duplicatesQ = useQuery({
    queryKey: ["expense-claim-duplicates", company?.id, claimId],
    queryFn: () => findDuplicates({ data: { companyId: company!.id, claimId } }),
    enabled: Boolean(company?.id && claimId),
    retry: false,
  });

  const contactsQ = useQuery({
    queryKey: ["contacts", company?.id, "expense-rebill"],
    queryFn: () =>
      fetchContacts({
        data: { companyId: company!.id, kind: "customers", limit: 200 },
      }),
    enabled: Boolean(company?.id) && canRebill,
  });

  const customers = useMemo(() => {
    const rows = (contactsQ.data ?? []) as Array<{
      id: string;
      name: string | null;
      is_active?: boolean | null;
    }>;
    return rows.map((c) => ({
      id: String(c.id ?? ""),
      name: String(c.name ?? "Customer"),
      kind: "customer" as const,
      is_active: c.is_active !== false,
    }));
  }, [contactsQ.data]);

  const post = useMutation({
    mutationFn: async () => {
      if (!company || !claimQ.data) throw new Error("Claim not loaded.");
      return postClaim({
        data: {
          companyId: company.id,
          claimId: claimQ.data.id,
          version: claimQ.data.version,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expense-claim", company?.id, claimId] });
      void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
      void queryClient.invalidateQueries({
        queryKey: ["expense-management-overview", company?.id],
      });
      toast.success("Claim posted to the ledger (employee payable accrual).");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const rebill = useMutation({
    mutationFn: async () => {
      if (!company || !claimQ.data) throw new Error("Claim not loaded.");
      const contactId = customerContactId || claimQ.data.customerContactId || "";
      if (!contactId) throw new Error("Select a customer to rebill.");
      const incomeAccountId = settingsQ.data?.rebillingIncomeAccountId;
      if (!incomeAccountId) {
        throw new Error("Set the rebilling income account in Expense settings first.");
      }
      const gate = canPrepareClaimForRebilling({
        rebillingStatus: claimQ.data.rebillingStatus,
        rebillingInvoiceId: claimQ.data.rebillingInvoiceId,
        hasLines: claimQ.data.lines.length > 0,
      });
      if (!gate.ok) throw new Error(gate.error);

      let claim = claimQ.data;
      if (claim.rebillingStatus !== "ready" || claim.customerContactId !== contactId) {
        claim = await prepareRebill({
          data: {
            companyId: company.id,
            claimId: claim.id,
            version: claim.version,
            customerContactId: contactId,
          },
        });
      }

      const built = buildRebillSalesLines({
        incomeAccountId,
        lines: claim.lines.map((line) => ({
          description: `${claim.claimNumber}: ${line.description}`,
          netMinor: line.netMinor,
          ...(line.isBillable != null ? { isBillable: line.isBillable } : {}),
          ...(line.rebillingMethod ? { rebillingMethod: line.rebillingMethod } : {}),
        })),
      });
      if (!built.ok) throw new Error(built.error);

      const invoice = await createInvoice({
        data: {
          companyId: company.id,
          contactId,
          invoiceDate: claim.claimDate,
          dueDate: addDaysIso(claim.claimDate, 30),
          currencyCode: claim.claimCurrency,
          memo: `Rebill of expense claim ${claim.claimNumber}`,
          lines: built.lines,
        },
      });

      return markRebilled({
        data: {
          companyId: company.id,
          claimId: claim.id,
          version: claim.version,
          invoiceId: invoice.id,
        },
      });
    },
    onSuccess: (claim) => {
      void queryClient.invalidateQueries({ queryKey: ["expense-claim", company?.id, claimId] });
      toast.success(
        claim.rebillingInvoiceId
          ? `Rebilling invoice ${claim.rebillingInvoiceId} linked.`
          : "Claim marked as rebilled.",
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (claimQ.isLoading) {
    return (
      <RecordWorkspace title="Expense claim" description="Expenses">
        <ExpenseManagementSubnav current="my-expenses" />
        <LoadingState />
      </RecordWorkspace>
    );
  }
  if (claimQ.isError) {
    const message = friendlyAuthError(claimQ.error);
    return (
      <RecordWorkspace title="Expense claim">
        {message.includes("20261107137000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_POSTING_MIGRATION}</AlertDescription>
          </Alert>
        ) : message.includes("20261107144000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_DISPUTES_REBILLING_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load claim"
            description={message}
            onRetry={() => claimQ.refetch()}
          />
        )}
      </RecordWorkspace>
    );
  }

  const claim = claimQ.data;
  if (!claim) {
    return <EmptyState title="Claim not found" description="It may have been deleted." />;
  }

  const canPostNow =
    canPost &&
    claim.approvalStatus === "approved" &&
    claim.paymentSource === "employee_paid" &&
    (claim.postingStatus === "ready" || claim.postingStatus === "failed") &&
    !claim.postedJournalId;

  const alreadyRebilled = claim.rebillingStatus === "invoiced" && Boolean(claim.rebillingInvoiceId);
  const canRebillNow = canRebill && canDraftInvoice && !alreadyRebilled && claim.lines.length > 0;

  return (
    <RecordWorkspace
      title={claim.claimNumber}
      description={claim.title}
      insights={
        <WorkspaceInsights
          title="Related"
          facts={[
            { label: "Approval", value: claim.approvalStatus.replaceAll("_", " ") },
            { label: "Posting", value: claim.postingStatus.replaceAll("_", " ") },
            {
              label: "Total",
              value: fromMinorUnits(claim.totalMinor, claim.claimCurrency),
            },
            { label: "Lines", value: String(claim.lines.length) },
          ]}
          links={[
            {
              label: "My expenses",
              to: "/expense-management/$section",
              params: { section: "my-expenses" },
              hint: "Return to expense claims",
            },
            ...(claim.rebillingInvoiceId
              ? [
                  {
                    label: "Rebilling invoice",
                    to: "/sales/invoices/$invoiceId",
                    params: { invoiceId: claim.rebillingInvoiceId },
                    hint: "Linked sales invoice for this claim",
                  },
                ]
              : []),
          ]}
          footer="Statuses come from the claim record. Posting creates an employee payable accrual when authorised."
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {canPostNow ? (
            <Button size="sm" disabled={post.isPending} onClick={() => post.mutate()}>
              {post.isPending ? "Posting…" : "Post to ledger"}
            </Button>
          ) : null}
          <RecordDiscussButton
            companyId={company?.id ?? null}
            recordType="expense_claim"
            recordId={claimId}
            title="Expense claim discussion"
            label="Discuss"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={fxMut.isPending}
            onClick={() => fxMut.mutate()}
          >
            {fxMut.isPending ? "Checking FX…" : "Validate FX"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/expense-management/$section" params={{ section: "my-expenses" }}>
              Back to My Expenses
            </Link>
          </Button>
        </div>
      }
    >
      <ExpenseManagementSubnav current="my-expenses" />

      {fxQ.data && !fxQ.data.ok ? (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>FX issues</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {fxQ.data.issues.map((issue) => (
                <li key={`${issue.lineNo}-${issue.code}`}>
                  Line {issue.lineNo}: {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {fxQ.isError ? (
        <Alert className="mb-6">
          <AlertTitle>FX check unavailable</AlertTitle>
          <AlertDescription>
            {friendlyAuthError(fxQ.error).includes("20261107154000")
              ? EXPENSE_FX_REFUND_MIGRATION
              : friendlyAuthError(fxQ.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge status={claim.approvalStatus} />
        <StatusBadge
          status={claim.postingStatus}
          label={`Posting: ${claim.postingStatus.replace(/[_-]/g, " ")}`}
        />
        <StatusBadge
          status={claim.reimbursementStatus}
          label={`Reimbursement: ${claim.reimbursementStatus.replace(/[_-]/g, " ")}`}
        />
        <StatusBadge
          status={claim.rebillingStatus}
          label={`Rebilling: ${claim.rebillingStatus.replace(/[_-]/g, " ")}`}
        />
        {riskQ.data ? (
          <Badge
            variant={
              riskScoreBand(riskQ.data.score) === "elevated"
                ? "destructive"
                : riskScoreBand(riskQ.data.score) === "review"
                  ? "secondary"
                  : "outline"
            }
          >
            Risk {riskQ.data.score}
          </Badge>
        ) : null}
      </div>

      {claim.postedJournalId ? (
        <Alert className="mb-6">
          <AlertTitle>Posted</AlertTitle>
          <AlertDescription>
            Accrual journal {claim.postedJournalId}. Bank reimbursement is handled in EM-07.
          </AlertDescription>
        </Alert>
      ) : null}

      {riskQ.isError && friendlyAuthError(riskQ.error).includes("20261107146000") ? (
        <Alert className="mb-6">
          <AlertTitle>Risk checks pending migration</AlertTitle>
          <AlertDescription>{EXPENSE_RISK_MIGRATION}</AlertDescription>
        </Alert>
      ) : null}

      {riskQ.data && riskQ.data.flags.length > 0 ? (
        <section className="mb-6 space-y-2 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Risk indicators</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {riskQ.data.flags.map((flag) => (
              <li key={flag.code}>
                <span className="font-medium">{flag.severity}</span> — {flag.message}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{riskQ.data.ocrNote}</p>
        </section>
      ) : null}

      {duplicatesQ.data && duplicatesQ.data.length > 0 ? (
        <section className="mb-6 space-y-2 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Possible duplicates</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {duplicatesQ.data.map((dup) => (
                <TableRow key={dup.claimId}>
                  <TableCell>
                    <Link
                      className="underline"
                      to="/expense-management/claims/$claimId"
                      params={{ claimId: dup.claimId }}
                    >
                      {dup.claimNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{dup.approvalStatus}</TableCell>
                  <TableCell>{dup.score}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fromMinorUnits(dup.totalMinor, dup.claimCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {claim.description ? (
        <p className="mb-6 text-sm text-muted-foreground">{claim.description}</p>
      ) : null}

      <div className="mb-8 space-y-4">
        <h2 className="text-base font-semibold">Lines</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Billable</TableHead>
              <TableHead className="text-right">Gross</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claim.lines.map((line) => (
              <TableRow key={line.id || String(line.lineNo)}>
                <TableCell>{line.lineNo}</TableCell>
                <TableCell>{line.expenseDate}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell>{line.merchantName ?? "—"}</TableCell>
                <TableCell>{line.isBillable ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fromMinorUnits(line.grossMinor, line.currencyCode)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <TotalsSummary
            aria-label="Claim totals"
            lines={[
              {
                id: "lines",
                label: "Lines",
                value: String(claim.lines.length),
                emphasis: "muted",
              },
              {
                id: "total",
                label: "Total",
                value: fromMinorUnits(claim.totalMinor, claim.claimCurrency),
                emphasis: "total",
              },
            ]}
          />
        </div>
      </div>

      {canRebill ? (
        <section className="mb-8 space-y-4 rounded-lg border p-4">
          <h2 className="text-base font-semibold">Customer rebilling</h2>
          {alreadyRebilled ? (
            <Alert>
              <AlertTitle>Rebilled</AlertTitle>
              <AlertDescription>
                Linked sales invoice {claim.rebillingInvoiceId}.{" "}
                <Link
                  className="underline"
                  to="/sales/invoices/$invoiceId"
                  params={{ invoiceId: claim.rebillingInvoiceId! }}
                >
                  Open invoice
                </Link>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Prepare billable lines and create a draft sales invoice against the configured
                rebilling income account.
              </p>
              <div className="grid max-w-md gap-2">
                <Label>Customer</Label>
                <ContactLookup
                  ariaLabel="Rebilling customer"
                  contacts={customers}
                  value={customerContactId || claim.customerContactId || ""}
                  onChange={(next) => setCustomerContactId(next ?? "")}
                  companyId={company.id}
                  placeholder="Select customer"
                  allowClear
                />
              </div>
              {!settingsQ.data?.rebillingIncomeAccountId ? (
                <Alert>
                  <AlertTitle>Income account required</AlertTitle>
                  <AlertDescription>
                    Set the rebilling income account under Expense settings before creating an
                    invoice.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                size="sm"
                disabled={rebill.isPending || !canRebillNow}
                onClick={() => rebill.mutate()}
              >
                {rebill.isPending ? "Creating invoice…" : "Create rebilling invoice"}
              </Button>
            </>
          )}
        </section>
      ) : null}

      <DocumentRecordPanel entityType="expense_claim" entityId={claim.id} audience="internal" />
    </RecordWorkspace>
  );
}
