import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bootstrapPlatformOwner, getPlatformBilling } from "@/lib/billing/platform.functions";

export const Route = createFileRoute("/_authenticated/platform/billing")({
  head: () => ({ meta: [{ title: "Platform billing — LinkBooks" }] }),
  component: PlatformBillingPage,
});

function PlatformBillingPage() {
  const load = useServerFn(getPlatformBilling);
  const bootstrap = useServerFn(bootstrapPlatformOwner);
  const query = useQuery({
    queryKey: ["platform-billing"],
    queryFn: () => load(),
    retry: false,
  });

  if (query.isLoading) return <main className="p-6">Loading platform billing…</main>;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold">Platform billing</h1>
        <p>{query.error instanceof Error ? query.error.message : "Access denied."}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            bootstrap()
              .then(() => {
                toast.success("Platform owner recorded.");
                void query.refetch();
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Bootstrap failed."),
              )
          }
        >
          Bootstrap platform owner
        </Button>
      </main>
    );
  }

  const versions = Array.isArray(query.data?.versions) ? query.data.versions : [];
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Platform billing</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {query.data?.role}. Published prices stay on existing subscribers until an
        explicit migration. Publishing a new version requires multi-factor authentication. Non-USD
        prices are marked for review. Tax collection is not enabled.
      </p>
      <ul className="space-y-1 text-sm">
        {versions.map((row) => {
          const version = row as {
            id?: string;
            plan_code?: string;
            status?: string;
            version_no?: number;
          };
          return (
            <li key={version.id ?? `${version.plan_code}-${version.version_no}`}>
              {version.plan_code} version {version.version_no} · {version.status}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
