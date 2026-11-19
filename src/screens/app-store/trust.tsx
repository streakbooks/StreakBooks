import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { MarketplaceAppCard } from "@/components/app-store/MarketplaceAppCard";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";
import {
  decideMarketplaceSecurityReview,
  listCompanyMarketplaceApps,
  listMarketplaceSecurityReviews,
  suspendMarketplaceAppListing,
} from "@/lib/app-store/app-store.functions";
import { isCertified } from "@/lib/app-store/trust";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Trust & Certification overview (XP-04 / XP-10) + security approval queue (AS-SEC). */
export function AppStoreTrustPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("appstore.view" as Permission) || can("appstore.manage_certification" as Permission);
  const canCertify = can("appstore.manage_certification" as Permission);
  const queryClient = useQueryClient();
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const fetchReviews = useServerFn(listMarketplaceSecurityReviews);
  const decideReview = useServerFn(decideMarketplaceSecurityReview);
  const suspendListing = useServerFn(suspendMarketplaceAppListing);
  const [suspendAppCode, setSuspendAppCode] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const reviews = useQuery({
    queryKey: ["app-store-security-reviews", company?.id],
    queryFn: () => fetchReviews({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canCertify,
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
            ? "Approved; real customer data remains locked until E2E enablement."
            : "Rejected pending remediation.",
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["app-store-security-reviews", company?.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["app-store-catalogue", company?.id] });
      toast.success(
        result.securityReviewPassed
          ? `Security review approved for ${result.appCode} (real data still locked)`
          : `Security review rejected for ${result.appCode}`,
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const suspendMutation = useMutation({
    mutationFn: () =>
      suspendListing({
        data: {
          companyId: company!.id,
          appCode: suspendAppCode.trim(),
          reason: suspendReason.trim(),
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["app-store-catalogue", company?.id] });
      void queryClient.invalidateQueries({
        queryKey: ["app-store-security-alerts", company?.id],
      });
      setSuspendAppCode("");
      setSuspendReason("");
      toast.success(`Listing suspended for ${result.appCode}`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Trust & Certification" description="App Store">
        <EmptyState title="No access" description="Requires appstore.view." />
      </ListWorkspace>
    );
  }
  if (catalogue.isLoading) {
    return (
      <ListWorkspace
        title="Trust & Certification"
        description="Marketplace trust signals."
        subnav={<AppStoreSubnav current="trust" />}
      >
        <LoadingState />
      </ListWorkspace>
    );
  }
  if (catalogue.isError) {
    return (
      <ErrorState
        title="Could not load trust catalogue"
        description={friendlyAuthError(catalogue.error)}
        onRetry={() => catalogue.refetch()}
      />
    );
  }

  const apps = catalogue.data?.apps ?? [];
  const verified = apps.filter((a) => a.publisherVerified);
  const certified = apps.filter((a) => isCertified(a.certificationStatus));
  const withNotices = apps.filter((a) => a.deprecationAt || a.breakingChangeNotes);
  const securityPassed = apps.filter((a) => a.securityReviewPassed);
  const realDataLocked = apps.filter((a) => !a.realCustomerDataEnabled);

  return (
    <ListWorkspace
      title="Trust & Certification"
      description="Verified publishers, certification status, security approval and compatibility notices."
      subnav={<AppStoreSubnav current="trust" />}
    >
      <Alert className="mb-6">
        <AlertTitle>Certification is earned, not claimed</AlertTitle>
        <AlertDescription>
          LinkBooks Certified requires formal security, accounting, API, performance, accessibility
          and reliability reviews with periodic reassessment. Approving a security review never
          enables real customer data by itself (fail closed). Native apps may show verified
          publisher status before certification completes.
        </AlertDescription>
      </Alert>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Verified publishers</p>
          <p className="text-3xl font-semibold tabular-nums">{verified.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Certified apps</p>
          <p className="text-3xl font-semibold tabular-nums">{certified.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Security review passed</p>
          <p className="text-3xl font-semibold tabular-nums">{securityPassed.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Real data locked</p>
          <p className="text-3xl font-semibold tabular-nums">{realDataLocked.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Compatibility notices</p>
          <p className="text-3xl font-semibold tabular-nums">{withNotices.length}</p>
        </div>
      </div>

      {canCertify ? (
        <section className="mb-8 space-y-3 rounded-lg border p-4">
          <h2 className="text-xl font-semibold tracking-tight">Emergency listing suspension</h2>
          <p className="text-sm text-muted-foreground">
            Immediately suspends public listing, clears real-data and security-review flags, and
            disconnects company connections for the app code. Irreversible from this UI without a
            later ops restore process.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="suspend-app">App code</Label>
              <Input
                id="suspend-app"
                value={suspendAppCode}
                onChange={(e) => setSuspendAppCode(e.target.value)}
                placeholder="shopify"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suspend-reason">Reason</Label>
              <Input
                id="suspend-reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Security incident reference…"
              />
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={
              suspendMutation.isPending || !suspendAppCode.trim() || suspendReason.trim().length < 8
            }
            onClick={() => suspendMutation.mutate()}
          >
            Suspend listing
          </Button>
        </section>
      ) : null}

      {canCertify ? (
        <section className="mb-8 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Security approval queue</h2>
          {reviews.isLoading ? <LoadingState /> : null}
          {reviews.isError ? (
            <ErrorState
              title="Could not load security reviews"
              description={friendlyAuthError(reviews.error)}
              onRetry={() => reviews.refetch()}
            />
          ) : null}
          {!reviews.isLoading && !reviews.isError ? (
            (reviews.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No security reviews yet"
                description="Developer submissions appear here for administrator approval. Approval never enables real customer data alone."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app-store/$section" params={{ section: "explore" }}>
                      Explore apps
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>App</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.data?.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.appCode}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.submittedAt ?? "—"}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {row.status === "submitted" || row.status === "under_review" ? (
                            <>
                              <Button
                                size="sm"
                                disabled={decideMutation.isPending}
                                onClick={() =>
                                  decideMutation.mutate({ reviewId: row.id, approve: true })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={decideMutation.isPending}
                                onClick={() =>
                                  decideMutation.mutate({ reviewId: row.id, approve: false })
                                }
                              >
                                Reject
                              </Button>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground">Decided</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Catalogue trust posture</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <MarketplaceAppCard key={app.code} app={app} />
          ))}
        </div>
      </section>
    </ListWorkspace>
  );
}
