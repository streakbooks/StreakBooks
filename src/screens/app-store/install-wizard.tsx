import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INSTALL_WIZARD_STEPS,
  canAdvanceInstallWizard,
  type InstallWizardStepId,
} from "@/lib/app-store/install-wizard";
import {
  evaluateActivation,
  marketplaceAppActivationGates,
} from "@/lib/app-store/security/activation";
import type { ConnectorImplementationStatus } from "@/lib/app-store/connector-status";

type InstallWizardProps = {
  app: {
    name: string;
    modules: string[];
    implementationStatus: ConnectorImplementationStatus;
    securityReviewPassed: boolean;
    realCustomerDataEnabled: boolean;
    suspended: boolean;
  };
  companyName: string;
  hasInstallPermission: boolean;
};

export function AppStoreInstallWizard({
  app,
  companyName,
  hasInstallPermission,
}: InstallWizardProps) {
  const [step, setStep] = useState<InstallWizardStepId>("organisation");
  const [permissionsAcknowledged, setPermissionsAcknowledged] = useState(false);

  const gates = marketplaceAppActivationGates(app, hasInstallPermission);
  const activation = evaluateActivation(gates);

  const advance = useMemo(
    () =>
      canAdvanceInstallWizard({
        current: step,
        companySelected: Boolean(companyName),
        permissionsAcknowledged,
        oauthConfigured: false,
        mappingComplete: false,
        dryRunSucceeded: false,
        activationGates: gates,
      }),
    [step, companyName, permissionsAcknowledged, gates],
  );

  const index = Math.max(0, INSTALL_WIZARD_STEPS.findIndex((s) => s.id === step));
  const current = INSTALL_WIZARD_STEPS[index]!;

  function goNext() {
    if (!advance.ok) return;
    const next = INSTALL_WIZARD_STEPS[index + 1];
    if (next) setStep(next.id);
  }

  function goBack() {
    const prev = INSTALL_WIZARD_STEPS[index - 1];
    if (prev) setStep(prev.id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install wizard — {app.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {INSTALL_WIZARD_STEPS.map((s, i) => (
            <Badge key={s.id} variant={i === index ? "default" : i < index ? "secondary" : "outline"}>
              {i + 1}. {s.label}
            </Badge>
          ))}
        </div>

        <Alert>
          <AlertTitle>{current.label}</AlertTitle>
          <AlertDescription>{current.description}</AlertDescription>
        </Alert>

        {step === "organisation" ? (
          <p className="text-sm text-muted-foreground">
            Target organisation: <strong className="text-foreground">{companyName}</strong>
          </p>
        ) : null}

        {step === "permissions" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Modules this app may request: {app.modules.join(", ") || "none declared"}
            </p>
            <Button
              type="button"
              variant={permissionsAcknowledged ? "secondary" : "outline"}
              size="sm"
              onClick={() => setPermissionsAcknowledged(true)}
            >
              {permissionsAcknowledged ? "Permissions acknowledged" : "Acknowledge permissions"}
            </Button>
          </div>
        ) : null}

        {step === "oauth" ? (
          <Alert>
            <AlertTitle>Authorization blocked</AlertTitle>
            <AlertDescription>
              Provider OAuth credentials are not configured for this connector. The wizard cannot
              continue past this step until a verified OAuth client is available.
            </AlertDescription>
          </Alert>
        ) : null}

        {step === "mapping" || step === "dry_run" ? (
          <Alert>
            <AlertTitle>Waiting on prior steps</AlertTitle>
            <AlertDescription>
              Mapping and dry-run unlock after a successful provider authorization. No ledger posts
              are simulated.
            </AlertDescription>
          </Alert>
        ) : null}

        {step === "activate" ? (
          <Alert>
            <AlertTitle>{activation.allowed ? "Ready to activate" : "Activation locked"}</AlertTitle>
            <AlertDescription>{activation.reason}</AlertDescription>
          </Alert>
        ) : null}

        {!advance.ok && step !== "activate" ? (
          <p className="text-sm text-muted-foreground">{advance.reason}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={goBack}>
            Back
          </Button>
          {step !== "activate" ? (
            <Button type="button" size="sm" disabled={!advance.ok} onClick={goNext}>
              Continue
            </Button>
          ) : (
            <Button type="button" size="sm" disabled title={activation.reason}>
              Activate (locked)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
