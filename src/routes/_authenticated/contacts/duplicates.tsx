import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { findPotentialDuplicates, mergeContacts } from "@/lib/contacts/contacts.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/contacts/duplicates")({
  head: () => ({ meta: [{ title: "Duplicate contacts — LinkBooks" }] }),
  component: DuplicatesPage,
});

function DuplicatesPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const qc = useQueryClient();
  const fetchDupes = useServerFn(findPotentialDuplicates);
  const mergeFn = useServerFn(mergeContacts);
  const canManage = useCanDo("contacts.manage");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typedContactName, setTypedContactName] = useState("");

  const query = useQuery({
    queryKey: ["contact-duplicates", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchDupes({ data: { companyId: companyId! } }),
  });

  const mergeM = useMutation({
    mutationFn: (input: { survivorId: string; mergeId: string }) =>
      mergeFn({
        data: {
          companyId: companyId!,
          survivorId: input.survivorId,
          mergeId: input.mergeId,
          confirm: true,
        },
      }),
    onSuccess: async (result) => {
      setConfirming(null);
      setTypedContactName("");
      await qc.invalidateQueries({ queryKey: ["contact-duplicates", companyId] });
      await qc.invalidateQueries({ queryKey: ["contacts", companyId] });
      await qc.invalidateQueries({ queryKey: ["contacts-count", companyId] });
      await qc.invalidateQueries({ queryKey: ["contacts-summary", companyId] });
      toast.success(
        `Contacts merged — ${result.rowsMoved} record${result.rowsMoved === 1 ? "" : "s"} moved to the surviving contact`,
      );
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Potential duplicates"
      description="Matches use name, email, phone, tax ID and account number. Merges are never automatic."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/contacts" search={{ view: undefined }}>
            Directory
          </Link>
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          onRetry={() => void query.refetch()}
          title="Could not scan"
          description={friendlyAuthError(query.error)}
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          title="No likely duplicates"
          description="No pairs scored high enough to review."
        />
      ) : (
        <ul className="space-y-4">
          {(
            query.data as Array<{
              a: { id: string; name: string; email: string | null };
              b: { id: string; name: string; email: string | null };
              score: number;
              reasons: string[];
            }>
          ).map((pair) => {
            const key = `${pair.a.id}-${pair.b.id}`;
            const sourceName = confirming === `${key}:a` ? pair.b.name : pair.a.name;
            return (
              <li key={key} className="rounded-md border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Score {pair.score}</Badge>
                  {pair.reasons.map((r) => (
                    <Badge key={r} variant="outline">
                      {r}
                    </Badge>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <Link
                      to="/contacts/$contactId"
                      params={{ contactId: pair.a.id }}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {pair.a.name}
                    </Link>
                    <p className="text-muted-foreground">{pair.a.email ?? "No email"}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={mergeM.isPending || !canManage}
                      onClick={() => {
                        setConfirming(`${key}:a`);
                        setTypedContactName("");
                      }}
                    >
                      Keep this · merge other
                    </Button>
                  </div>
                  <div>
                    <Link
                      to="/contacts/$contactId"
                      params={{ contactId: pair.b.id }}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {pair.b.name}
                    </Link>
                    <p className="text-muted-foreground">{pair.b.email ?? "No email"}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={mergeM.isPending || !canManage}
                      onClick={() => {
                        setConfirming(`${key}:b`);
                        setTypedContactName("");
                      }}
                    >
                      Keep this · merge other
                    </Button>
                  </div>
                </div>
                {confirming === `${key}:a` || confirming === `${key}:b` ? (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                    <p className="mb-2">
                      The surviving contact keeps its identity. Linked invoices, bills and related
                      documents are reassigned in one database transaction; posted journals remain
                      unchanged. The other contact is archived.
                    </p>
                    <p className="mb-2 font-medium">
                      To confirm, type the name of the contact being archived: {sourceName}
                    </p>
                    <Input
                      aria-label="Type the contact name to confirm merge"
                      className="mb-3 max-w-md"
                      value={typedContactName}
                      onChange={(e) => setTypedContactName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={
                          mergeM.isPending ||
                          !canManage ||
                          typedContactName.trim() !== sourceName.trim()
                        }
                        onClick={() =>
                          mergeM.mutate(
                            confirming.endsWith(":a")
                              ? { survivorId: pair.a.id, mergeId: pair.b.id }
                              : { survivorId: pair.b.id, mergeId: pair.a.id },
                          )
                        }
                      >
                        Confirm merge
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setConfirming(null);
                          setTypedContactName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </ListWorkspace>
  );
}
