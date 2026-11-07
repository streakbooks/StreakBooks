import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-can";
import { submitMarketplaceSecurityReview } from "@/lib/app-store/app-store.functions";
import {
  evaluateSecurityReview,
  SECURITY_REVIEW_CHECKLIST,
  type SecurityChecklistKey,
} from "@/lib/app-store/security/approval";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function DeveloperSubmissionPage() {
  const { can } = useCan();
  const canSubmit =
    can("developer.submit_apps" as Permission) || can("developer.manage_apps" as Permission);
  const submitReview = useServerFn(submitMarketplaceSecurityReview);
  const [appCode, setAppCode] = useState("");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Partial<Record<SecurityChecklistKey, boolean>>>({});

  const preview = useMemo(
    () =>
      evaluateSecurityReview({
        checklist: checks,
        adminApproved: false,
        e2eVerified: false,
        suspended: false,
      }),
    [checks],
  );

  const mutation = useMutation({
    mutationFn: () =>
      submitReview({
        data: {
          appCode: appCode.trim(),
          checklist: Object.fromEntries(
            SECURITY_REVIEW_CHECKLIST.map((item) => [item.key, checks[item.key] === true]),
          ),
          submitterNotes: notes,
        },
      }),
    onSuccess: (result) => {
      toast.success("Security review submitted", {
        description: `Status ${result.status}. Real customer data remains locked (fail closed).`,
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (!canSubmit) {
    return (
      <>
        <ListWorkspace title="App Submission" description="Developer portal">
        <EmptyState
          title="No access"
          description="Requires developer.submit_apps or developer.manage_apps."
        />
    </ListWorkspace>
      </>
    );
  }

  return (
    <>
      <ListWorkspace
        title="App Submission"
        description="Security verification checklist before third-party apps can be publicly listed or activated."
        subnav={<DeveloperSubnav current="submission" />}
      >
      <Alert className="mb-6">
        <AlertTitle>Fail closed</AlertTitle>
        <AlertDescription>
          Submitting a review never enables real customer data. Administrator approval and verified
          E2E synchronization are still required. Incomplete checklists are rejected by the preview
          gates below.
        </AlertDescription>
      </Alert>

      <div className="mb-6 max-w-xl space-y-3">
        <div className="space-y-2">
          <Label htmlFor="app-code">Marketplace app code</Label>
          <Input
            id="app-code"
            value={appCode}
            onChange={(e) => setAppCode(e.target.value)}
            placeholder="e.g. hubdoc"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="submitter-notes">Submitter notes</Label>
          <Textarea
            id="submitter-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Evidence links, sandbox accounts, threat model summary…"
          />
        </div>
      </div>

      <div className="mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Security checklist</h2>
        {SECURITY_REVIEW_CHECKLIST.map((item) => (
          <label key={item.key} className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={checks[item.key] === true}
              onCheckedChange={(value) =>
                setChecks((prev) => ({ ...prev, [item.key]: value === true }))
              }
              aria-label={item.label}
            />
            <span className="text-sm leading-snug">{item.label}</span>
          </label>
        ))}
      </div>

      <Alert className="mb-6">
        <AlertTitle>Gate preview</AlertTitle>
        <AlertDescription>
          {preview.reason} Can publish after admin approval path:{" "}
          {preview.missingChecklist.length === 0 ? "checklist complete" : "blocked"}. Real-data
          enablement from this form: never.
        </AlertDescription>
      </Alert>

      <Button
        disabled={mutation.isPending || !appCode.trim() || preview.missingChecklist.length > 0}
        onClick={() => mutation.mutate()}
      >
        Submit for security review
      </Button>
        </ListWorkspace>
  );
}
