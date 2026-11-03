import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformHealth } from "@/lib/platform/platform.functions";
import { Button } from "@/components/ui/button";
export function PlatformHealth() {
  const load = useServerFn(getPlatformHealth);
  const query = useQuery({
    queryKey: ["platform", "health"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 60000,
  });
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Infrastructure measurements</h2>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Check now
        </Button>
      </div>
      {query.isPending ? (
        <p role="status">Checking database…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {Object.entries(query.data).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted p-4">
              <dt className="text-sm text-muted-foreground">{k.replaceAll(/([A-Z])/g, " $1")}</dt>
              <dd className="mt-1 font-medium">
                {v == null
                  ? "Unavailable — no telemetry source connected"
                  : typeof v === "number"
                    ? v.toLocaleString()
                    : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-5 text-sm text-muted-foreground">
        Database reachability and storage are measured on request. Uptime, API traffic, queue and
        backup telemetry need an infrastructure adapter.
      </p>
    </section>
  );
}
