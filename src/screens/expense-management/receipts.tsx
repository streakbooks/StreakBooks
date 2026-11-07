import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  EXPENSE_RECEIPT_MIGRATION,
  listExpenseReceiptInbox,
  registerExpenseReceiptInboxEntry,
} from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementReceiptsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canOpen =
    can("expenses.submit" as Permission) ||
    can("expenses.view" as Permission) ||
    can("expenses.approve" as Permission) ||
    can("expenses.admin" as Permission);
  const canSubmit = can("expenses.submit" as Permission);
  const [fileName, setFileName] = useState("");
  const [notes, setNotes] = useState("");

  const fetchInbox = useServerFn(listExpenseReceiptInbox);
  const registerEntry = useServerFn(registerExpenseReceiptInboxEntry);

  const inboxQ = useQuery({
    queryKey: ["expense-receipt-inbox", company?.id],
    queryFn: () => fetchInbox({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
  });

  const register = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      return registerEntry({
        data: {
          companyId: company.id,
          fileName: fileName.trim(),
          source: "upload",
          notes: notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      setFileName("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["expense-receipt-inbox", company?.id] });
      toast.success("Receipt inbox entry registered. Attach the file on a claim detail page.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <>
        <PageHeader title="Receipts & Inbox" />
        <ExpenseManagementSubnav current="receipts" />
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.submit or expenses.view."
        />
      </>
    );
  }
  if (inboxQ.isPending) return <LoadingState />;
  if (inboxQ.isError) {
    const message = friendlyAuthError(inboxQ.error);
    return (
      <>
        <PageHeader title="Receipts & Inbox" />
        <ExpenseManagementSubnav current="receipts" />
        {message.includes("20261107133000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_RECEIPT_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load receipt inbox"
            description={message}
            onRetry={() => inboxQ.refetch()}
          />
        )}
      </>
    );
  }

  const inbox = inboxQ.data;

  return (
    <>
      <PageHeader
        title="Receipts & Inbox"
        description="Unassigned receipt tracking and claim attachment links."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/expense-management/my-expenses">Open My Expenses</Link>
          </Button>
        }
      />
      <ExpenseManagementSubnav current="receipts" />

      <Alert className="mb-6">
        <AlertTitle>
          {inbox.inboundEmailEnabled ? "Inbound email enabled" : "Inbound email not configured"}
        </AlertTitle>
        <AlertDescription>{inbox.note}</AlertDescription>
      </Alert>

      {canSubmit ? (
        <form
          className="mb-8 grid max-w-xl gap-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
        >
          <h2 className="text-base font-semibold">Register unassigned receipt</h2>
          <p className="text-sm text-muted-foreground">
            Records an inbox placeholder. Upload the actual file on the claim detail page using the
            secure document panel.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="em-receipt-name">File name</Label>
            <Input
              id="em-receipt-name"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              placeholder="taxi-receipt.pdf"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-receipt-notes">Notes</Label>
            <Input
              id="em-receipt-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={register.isPending || !fileName.trim()}>
            {register.isPending ? "Saving…" : "Register inbox entry"}
          </Button>
        </form>
      ) : null}

      {inbox.entries.length === 0 ? (
        <EmptyState
          title="No unassigned receipts"
          description="Register a placeholder above, or attach files directly on a claim."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inbox.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.fileName}</TableCell>
                <TableCell>{entry.source}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{entry.status}</Badge>
                </TableCell>
                <TableCell>{entry.createdAt.slice(0, 10) || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
