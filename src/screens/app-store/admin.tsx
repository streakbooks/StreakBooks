import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import {
  decideMarketplaceSecurityReview,
  listCompanyMarketplaceApps,
  listMarketplaceSecurityReviews,
  suspendMarketplaceAppListing,
} from "@/lib/app-store/app-store.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

/** Platform administration — RBAC enforced; not merely hidden from nav. */
export function AppStoreAdminPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdmin = can("appstore.manage_certification" as Permission);
  const queryClient = useQueryClient();
  const fetchReviews = useServerFn(listMarketplaceSecurityReviews);
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const decideReview = useServerFn(decideMarketplaceSecurityReview);
  const suspendListing = useServerFn(suspendMarketplaceAppListing);
  const [suspendAppCode, setSuspendAppCode] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const reviews = useQuery({
    queryKey: ["app-store-security-reviews", company?.id],
    queryFn: () => fetchReviews({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const decideMutation = useMutation({
    mutationFn: (input: { reviewId: string; approve: boolean }) =>
      decideReview({
        data: {
          companyId: company!.id,
          reviewId: input.reviewId,
          approve: input.approve,
          reviewerNotes: input.approve
            ? "Admin approved checklist; real customer data remains locked."
            : "Admin rejected pending remediation.",
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["app-store-security-reviews", company?.id],
      });
      toast.success("Review decision recorded");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const suspendMutation = useMutation({
    mutationFn: () =>
      suspendListing({
        data: {
          companyId: company!.id,
          appCode: suspendAppCode.trim(),
          reason: suspendReason.trim() || "Suspended by platform administrator",
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app-store-catalogue", company?.id] });
      setSuspendAppCode("");
      setSuspendReason("");
      toast.success("Listing suspension recorded");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canAdmin) {
    return (
      <>
        <PageHeader title="Platform Administration" description="App Store" />
        <EmptyState
          title="No access"
          description="Requires appstore.manage_certification. Privileged admin tools are not exposed by hiding links alone."
        />
      </>
    );
  }

  const pending = (reviews.data ?? []).filter(
    (r) => r.status === "submitted" || r.status === "under_review",
  );
  const suspended = (catalogue.data?.apps ?? []).filter((a) => a.suspended);

  return (
    <>
      <PageHeader
        title="Platform Administration"
        description="Approval queue, listing controls and audit-oriented marketplace operations."
      />
      <AppStoreSubnav current="admin" />

      <Alert className="mb-6">
        <AlertTitle>Administrator controls</AlertTitle>
        <AlertDescription>
          Approving a security review does not enable real customer data. Install and sync stay
          fail-closed until E2E verification and explicit real-data enablement.
        </AlertDescription>
      </Alert>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Security approval queue</h2>
        {reviews.isLoading ? <LoadingState /> : null}
        {reviews.isError ? (
          <ErrorState
            title="Could not load reviews"
            description={friendlyAuthError(reviews.error)}
            onRetry={() => reviews.refetch()}
          />
        ) : null}
        {!reviews.isLoading && !reviews.isError ? (
          pending.length === 0 ? (
            <EmptyState
              title="No pending reviews"
              description="Submitted publisher security reviews appear here for decide actions."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.appCode}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.submittedAt ?? row.createdAt}
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Button
                          size="sm"
                          disabled={decideMutation.isPending}
                          onClick={() =>
                            decideMutation.mutate({ reviewId: row.id, approve: true })
                          }
                        >
                          Approve checklist
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decideMutation.isPending}
                          onClick={() =>
                            decideMutation.mutate({ reviewId: row.id, approve: false })
                          }
                        >
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Emergency listing suspension</h2>
        <div className="grid max-w-xl gap-3">
          <div className="space-y-1">
            <Label htmlFor="admin-suspend-app">App code</Label>
            <Input
              id="admin-suspend-app"
              value={suspendAppCode}
              onChange={(e) => setSuspendAppCode(e.target.value)}
              placeholder="shopify"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-suspend-reason">Reason</Label>
            <Input
              id="admin-suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Security incident"
            />
          </div>
          <Button
            disabled={!suspendAppCode.trim() || suspendMutation.isPending}
            onClick={() => suspendMutation.mutate()}
          >
            Suspend listing
          </Button>
        </div>
        {suspended.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Currently suspended in catalogue: {suspended.map((a) => a.code).join(", ")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No suspended catalogue listings.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Audit snapshot</h2>
        <p className="text-sm text-muted-foreground">
          Review count: {(reviews.data ?? []).length}. Catalogue apps:{" "}
          {(catalogue.data?.apps ?? []).length}. Live third-party connectors completed: 0.
        </p>
      </section>
    </>
  );
}
