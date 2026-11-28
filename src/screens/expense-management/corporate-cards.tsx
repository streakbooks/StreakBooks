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
  canDisputeCardTransaction,
  canMatchCardTransaction,
  canResolveCardDispute,
} from "@/lib/expenses/corporate-cards";
import {
  EXPENSE_CORPORATE_CARD_MIGRATION,
  EXPENSE_DISPUTES_REBILLING_MIGRATION,
  disputeExpenseCorporateCardTransaction,
  listExpenseClaims,
  listExpenseCorporateCards,
  listExpenseCorporateCardTransactions,
  matchExpenseCorporateCardTransaction,
  resolveExpenseCorporateCardTransaction,
  saveExpenseCorporateCard,
  saveExpenseCorporateCardTransaction,
} from "@/lib/expenses/expenses.functions";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementCorporateCardsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canManage =
    can("expenses.manage_cards" as Permission) || can("expenses.admin" as Permission);
  const canView =
    canManage ||
    can("expenses.view" as Permission) ||
    can("expenses.submit" as Permission) ||
    can("expenses.audit" as Permission);

  const [label, setLabel] = useState("Ops card");
  const [last4, setLast4] = useState("");
  const [network, setNetwork] = useState("visa");
  const [liabilityAccountId, setLiabilityAccountId] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [txMerchant, setTxMerchant] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState(today);
  const [matchClaimId, setMatchClaimId] = useState("");

  const fetchCards = useServerFn(listExpenseCorporateCards);
  const fetchTx = useServerFn(listExpenseCorporateCardTransactions);
  const fetchClaims = useServerFn(listExpenseClaims);
  const fetchAccounts = useServerFn(listAccounts);
  const saveCard = useServerFn(saveExpenseCorporateCard);
  const saveTx = useServerFn(saveExpenseCorporateCardTransaction);
  const matchTx = useServerFn(matchExpenseCorporateCardTransaction);
  const disputeTx = useServerFn(disputeExpenseCorporateCardTransaction);
  const resolveTx = useServerFn(resolveExpenseCorporateCardTransaction);

  const cardsQ = useQuery({
    queryKey: ["expense-corporate-cards", company?.id],
    queryFn: () => fetchCards({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const txQ = useQuery({
    queryKey: ["expense-corporate-card-tx", company?.id, selectedCardId],
    queryFn: () =>
      fetchTx({
        data: {
          companyId: company!.id,
          cardId: selectedCardId,
        },
      }),
    enabled: Boolean(company?.id) && canManage && Boolean(selectedCardId),
    retry: false,
  });

  const unmatchedTx = useMemo(
    () => (txQ.data ?? []).filter((tx) => tx.status === "unmatched"),
    [txQ.data],
  );
  const disputedTx = useMemo(
    () => (txQ.data ?? []).filter((tx) => tx.status === "disputed"),
    [txQ.data],
  );

  const claimsQ = useQuery({
    queryKey: ["expense-claims", company?.id, "card-match"],
    queryFn: () =>
      fetchClaims({
        data: { companyId: company!.id, scope: "all" },
      }),
    enabled: Boolean(company?.id) && canManage,
    retry: false,
  });

  const accountsQ = useQuery({
    queryKey: ["accounts", company?.id, "expense-cards"],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage,
    retry: false,
  });

  const liabilityAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) =>
          account.is_active && account.is_postable && account.account_type === "liability",
      ),
    [accountsQ.data],
  );

  const cardClaims = useMemo(
    () => (claimsQ.data ?? []).filter((claim) => claim.paymentSource === "corporate_card"),
    [claimsQ.data],
  );

  const createCardMut = useMutation({
    mutationFn: async () =>
      saveCard({
        data: {
          companyId: company!.id,
          draft: {
            label: label.trim(),
            last4: last4.trim(),
            network: network.trim() || null,
            liabilityAccountId,
            currencyCode: currency,
            status: "active",
          },
        },
      }),
    onSuccess: async (card) => {
      toast.success("Corporate card saved");
      setSelectedCardId(card.id);
      setLast4("");
      await queryClient.invalidateQueries({
        queryKey: ["expense-corporate-cards", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const createTxMut = useMutation({
    mutationFn: async () => {
      if (!selectedCardId) throw new Error("Select a card first.");
      const amountMinor = Number(parseMinorOrThrow(txAmount, "Amount"));
      return saveTx({
        data: {
          companyId: company!.id,
          draft: {
            cardId: selectedCardId,
            transactionDate: txDate,
            merchantName: txMerchant.trim() || null,
            description: txDescription.trim() || txMerchant.trim() || "Card spend",
            amountMinor,
            currencyCode: currency,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Statement line added");
      setTxAmount("");
      setTxDescription("");
      setTxMerchant("");
      await queryClient.invalidateQueries({
        queryKey: ["expense-corporate-card-tx", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const matchMut = useMutation({
    mutationFn: async (transactionId: string) => {
      if (!matchClaimId) throw new Error("Select a claim to match.");
      return matchTx({
        data: {
          companyId: company!.id,
          transactionId,
          claimId: matchClaimId,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Transaction matched to claim");
      setMatchClaimId("");
      await queryClient.invalidateQueries({
        queryKey: ["expense-corporate-card-tx", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const disputeMut = useMutation({
    mutationFn: async (transactionId: string) =>
      disputeTx({
        data: {
          companyId: company!.id,
          transactionId,
          reason: "Disputed from Corporate Cards",
        },
      }),
    onSuccess: async () => {
      toast.success("Transaction marked disputed");
      await queryClient.invalidateQueries({
        queryKey: ["expense-corporate-card-tx", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const resolveMut = useMutation({
    mutationFn: async (input: { transactionId: string; resolution: "unmatched" | "excluded" }) =>
      resolveTx({
        data: {
          companyId: company!.id,
          transactionId: input.transactionId,
          resolution: input.resolution,
        },
      }),
    onSuccess: async () => {
      toast.success("Dispute resolved");
      await queryClient.invalidateQueries({
        queryKey: ["expense-corporate-card-tx", company?.id],
      });
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
        title="Corporate Cards"
        description="Expenses"
        subnav={<ExpenseManagementSubnav current="corporate-cards" />}
      >
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.manage_cards."
        />
      </ListWorkspace>
    );
  }

  const migrationMissing =
    (cardsQ.error && String(cardsQ.error.message ?? "").includes("20261107143000")) ||
    (txQ.error && String(txQ.error.message ?? "").includes("20261107144000"));

  return (
    <ListWorkspace
      title="Corporate Cards"
      description="Register cards, import statement lines, and match them to corporate-card claims."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/expense-management/$section" params={{ section: "my-expenses" }}>
            My expenses
          </Link>
        </Button>
      }
      subnav={<ExpenseManagementSubnav current="corporate-cards" />}
    >
      {migrationMissing ? (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>
            {String(txQ.error?.message ?? "").includes("20261107144000")
              ? EXPENSE_DISPUTES_REBILLING_MIGRATION
              : EXPENSE_CORPORATE_CARD_MIGRATION}
          </AlertDescription>
        </Alert>
      ) : null}

      {cardsQ.isError && !migrationMissing ? (
        <QueryErrorState queries={[cardsQ]} title="Could not load corporate cards" />
      ) : null}

      {canManage && accountsQ.isError ? (
        <QueryErrorState queries={[accountsQ]} title="Could not load liability accounts" />
      ) : null}
      {canManage && claimsQ.isError ? (
        <QueryErrorState queries={[claimsQ]} title="Could not load card claims for matching" />
      ) : null}

      {canManage ? (
        <section id="em-card-register" className="mb-8 space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Register card</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="card-label">Label</Label>
              <Input id="card-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-last4">Last 4</Label>
              <Input
                id="card-last4"
                value={last4}
                maxLength={4}
                inputMode="numeric"
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-network">Network</Label>
              <Input
                id="card-network"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Liability account</Label>
              {accountsQ.isError ? null : accountsQ.isSuccess ? (
                <AccountLookup
                  companyId={company.id}
                  accounts={liabilityAccounts}
                  value={liabilityAccountId}
                  onChange={(next) => setLiabilityAccountId(next ?? "")}
                  allowClear
                  disabled={createCardMut.isPending}
                  ariaLabel="Card liability account"
                  purpose="posting"
                />
              ) : null}
            </div>
            <div>
              <Button
                onClick={() => createCardMut.mutate()}
                disabled={
                  createCardMut.isPending ||
                  !label.trim() ||
                  last4.length !== 4 ||
                  !liabilityAccountId ||
                  !accountsQ.isSuccess ||
                  accountsQ.isError
                }
              >
                {createCardMut.isPending ? "Saving…" : "Save card"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-medium">Cards</h2>
        {cardsQ.isLoading ? (
          <LoadingState />
        ) : cardsQ.isError ? null : !cardsQ.isSuccess ? (
          <LoadingState />
        ) : (cardsQ.data ?? []).length === 0 ? (
          <EmptyState
            title="No corporate cards"
            description="Register a card with its liability account to start matching spend."
            action={
              canManage ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("em-card-register")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Register card
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead>Last 4</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cardsQ.data ?? []).map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <div className="font-medium">{card.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {card.network ?? "—"} · {card.currencyCode}
                    </div>
                  </TableCell>
                  <TableCell>****{card.last4}</TableCell>
                  <TableCell>
                    <Badge variant={card.status === "active" ? "default" : "secondary"}>
                      {card.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={selectedCardId === card.id ? "default" : "outline"}
                      onClick={() => setSelectedCardId(card.id)}
                    >
                      Select
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {canManage && selectedCardId ? (
        <>
          <section className="mb-8 space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-medium">Add statement line</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tx-date">Date</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-amt">Amount ({currency})</Label>
                <Input
                  id="tx-amt"
                  inputMode="decimal"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-merchant">Merchant</Label>
                <Input
                  id="tx-merchant"
                  value={txMerchant}
                  onChange={(e) => setTxMerchant(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-desc">Description</Label>
                <Input
                  id="tx-desc"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                />
              </div>
              <div>
                <Button
                  onClick={() => createTxMut.mutate()}
                  disabled={
                    createTxMut.isPending || !txAmount.trim() || !cardsQ.isSuccess || cardsQ.isError
                  }
                >
                  {createTxMut.isPending ? "Saving…" : "Add transaction"}
                </Button>
              </div>
            </div>
          </section>

          <section className="mb-6 grid max-w-lg gap-2">
            <Label>Claim for matching</Label>
            {claimsQ.isError ? (
              <QueryErrorState
                queries={[claimsQ]}
                title="Could not load card claims for matching"
              />
            ) : claimsQ.isSuccess ? (
              <RecordLookupSelect value={matchClaimId} onValueChange={setMatchClaimId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select corporate-card claim" />
                </SelectTrigger>
                <SelectContent>
                  {cardClaims.map((claim) => (
                    <SelectItem key={claim.id} value={claim.id}>
                      {claim.claimNumber} — {fromMinorUnits(claim.totalMinor, claim.claimCurrency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            ) : (
              <p className="text-sm text-muted-foreground">Loading claims…</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Unmatched transactions</h2>
            {txQ.isLoading ? (
              <LoadingState />
            ) : txQ.isError ? (
              <QueryErrorState queries={[txQ]} title="Could not load card transactions" />
            ) : !txQ.isSuccess ? (
              <LoadingState />
            ) : unmatchedTx.length === 0 ? (
              <EmptyState
                title="No unmatched lines"
                description="Add statement lines or they are already matched."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedTx.map((tx) => {
                    const claim = cardClaims.find((c) => c.id === matchClaimId);
                    const gate =
                      claim &&
                      canMatchCardTransaction({
                        txStatus: tx.status,
                        txAmountMinor: tx.amountMinor,
                        txCurrency: tx.currencyCode,
                        txCardId: tx.cardId,
                        claimPaymentSource: claim.paymentSource,
                        claimTotalMinor: claim.totalMinor,
                        claimCurrency: claim.claimCurrency,
                        claimCardId: selectedCardId,
                      });
                    const disputeGate = canDisputeCardTransaction({
                      txStatus: tx.status,
                    });
                    return (
                      <TableRow key={tx.id}>
                        <TableCell>{tx.transactionDate}</TableCell>
                        <TableCell>
                          <div className="font-medium">{tx.merchantName ?? tx.description}</div>
                          <div className="text-xs text-muted-foreground">{tx.description}</div>
                        </TableCell>
                        <TableCell>{fromMinorUnits(tx.amountMinor, tx.currencyCode)}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            size="sm"
                            disabled={
                              matchMut.isPending ||
                              !matchClaimId ||
                              !gate ||
                              gate.ok === false ||
                              !claimsQ.isSuccess
                            }
                            onClick={() => matchMut.mutate(tx.id)}
                          >
                            Match
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disputeMut.isPending || disputeGate.ok === false}
                            onClick={() => disputeMut.mutate(tx.id)}
                          >
                            Dispute
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="text-lg font-medium">Disputed transactions</h2>
            {txQ.isLoading ? (
              <LoadingState />
            ) : txQ.isError ? (
              <QueryErrorState queries={[txQ]} title="Could not load card transactions" />
            ) : !txQ.isSuccess ? (
              <LoadingState />
            ) : disputedTx.length === 0 ? (
              <EmptyState
                title="No disputes"
                description="Disputed statement lines appear here until resolved."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Resolve</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputedTx.map((tx) => {
                    const toUnmatched = canResolveCardDispute({
                      txStatus: tx.status,
                      resolution: "unmatched",
                    });
                    const toExcluded = canResolveCardDispute({
                      txStatus: tx.status,
                      resolution: "excluded",
                    });
                    return (
                      <TableRow key={tx.id}>
                        <TableCell>{tx.transactionDate}</TableCell>
                        <TableCell>
                          <div className="font-medium">{tx.merchantName ?? tx.description}</div>
                          <Badge variant="secondary">disputed</Badge>
                        </TableCell>
                        <TableCell>{fromMinorUnits(tx.amountMinor, tx.currencyCode)}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            size="sm"
                            disabled={resolveMut.isPending || toUnmatched.ok === false}
                            onClick={() =>
                              resolveMut.mutate({
                                transactionId: tx.id,
                                resolution: "unmatched",
                              })
                            }
                          >
                            Back to unmatched
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resolveMut.isPending || toExcluded.ok === false}
                            onClick={() =>
                              resolveMut.mutate({
                                transactionId: tx.id,
                                resolution: "excluded",
                              })
                            }
                          >
                            Exclude
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      ) : null}
    </ListWorkspace>
  );
}
