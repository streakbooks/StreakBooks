import { friendlyAuthError } from "@/lib/auth-helpers";
import { ErrorState } from "./states";

type QueryResult = { isError: boolean; error: unknown; refetch: () => unknown };

/** Fail closed when required form data cannot load; never substitute an empty ledger or list. */
export function QueryErrorState({
  queries,
  title = "Could not load this workspace",
  description,
}: {
  queries: readonly QueryResult[];
  title?: string;
  /** Optional override when callers need migration hints or access reasons beyond friendlyAuthError. */
  description?: string;
}) {
  const failed = queries.filter((query) => query.isError);
  if (failed.length === 0) return null;
  return (
    <ErrorState
      title={title}
      description={description ?? friendlyAuthError(failed[0]!.error)}
      onRetry={() => {
        for (const query of failed) void query.refetch();
      }}
    />
  );
}
