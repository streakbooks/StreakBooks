import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { roleHasPermission } from "@/lib/permissions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import {
  applyAiSuggestion,
  getAiAssistantStatus,
  listAiSuggestions,
  rejectAiSuggestion,
  runAiAssistant,
  type AiIntent,
} from "@/lib/ai/ai.functions";
import { getAiSuggestionKind, getJournalPreview } from "@/lib/ai/suggestion-review";
import { AiFinancialInsights } from "@/components/ai/FinancialInsights";
import { AiJournalEvidenceExplorer } from "@/components/ai/JournalEvidenceExplorer";
import { AiJournalReviewQueue } from "@/components/ai/JournalReviewQueue";
import {
  deleteAiConversationHistory,
  listAiConversationHistory,
  type AiConversationRow,
} from "@/lib/ai/history.functions";
import { LoadingState, ErrorState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";

type Suggestion = {
  id: string;
  intent: string;
  status: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  validation_errors: string[];
  created_at: string;
  applied_journal_id: string | null;
};

type Exchange = {
  id: string;
  question: string;
  intent: AiIntent;
  answer: string;
  mode: "model" | "calculated" | "not_configured";
  injectionFlagged: boolean;
  facts: Array<{ kind: string; title: string; body: string }>;
  suggestionId: string | null;
  disclaimer?: string;
};

const INTENT_LABELS: Record<AiIntent, string> = {
  ask: "Ask about organisation data",
  explain: "Explain accounting",
  categorise: "Suggest a category",
  draft: "Draft a transaction",
  duplicates: "Find possible duplicates",
  reconcile: "Reconciliation exceptions",
  unusual: "Unusual movements",
  navigate: "Find a workflow",
};

const STARTERS: Array<{ intent: AiIntent; label: string; prompt: string }> = [
  {
    intent: "duplicates",
    label: "Find duplicates",
    prompt: "Find possible duplicate bank transactions in the available sample.",
  },
  {
    intent: "reconcile",
    label: "Banking exceptions",
    prompt: "Show bank transactions that need reconciliation review.",
  },
  {
    intent: "unusual",
    label: "Unusual movements",
    prompt: "Highlight unusual movements using the available posted-journal sample.",
  },
  {
    intent: "navigate",
    label: "Where do I reconcile?",
    prompt: "Where can I reconcile a bank account in LinkBooks?",
  },
  {
    intent: "explain",
    label: "Explain a balance",
    prompt: "Explain what a trial balance means and how I should review it.",
  },
  {
    intent: "draft",
    label: "Draft a journal",
    prompt: "Draft a balanced month-end accrual journal for my review. Do not post anything.",
  },
];

export function AiAssistantPage() {
  const { company, isPending } = useActiveCompany();
  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <ListWorkspace title="AI Assistant" description="Select an organisation to start.">
        <Alert>
          <AlertTitle>No organisation selected</AlertTitle>
          <AlertDescription>Choose an organisation using the company switcher.</AlertDescription>
        </Alert>
      </ListWorkspace>
    );
  }
  // Switching organisations discards in-memory responses rather than showing old tenant context.
  return (
    <AiAssistantWorkspace
      key={company.id}
      companyId={company.id}
      companyName={company.name}
      currency={company.base_currency}
      canUse={
        company.permissions?.includes("ai.use") ??
        roleHasPermission(company.role ?? "read_only", "ai.use")
      }
      canApply={
        company.permissions?.includes("ai.apply_suggestion") ??
        roleHasPermission(company.role ?? "read_only", "ai.apply_suggestion")
      }
      canViewReports={
        company.permissions?.includes("reports.view") ??
        roleHasPermission(company.role ?? "read_only", "reports.view")
      }
      canViewMembers={
        company.permissions?.includes("members.view") ??
        roleHasPermission(company.role ?? "read_only", "members.view")
      }
    />
  );
}

function AiAssistantWorkspace({
  companyId,
  companyName,
  currency,
  canUse,
  canApply,
  canViewReports,
  canViewMembers,
}: {
  companyId: string;
  companyName: string;
  currency: string;
  canUse: boolean;
  canApply: boolean;
  canViewReports: boolean;
  canViewMembers: boolean;
}) {
  const fetchStatus = useServerFn(getAiAssistantStatus);
  const runAssist = useServerFn(runAiAssistant);
  const fetchSuggestions = useServerFn(listAiSuggestions);
  const fetchHistory = useServerFn(listAiConversationHistory);
  const deleteHistory = useServerFn(deleteAiConversationHistory);
  const fetchAccounts = useServerFn(listAccounts);
  const applySuggestion = useServerFn(applyAiSuggestion);
  const rejectSuggestion = useServerFn(rejectAiSuggestion);
  const qc = useQueryClient();

  const [intent, setIntent] = useState<AiIntent>("ask");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [journalDate, setJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyLatestFacts, setOnlyLatestFacts] = useState(true);

  const statusQ = useQuery({
    queryKey: ["ai-assistant-status"],
    enabled: canUse,
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
  });
  const suggestionsQ = useQuery({
    queryKey: ["ai-suggestions", companyId],
    enabled: canUse,
    queryFn: () => fetchSuggestions({ data: { companyId } }),
  });
  const historyQ = useQuery({
    queryKey: ["ai-conversation-history", companyId],
    enabled: canUse,
    queryFn: () => fetchHistory({ data: { companyId } }),
  });
  const accountsQ = useQuery({
    queryKey: ["ai-journal-account-preview", companyId],
    enabled: Boolean(reviewId) && canApply,
    queryFn: () => fetchAccounts({ data: { companyId } }),
    staleTime: 60_000,
  });

  const askM = useMutation({
    mutationFn: (request: { intent: AiIntent; message: string }) =>
      runAssist({ data: { companyId, ...request } }),
    onSuccess: async (result, request) => {
      setHistory((current) => [
        ...current.slice(-49),
        {
          id: result.historyId ?? "unsaved-" + Date.now().toString(36),
          question: request.message,
          intent: request.intent,
          answer: result.replyMarkdown,
          mode: result.mode,
          injectionFlagged: result.injectionFlagged,
          facts: result.facts ?? [],
          suggestionId: result.suggestionId,
          ...("disclaimer" in result && result.disclaimer ? { disclaimer: result.disclaimer } : {}),
        },
      ]);
      setMessage("");
      if (result.mode === "not_configured") toast.message("Model provider is not configured");
      else if (!result.saved) toast.warning("Answer shown, but it could not be saved to history.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ai-suggestions", companyId] }),
        qc.invalidateQueries({ queryKey: ["ai-conversation-history", companyId] }),
      ]);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const deleteHistoryM = useMutation({
    mutationFn: (target: { entryId?: string; all?: boolean }) =>
      deleteHistory({ data: { companyId, ...target } }),
    onSuccess: async (result, target) => {
      if (target.all) setHistory([]);
      else setHistory((previous) => previous.filter((item) => item.id !== target.entryId));
      toast.success(result.deletedCount + " saved conversation(s) deleted");
      await qc.invalidateQueries({ queryKey: ["ai-conversation-history", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const applyM = useMutation({
    mutationFn: (suggestionId: string) =>
      applySuggestion({ data: { companyId, suggestionId, confirm: true, journalDate } }),
    onSuccess: async (result) => {
      setReviewId(null);
      toast.success("Journal posted: " + result.journalId.slice(0, 8));
      await qc.invalidateQueries({ queryKey: ["ai-suggestions", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const rejectM = useMutation({
    mutationFn: (suggestionId: string) => rejectSuggestion({ data: { companyId, suggestionId } }),
    onSuccess: async () => {
      setReviewId(null);
      toast.message("Suggestion rejected");
      await qc.invalidateQueries({ queryKey: ["ai-suggestions", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  function send() {
    const question = message.trim();
    if (canUse && question && !askM.isPending) askM.mutate({ intent, message: question });
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  }

  async function copyAnswer(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Response copied");
    } catch {
      toast.error("Clipboard unavailable. Select and copy the response instead.");
    }
  }

  const savedExchanges: Exchange[] = ((historyQ.data ?? []) as AiConversationRow[])
    .slice()
    .reverse()
    .map((entry) => ({
      id: entry.id,
      question: entry.question,
      intent: entry.intent,
      answer: entry.reply_markdown,
      mode: entry.mode,
      injectionFlagged: entry.injection_flagged,
      facts: entry.facts ?? [],
      suggestionId: entry.suggestion_id,
    }));
  const savedIds = new Set(savedExchanges.map((entry) => entry.id));
  const exchanges = [...savedExchanges, ...history.filter((entry) => !savedIds.has(entry.id))];
  const rows = (suggestionsQ.data ?? []) as Suggestion[];
  const filtered = rows.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (item.title.toLowerCase().includes(search.toLowerCase().trim()) ||
        item.intent.toLowerCase().includes(search.toLowerCase().trim())),
  );
  const selected = rows.find((item) => item.id === reviewId) ?? null;
  const journalLines = selected ? getJournalPreview(selected) : null;
  const accountById = new Map((accountsQ.data ?? []).map((account) => [account.id, account]));
  const accountsResolved = Boolean(journalLines?.every((line) => accountById.has(line.account_id)));
  const latestId = exchanges[exchanges.length - 1]?.id;
  const formatAmount = (minor: number) => currency + " " + fromMinorUnits(BigInt(minor), currency);

  return (
    <ListWorkspace
      title="AI Assistant"
      description={
        "Organisation: " +
        companyName +
        ". Guidance and drafts are review-only unless explicitly posted by an authorised user."
      }
    >
      <Alert className="mb-5">
        <ShieldCheck className="size-4" />
        <AlertTitle>Human-reviewed accounting assistance</AlertTitle>
        <AlertDescription>
          Calculated results are based on limited LinkBooks samples; model responses may be
          inaccurate. Only validated journal drafts can be posted after a separate review. Access
          controls and posting checks remain authoritative.
        </AlertDescription>
      </Alert>

      {canUse && statusQ.isError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Could not check provider status</AlertTitle>
          <AlertDescription>
            {friendlyAuthError(statusQ.error)}{" "}
            <Button size="sm" variant="outline" onClick={() => void statusQ.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : canUse && statusQ.data ? (
        <Alert className="mb-5" variant={statusQ.data.configured ? "default" : "destructive"}>
          <AlertTitle>
            {statusQ.data.configured ? "Model provider connected" : "Model provider unavailable"}
          </AlertTitle>
          <AlertDescription>
            {statusQ.data.configured
              ? "Model: " +
                statusQ.data.model +
                " · Limit: " +
                statusQ.data.maxRequestsPerHour +
                " requests per hour. Keys remain on the server."
              : statusQ.data.message + " Local checks and navigation still work."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4" /> Accounting assistant
            </CardTitle>
            <CardDescription>
              Use a suggested workflow or write your own request. Ctrl/⌘ + Enter sends.
              Conversations are saved privately to your user account within the selected
              organisation. Only the latest 50 saved responses are shown; deletion is available
              below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canUse ? (
              <Alert>
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Your role does not have permission to use this assistant.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div aria-label="Quick prompts" className="flex flex-wrap gap-2">
                  {STARTERS.map((starter) => (
                    <Button
                      key={starter.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={askM.isPending}
                      onClick={() => {
                        setIntent(starter.intent);
                        setMessage(starter.prompt);
                      }}
                    >
                      {starter.label}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label htmlFor="ai-intent" className="text-sm font-medium">
                    Task
                  </label>
                  <RecordLookupSelect
                    value={intent}
                    onValueChange={(value) => setIntent(value as AiIntent)}
                  >
                    <SelectTrigger id="ai-intent" className="w-full sm:w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(INTENT_LABELS) as AiIntent[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {INTENT_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ai-question" className="text-sm font-medium">
                    Your question
                  </label>
                  <Textarea
                    id="ai-question"
                    rows={4}
                    maxLength={4000}
                    placeholder="Ask about accounting, bank exceptions, or draft a journal for review…"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    disabled={askM.isPending}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {message.length}/4,000 characters
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          askM.isPending ||
                          (!message && exchanges.length === 0) ||
                          deleteHistoryM.isPending
                        }
                        onClick={() => {
                          if (exchanges.length === 0) {
                            setMessage("");
                            return;
                          }
                          if (
                            window.confirm(
                              "Permanently delete ALL saved AI conversations for this organisation and your user account? This cannot be undone.",
                            )
                          ) {
                            deleteHistoryM.mutate({ all: true });
                            setMessage("");
                          }
                        }}
                      >
                        <Trash2 className="size-4" /> Delete history
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!message.trim() || askM.isPending}
                        onClick={send}
                      >
                        {askM.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                        {askM.isPending ? "Working…" : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {historyQ.isError && canUse ? (
              <Alert variant="destructive">
                <AlertTitle>Saved conversation history unavailable</AlertTitle>
                <AlertDescription>
                  Check the database migration and access permissions. New answers still work, but
                  may not be retained.{" "}
                  <Button size="sm" variant="outline" onClick={() => void historyQ.refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            <div
              className="space-y-4"
              role="log"
              aria-live="polite"
              aria-label="Assistant responses"
            >
              {historyQ.isPending && canUse ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Loading saved conversations…
                </div>
              ) : null}
              {exchanges.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  <Sparkles className="mx-auto mb-2 size-6" />
                  Responses will appear here. Nothing is posted automatically.
                </div>
              ) : (
                exchanges.map((entry) => (
                  <article key={entry.id} className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline">{INTENT_LABELS[entry.intent]}</Badge>
                      <Badge
                        variant={entry.mode === "not_configured" ? "destructive" : "secondary"}
                      >
                        {entry.mode === "model"
                          ? "Model explanation"
                          : entry.mode === "calculated"
                            ? "Calculated / local"
                            : "Not configured"}
                      </Badge>
                    </div>
                    <p className="rounded-md bg-muted/50 p-3 text-sm font-medium whitespace-pre-wrap break-words">
                      {entry.question}
                    </p>
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {entry.answer}
                    </div>
                    {entry.injectionFlagged ? (
                      <p className="text-xs text-destructive">
                        This request matched prompt-injection safeguards; verify its results.
                      </p>
                    ) : null}
                    {entry.disclaimer ? (
                      <p className="text-xs text-muted-foreground">{entry.disclaimer}</p>
                    ) : null}
                    {entry.suggestionId ? (
                      <p className="text-xs text-muted-foreground">
                        A proposal was saved. Review its status and details in Recent suggestions
                        below.
                      </p>
                    ) : null}
                    {entry.facts.length > 0 && (!onlyLatestFacts || entry.id === latestId) ? (
                      <details className="rounded-md border p-3">
                        <summary className="cursor-pointer text-xs font-medium">
                          View calculated facts and sample limitations
                        </summary>
                        <div className="mt-3 space-y-3">
                          {entry.facts.map((fact) => (
                            <div key={fact.kind}>
                              <p className="text-xs font-semibold">{fact.title}</p>
                              <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                {fact.body}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    <div className="flex flex-wrap justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyAnswer(entry.answer)}
                        >
                          <ClipboardCopy className="size-4" /> Copy response
                        </Button>
                        {canUse ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deleteHistoryM.isPending}
                            onClick={() => {
                              if (!window.confirm("Delete this AI conversation from your history?"))
                                return;
                              if (entry.id.startsWith("unsaved-")) {
                                setHistory((previous) =>
                                  previous.filter((item) => item.id !== entry.id),
                                );
                                return;
                              }
                              deleteHistoryM.mutate({ entryId: entry.id });
                            }}
                          >
                            <Trash2 className="size-4" /> Delete
                          </Button>
                        ) : null}
                      </div>
                      {entry.id === latestId && entry.facts.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOnlyLatestFacts((value) => !value)}
                        >
                          {onlyLatestFacts
                            ? "Show earlier fact blocks"
                            : "Hide earlier fact blocks"}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" /> Safety and permissions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>AI responses are suggestions, not authoritative tax or accounting advice.</p>
              <p>Only your current organisation's permitted ledger context is used.</p>
              <p>
                Banking and movement checks use bounded samples, not exhaustive full-ledger scans.
              </p>
              <p>
                Journal posting requires explicit confirmation, permissions and ledger validation.
              </p>
              <p>
                Provider keys remain server-side. Do not enter passwords or other secrets in
                prompts.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">
                  <History className="mr-1 inline size-3" /> Recent responses
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{exchanges.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recent proposals</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{rows.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ready to review</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {rows.filter((item) => getJournalPreview(item)).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Applied (recent)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {rows.filter((item) => item.status === "applied").length}
                </p>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Proposal counts cover the latest 30 records, not the lifetime total.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AiFinancialInsights
        companyId={companyId}
        currency={currency}
        canUse={canUse}
        canViewReports={canViewReports}
      />

      <AiJournalEvidenceExplorer
        companyId={companyId}
        currency={currency}
        canUse={canUse}
        canViewReports={canViewReports}
      />

      <AiJournalReviewQueue
        companyId={companyId}
        canUse={canUse}
        canViewReports={canViewReports}
        canManage={canApply}
        canViewMembers={canViewMembers}
      />

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" /> Recent suggestions
          </CardTitle>
          <CardDescription>
            Review the most recent 30 proposals. Only validated journal drafts can be posted;
            invoice and bill drafts remain non-posting guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canUse ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="sr-only" htmlFor="ai-search">
                Search suggestions
              </label>
              <input
                id="ai-search"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm sm:max-w-72"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title or intent"
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-44" aria-label="Filter suggestion status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="validated">Validated</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="invalid">Invalid</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void suggestionsQ.refetch()}
                disabled={suggestionsQ.isFetching}
              >
                <RotateCcw className={suggestionsQ.isFetching ? "size-4 animate-spin" : "size-4"} />{" "}
                Refresh
              </Button>
            </div>
          ) : null}
          {!canUse ? (
            <p className="text-sm text-muted-foreground">
              You do not have access to organisation AI suggestions.
            </p>
          ) : suggestionsQ.isPending ? (
            <LoadingState rows={4} />
          ) : suggestionsQ.isError ? (
            <ErrorState
              title="Unable to load AI suggestions"
              description={friendlyAuthError(suggestionsQ.error)}
              onRetry={() => void suggestionsQ.refetch()}
            />
          ) : filtered.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "No suggestions have been saved yet."
                : "No suggestions match your filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proposal</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const preview = getJournalPreview(item);
                    const kind = getAiSuggestionKind(item.intent, item.payload);
                    const canReject =
                      canApply && (item.status === "validated" || item.status === "pending");
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-40 max-w-80">
                          <p className="font-medium break-words">
                            {item.title || "Untitled proposal"}
                          </p>
                          {item.validation_errors?.length ? (
                            <p className="mt-1 text-xs text-destructive break-words">
                              {item.validation_errors.slice(0, 2).join("; ")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {kind.replaceAll("_", " ")}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <Clock3 className="mr-1 inline size-3" /> {item.created_at.slice(0, 10)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {preview && canApply ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReviewId(item.id)}
                              >
                                <CheckCircle2 className="size-4" /> Review & post
                              </Button>
                            ) : null}
                            {canReject ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={rejectM.isPending || applyM.isPending}
                                onClick={() => rejectM.mutate(item.id)}
                              >
                                Reject
                              </Button>
                            ) : null}
                            {item.status === "validated" && !preview ? (
                              <span className="self-center text-xs text-muted-foreground">
                                Non-posting draft
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(reviewId)}
        onOpenChange={(open) => {
          if (!open && !applyM.isPending) setReviewId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review journal draft before posting</DialogTitle>
            <DialogDescription>
              A model proposal is never a posted entry. Verify accounts, date, currency, amounts and
              period before confirming.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{selected?.title}</p>
          {journalLines ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account ID / description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalLines.map((line, index) => (
                    <TableRow key={String(index) + line.account_id}>
                      <TableCell className="text-xs">
                        <span className="font-medium">
                          {accountById.has(line.account_id)
                            ? accountById.get(line.account_id)?.code +
                              " — " +
                              accountById.get(line.account_id)?.name
                            : line.account_id}
                        </span>
                        {accountById.get(line.account_id)?.is_active === false ? (
                          <p className="text-destructive">
                            Inactive account — verify before posting
                          </p>
                        ) : null}
                        {line.description ? (
                          <p className="mt-1 text-muted-foreground">{line.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.debit_minor ? formatAmount(line.debit_minor) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.credit_minor ? formatAmount(line.credit_minor) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">Balanced total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatAmount(journalLines.reduce((sum, line) => sum + line.debit_minor, 0))}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatAmount(journalLines.reduce((sum, line) => sum + line.credit_minor, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>Journal is no longer valid</AlertTitle>
              <AlertDescription>Close this preview and refresh suggestions.</AlertDescription>
            </Alert>
          )}
          <Alert>
            <AlertDescription>
              Posting uses the selected journal date, the organisation's ledger rules and an
              idempotency key. No posting occurs until you confirm.
            </AlertDescription>
          </Alert>
          {accountsQ.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not verify journal account names</AlertTitle>
              <AlertDescription>{friendlyAuthError(accountsQ.error)}</AlertDescription>
            </Alert>
          ) : accountsQ.isFetching ? (
            <p className="text-xs text-muted-foreground">Loading chart of accounts for review…</p>
          ) : journalLines && !accountsResolved ? (
            <Alert variant="destructive">
              <AlertTitle>Unknown account on this journal</AlertTitle>
              <AlertDescription>
                Posting is disabled until the account can be verified in the selected organisation.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="ai-journal-date">
              Journal posting date
            </label>
            <input
              id="ai-journal-date"
              type="date"
              required
              className="flex h-9 w-full max-w-56 rounded-md border border-input bg-background px-3 text-sm"
              value={journalDate}
              onChange={(event) => setJournalDate(event.target.value)}
              disabled={applyM.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Choose the appropriate accounting date; closed periods will be rejected by the posting
              engine.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={applyM.isPending} onClick={() => setReviewId(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !selected || !journalLines || !accountsResolved || !journalDate || applyM.isPending
              }
              onClick={() => selected && applyM.mutate(selected.id)}
            >
              {applyM.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Confirm & post journal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}
