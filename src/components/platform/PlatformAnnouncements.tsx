import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { getAnnouncements } from "@/lib/platform/platform.functions";
export function PlatformAnnouncements({ companyId }: { companyId: string | null }) {
  const load = useServerFn(getAnnouncements);
  const query = useQuery({
    queryKey: ["platform-announcements", companyId],
    queryFn: () => load({ data: { companyId } }),
    retry: false,
    refetchInterval: 60000,
  });
  if (query.isError) {
    return (
      <aside aria-label="Platform announcements" className="border-b px-6 py-3">
        <QueryErrorState queries={[query]} title="Could not load platform announcements" />
      </aside>
    );
  }
  return query.data?.length ? (
    <aside
      aria-label="Platform announcements"
      className="space-y-2 border-b bg-primary/5 px-6 py-3"
    >
      {query.data.map((a) => (
        <div key={a.id} className="text-sm">
          <strong>{a.name}: </strong>
          {a.message}
        </div>
      ))}
    </aside>
  ) : null;
}
