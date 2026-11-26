import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LookupSelect } from "@/components/lookup";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  API_SCOPES,
  issueApiKey,
  listApiKeys,
  setApiKeyScopes,
} from "@/lib/billing/api-keys.functions";

const queryKey = ["platform-api-keys"] as const;
const SCOPE_OPTIONS = API_SCOPES.map((scope) => ({ id: scope, label: scope }));

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error || typeof error === "string" ? friendlyAuthError(error) : fallback;
}

export function ApiKeysAdmin({ isOwner }: { isOwner: boolean }) {
  const load = useServerFn(listApiKeys);
  const issue = useServerFn(issueApiKey);
  const scope = useServerFn(setApiKeyScopes);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [replaceId, setReplaceId] = useState("");
  const [scopeKey, setScopeKey] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey });
  const issueM = useMutation({
    mutationFn: () => issue({ data: { replaceId: replaceId || null, label, reason } }),
    onSuccess: (result) => {
      setShown(result.key);
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The key could not be issued.")),
  });
  const scopeM = useMutation({
    mutationFn: () =>
      scope({
        data: {
          keyId: scopeKey,
          scopes: scopes.filter((item): item is (typeof API_SCOPES)[number] =>
            (API_SCOPES as readonly string[]).includes(item),
          ),
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Scopes saved.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The scopes could not be saved.")),
  });
  const active = (query.data ?? []).filter((key) => !key.retiredAt);
  return (
    <section className="space-y-3" aria-labelledby="api-keys-heading">
      <header className="space-y-1">
        <h2 id="api-keys-heading" className="text-xl font-semibold">
          Billing API keys
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Keys call the admin endpoints of the REST API (/api/v1/admin/billing) with the scopes
          granted here. The key is shown once; StreakBooks stores only its hash.
        </p>
      </header>
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load billing API keys" />
      ) : !query.isSuccess ? (
        <p className="text-sm text-muted-foreground">Loading billing API keys…</p>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {(query.data ?? []).map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={key.retiredAt ? "secondary" : "success"}>
                  {key.retiredAt ? "retired" : "active"}
                </Badge>
                <span className="font-medium">{key.label}</span>
                <span className="text-muted-foreground">
                  {key.scopes.length ? key.scopes.join(", ") : "no scopes"}
                  {key.lastUsedAt
                    ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          {shown ? (
            <div className="space-y-1 rounded-md border border-amber-500 p-3 text-sm">
              <p className="font-medium">Copy this key now. It will not be shown again.</p>
              <code className="block break-all">{shown}</code>
              <Button size="sm" variant="outline" onClick={() => setShown(null)}>
                I have stored it
              </Button>
            </div>
          ) : null}
          {isOwner ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm">
                Label
                <Input className="mt-1" value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>
              <div className="text-sm">
                Replace key (optional)
                <LookupSelect
                  options={active.map((key) => ({ id: key.id, label: key.label }))}
                  value={replaceId}
                  onChange={setReplaceId}
                  ariaLabel="Key to replace"
                />
              </div>
              <label className="text-sm">
                Reason
                <Input
                  className="mt-1"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="flex items-end">
                <Button
                  size="sm"
                  disabled={
                    !label.trim() ||
                    reason.trim().length < 3 ||
                    issueM.isPending ||
                    !query.isSuccess
                  }
                  onClick={() => issueM.mutate()}
                >
                  {replaceId ? "Rotate key" : "Issue key"}
                </Button>
              </div>
              <div className="text-sm">
                Key
                <LookupSelect
                  options={active.map((key) => ({ id: key.id, label: key.label }))}
                  value={scopeKey}
                  onChange={(id) => {
                    setScopeKey(id);
                    setScopes(active.find((key) => key.id === id)?.scopes ?? []);
                  }}
                  ariaLabel="Key scopes"
                />
              </div>
              <div className="text-sm sm:col-span-2">
                Scopes
                <MultiLookupSelect
                  options={SCOPE_OPTIONS}
                  values={scopes}
                  onValuesChange={setScopes}
                  ariaLabel="Scopes"
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !scopeKey || reason.trim().length < 3 || scopeM.isPending || !query.isSuccess
                  }
                  onClick={() => scopeM.mutate()}
                >
                  Save scopes
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
