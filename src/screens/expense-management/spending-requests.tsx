import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  cancelExpenseSpendingRequest,
  decideExpenseSpendingRequest,
  EXPENSE_SPENDING_REQUEST_MIGRATION,
  listExpenseSpendingRequests,
  saveExpenseSpendingRequest,
  submitExpenseSpendingRequest,
} from "@/lib/expenses/expenses.functions";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementSpendingRequestsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canSubmit = can("expenses.submit" as Permission);
  const canApprove =
    can("expenses.approve" as Permission) || can("expenses.admin" as Permission);
  const canOpen =
    canSubmit ||
    canApprove ||
    can("expenses.view" as Permission) ||
    can("expenses.audit" as Permission) ||
    can("expenses.admin" as Permission);

  const currency = company?.base_currency ?? "USD";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [amount, setAmount] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const fetchRequests = useServerFn(listExpenseSpendingRequests);
  const saveRequest = useServerFn(saveExpenseSpendingRequest);
  const submitRequest = useServerFn(submitExpenseSpendingRequest);
  const cancelRequest = useServerFn(cancelExpenseSpendingRequest);
  const decideRequest = useServerFn(decideExpenseSpendingRequest);

  const scope = canApprove || can("expenses.view" as Permission) ? "all" : "own";

  const listQ = useQuery({
    queryKey: ["expense-spending-requests", company?.id, scope],
    queryFn: () => fetchRequests({ data: { companyId: company!.id, scope } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-spending-requests", company?.id] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      const amountMinor = Number(parseMinorOrThrow(amount, "Amount"));
      return saveRequest({
        data: {
          companyId: company.id,
          draft: {
            title: title.trim() || "Spending request",
            ...(description.trim() ? { description: description.trim() } : {}),
            neededBy: neededBy || null,
            currencyCode: currency,
            amountMinor,
          },
        },
      });
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setNeededBy("");
      setAmount("");
      invalidate();
      toast.success("Spending request draft saved.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const submit = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      if (!company) throw new Error("Select a company first.");
      return submitRequest({
        data: { companyId: company.id, requestId: input.id, version: input.version },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Spending request submitted.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const cancel = useMutation({
    mutationFn: async (input: { id: string; version: number }) => {
      if (!company) throw new Error("Select a company first.");
      return cancelRequest({
        data: { companyId: company.id, requestId: input.id, version: input.version },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Spending request cancelled.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const decide = useMutation({
    mutationFn: async (input: {
      id: string;
      version: number;
      decision: "approved" | "returned" | "rejected";
    }) => {
      if (!company) throw new Error("Select a company first.");
      const note = decisionNotes[input.id]?.trim();
      return decideRequest({
        data: {
          companyId: company.id,
          requestId: input.id,
          version: input.version,
          decision: input.decision,
          ...(note ? { note } : {}),
        },
      });
    },
    onSuccess: (_result, variables) => {
      setDecisionNotes((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      invalidate();
      toast.success(`Spending request ${variables.decision}.`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace title="Spending Requests"
      subnav={<ExpenseManagementSubnav current="spending-requests"/>}
    >
      <EmptyState
          title="No access"
          description="Ask an administrator for expenses.submit or expenses.approve."
        />
    </ListWorkspace>
    );
  }
  if (listQ.isLoading) {
    return (
      <ListWorkspace title="Spending Requests" description="Expense Management"
      subnav={<ExpenseManagementSubnav current="spending-requests"/>}
    >
      <LoadingState />
    </ListWorkspace>
    );
  }
  if (listQ.isError) {
    const message = friendlyAuthError(listQ.error);
    return (
      <ListWorkspace title="Spending Requests"
      subnav={<ExpenseManagementSubnav current="spending-requests"/>}
    >
      {message.includes("20261107136000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_SPENDING_REQUEST_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load spending requests"
            description={message}
            onRetry={() => listQ.refetch()}
          />
        )}
    </ListWorkspace>
    );
  }

  const requests = listQ.data ?? [];

  return (
      <ListWorkspace title="Spending Requests"
        description="Pre-spend authorisation before large claims. Does not create accounting journals."
      subnav={<ExpenseManagementSubnav current="spending-requests"/>}
    >
      <Alert className="mb-6">
        <AlertTitle>Policy threshold</AlertTitle>
        <AlertDescription>
          Settings can require an approved spending request before submitting claims at or above a
          configured amount. Delegation and escalation are not included in this slice.
        </AlertDescription>
      </Alert>

      {canSubmit ? (
        <form
          className="mb-8 grid max-w-xl gap-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="text-base font-semibold">New spending request</h2>
          <div className="grid gap-2">
            <Label htmlFor="em-sr-title">Title</Label>
            <Input
              id="em-sr-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-sr-amount">Amount ({currency})</Label>
            <Input
              id="em-sr-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-sr-needed">Needed by</Label>
            <Input
              id="em-sr-needed"
              type="date"
              value={neededBy}
              onChange={(event) => setNeededBy(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em-sr-description">Description</Label>
            <Textarea
              id="em-sr-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save draft"}
          </Button>
        </form>
      ) : null}

      {requests.length === 0 ? (
        <EmptyState
          title="No spending requests"
          description="Create a draft above when you need pre-spend approval."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Needed</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <div className="font-medium">{request.requestNumber || "Request"}</div>
                  <div className="text-sm text-muted-foreground">{request.title}</div>
                  {request.decisionNote ? (
                    <div className="mt-1 text-xs text-muted-foreground">{request.decisionNote}</div>
                  ) : null}
                </TableCell>
                <TableCell>{request.neededBy || "—"}</TableCell>
                <TableCell>
                  {fromMinorUnits(request.amountMinor, request.currencyCode)}{" "}
                  {request.currencyCode}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{request.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-sm flex-col gap-2">
                    {canSubmit &&
                    (request.status === "draft" || request.status === "returned") ? (
                      <Button
                        size="sm"
                        disabled={submit.isPending}
                        onClick={() =>
                          submit.mutate({ id: request.id, version: request.version })
                        }
                      >
                        Submit
                      </Button>
                    ) : null}
                    {canSubmit &&
                    (request.status === "draft" ||
                      request.status === "submitted" ||
                      request.status === "returned") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() =>
                          cancel.mutate({ id: request.id, version: request.version })
                        }
                      >
                        Cancel
                      </Button>
                    ) : null}
                    {canApprove && request.status === "submitted" ? (
                      <>
                        <Textarea
                          placeholder="Decision note (required for return/reject)"
                          value={decisionNotes[request.id] ?? ""}
                          onChange={(event) =>
                            setDecisionNotes((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          rows={2}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() =>
                              decide.mutate({
                                id: request.id,
                                version: request.version,
                                decision: "approved",
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              decide.isPending || !(decisionNotes[request.id] ?? "").trim()
                            }
                            onClick={() =>
                              decide.mutate({
                                id: request.id,
                                version: request.version,
                                decision: "returned",
                              })
                            }
                          >
                            Return
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={
                              decide.isPending || !(decisionNotes[request.id] ?? "").trim()
                            }
                            onClick={() =>
                              decide.mutate({
                                id: request.id,
                                version: request.version,
                                decision: "rejected",
                              })
                            }
                          >
                            Reject
                          </Button>
                        </div>
    </ListWorkspace>
    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
