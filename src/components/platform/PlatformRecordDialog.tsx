import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformRecord, getSupervisedSupport } from "@/lib/platform/platform.functions";
import type { PlatformContext } from "@/lib/platform/catalog";
import type { RecordResource } from "@/lib/platform/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PlatformCustomer360,
  PlatformRecordFields,
  PlatformRelatedRecords,
} from "./PlatformCustomer360";
export function PlatformRecordDialog({
  resource,
  id,
  context,
  onClose,
}: {
  resource: RecordResource;
  id: string;
  context: PlatformContext;
  onClose: () => void;
}) {
  const load = useServerFn(getPlatformRecord);
  const loadSupport = useServerFn(getSupervisedSupport);
  const query = useQuery({
    queryKey: ["platform", "record", context.userId, resource, id],
    queryFn: () => load({ data: { resource, id } }),
    retry: false,
  });
  const support = useQuery({
    queryKey: ["platform", "supervised-support"],
    queryFn: () => loadSupport(),
    enabled:
      resource === "businesses" &&
      context.permissions.includes("support.view") &&
      context.permissions.includes("support.manage"),
    retry: false,
  });
  const name =
    query.data?.record["name"] ?? query.data?.record["full_name"] ?? query.data?.record["email"];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {resource === "businesses"
              ? "Customer 360"
              : resource === "firms"
                ? "Accounting firm"
                : "User details"}
            {name ? ` · ${String(name)}` : ""}
          </DialogTitle>
          <DialogDescription>Stored record · {id}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">Loading platform record…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>
              Retry record
            </Button>
          </div>
        ) : query.data ? (
          resource === "businesses" ? (
            <PlatformCustomer360
              key={id}
              business={query.data.record}
              related={query.data.related}
              canRequestSupport={
                support.data?.ready === true && context.permissions.includes("support.manage")
              }
              permissions={context.permissions}
            />
          ) : (
            <div className="space-y-5">
              <PlatformRecordFields row={query.data.record} />
              <PlatformRelatedRecords
                related={query.data.related}
                permissions={context.permissions}
              />
            </div>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
