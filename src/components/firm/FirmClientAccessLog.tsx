import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import {
  disconnectFirmClient,
  listFirmClientAccessLog,
  listFirmClientConnections,
} from "@/lib/firm/firm.functions";
import { Button } from "@/components/ui/button";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useCanDo } from "@/hooks/use-can";

export function FirmClientAccessLog({ companyId }: { companyId: string }) {
  const canDisconnect = useCanDo("company.settings.edit");
  const load = useServerFn(listFirmClientAccessLog);
  const loadConnections = useServerFn(listFirmClientConnections);
  const disconnect = useServerFn(disconnectFirmClient);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["firm-client-access-log", companyId],
    queryFn: () => load({ data: { companyId } }),
    enabled: Boolean(companyId),
  });
  const connectionsQ = useQuery({
    queryKey: ["firm-client-connections", companyId],
    queryFn: () => loadConnections({ data: { companyId } }),
    enabled: Boolean(companyId),
  });
  const disconnectM = useMutation({
    mutationFn: (firmId: string) => disconnect({ data: { firmId, companyId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["firm-client-connections", companyId] }),
        qc.invalidateQueries({ queryKey: ["firm-client-access-log", companyId] }),
      ]);
      toast.success("Firm access disconnected");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected accounting firms</CardTitle>
          <CardDescription>
            Disconnecting a firm revokes its client access immediately. Your company records remain
            yours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectionsQ.isPending ? <LoadingState /> : null}
          {connectionsQ.isError ? (
            <QueryErrorState
              queries={[connectionsQ]}
              title="Firm connections could not be loaded"
            />
          ) : null}
          {connectionsQ.isSuccess && connectionsQ.data.length === 0 ? (
            <EmptyState
              title="No connected firms"
              description="A firm connected to your company will appear here."
            />
          ) : null}
          {(connectionsQ.data ?? []).map((firm) => (
            <div
              key={firm.firm_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{firm.firm_name}</p>
                <p className="text-xs text-muted-foreground">
                  Connected{" "}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(firm.linked_at),
                  )}
                </p>
              </div>
              {canDisconnect ? (
                <Button
                  variant="outline"
                  disabled={disconnectM.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Disconnect ${firm.firm_name}? Their access to this company will end immediately.`,
                      )
                    )
                      disconnectM.mutate(firm.firm_id);
                  }}
                >
                  Disconnect firm
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting firm access</CardTitle>
          <CardDescription>
            Firm staff access recorded by StreakBooks, with the module and time. Your company keeps
            control of its own books.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isPending ? <LoadingState /> : null}
          {query.isError ? (
            <QueryErrorState queries={[query]} title="Firm access history could not be loaded" />
          ) : null}
          {query.isSuccess && query.data.length === 0 ? (
            <EmptyState
              title="No firm access recorded"
              description="Firm staff access appears here."
            />
          ) : null}
          {query.isSuccess && query.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Firm staff</th>
                    <th className="px-2 py-2 font-medium">Module</th>
                    <th className="px-2 py-2 font-medium">Accessed</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((event, index) => (
                    <tr
                      key={`${event.user_id}-${event.accessed_at}-${index}`}
                      className="border-b last:border-0"
                    >
                      <td className="px-2 py-2">{event.user_name}</td>
                      <td className="px-2 py-2">{event.module_key}</td>
                      <td className="px-2 py-2">
                        <time dateTime={event.accessed_at}>
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(event.accessed_at))}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
