"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  SupplierIntelligenceSidebar,
  ShowSupplierSummaryButton,
  type AttachmentPreview,
} from "@/components/purchases/SupplierIntelligenceSidebar";
import type { BillSidebarState } from "@/lib/settings/ui-preferences.functions";

type Props = {
  companyId: string;
  contactId: string | null;
  currency: string;
  sidebarState: BillSidebarState;
  sidebarWidthPx: number;
  sidebarTab: string;
  onSidebarStateChange: (s: BillSidebarState) => void;
  onSidebarWidthChange: (w: number) => void;
  onSidebarTabChange: (t: string) => void;
  attachments?: AttachmentPreview[] | undefined;
  onDownloadAttachment?: ((id: string) => void) | undefined;
  header: ReactNode;
  children: ReactNode;
  className?: string | undefined;
};

/**
 * Premium three-pane New Bill shell: header + expanding main workspace + right supplier sidebar.
 * Closing/collapsing the sidebar expands the main form without remounting children.
 */
export function BillWorkspaceLayout({
  companyId,
  contactId,
  currency,
  sidebarState,
  sidebarWidthPx,
  sidebarTab,
  onSidebarStateChange,
  onSidebarWidthChange,
  onSidebarTabChange,
  attachments,
  onDownloadAttachment,
  header,
  children,
  className,
}: Props) {
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1280px)");
  useEffect(() => {
    if (wide) setMobileSummaryOpen(false);
  }, [wide]);
  return (
    <div className={cn("flex min-h-[calc(100vh-4rem)] flex-col", className)}>
      <div className="shrink-0 border-b border-border bg-background px-1 pb-3">
        {header}
        {sidebarState === "closed" ? (
          <div className="mt-2 hidden items-center gap-3 xl:flex">
            <ShowSupplierSummaryButton onClick={() => onSidebarStateChange("open")} />
            {contactId ? (
              <span className="text-xs text-muted-foreground">
                Review supplier balances, recent bills and attachments.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1">
        <div role="region" aria-label="Bill entry" className="min-w-0 flex-1 px-1 py-4">
          {children}
        </div>
        {wide ? (
          <SupplierIntelligenceSidebar
            companyId={companyId}
            contactId={contactId}
            currency={currency}
            state={sidebarState}
            widthPx={sidebarWidthPx}
            tab={sidebarTab}
            onStateChange={onSidebarStateChange}
            onWidthChange={onSidebarWidthChange}
            onTabChange={onSidebarTabChange}
            attachments={attachments}
            onDownloadAttachment={onDownloadAttachment}
            className="hidden xl:flex"
          />
        ) : null}
      </div>
      <Sheet open={mobileSummaryOpen} onOpenChange={setMobileSummaryOpen}>
        <div className="sticky bottom-0 border-t border-border bg-card p-2 xl:hidden print:hidden">
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              aria-label="Show supplier summary"
            >
              <PanelRightOpen aria-hidden />
              Supplier summary
            </Button>
          </SheetTrigger>
        </div>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 pt-12 sm:max-w-lg">
          <SheetTitle className="sr-only">Supplier summary</SheetTitle>
          <SheetDescription className="sr-only">
            Supplier balances, recent bills and attachment previews. Close to return to your bill.
          </SheetDescription>
          <SupplierIntelligenceSidebar
            companyId={companyId}
            contactId={contactId}
            currency={currency}
            state="open"
            widthPx={420}
            tab={sidebarTab}
            onStateChange={() => setMobileSummaryOpen(false)}
            onWidthChange={onSidebarWidthChange}
            onTabChange={onSidebarTabChange}
            attachments={attachments}
            onDownloadAttachment={onDownloadAttachment}
            className="max-w-full border-l-0"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
