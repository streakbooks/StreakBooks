import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeveloperPortalSectionShell } from "@/screens/developer/portal-section";

export function DeveloperRegisterAppPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="register"
      description="Register a new partner application. Submission does not publish or issue production credentials."
      alertTitle="Registration is fail-closed"
      alertBody="Saving a draft requires publisher verification. OAuth clients are not issued until the credential vault is configured."
      badges={["Draft only", "Vault: locked"]}
    >
      <form
        className="grid max-w-xl gap-4"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="app-code">App code</Label>
          <Input id="app-code" name="appCode" placeholder="my-partner-app" disabled />
        </div>
        <div className="space-y-1">
          <Label htmlFor="app-name">Display name</Label>
          <Input id="app-name" name="name" placeholder="Partner App" disabled />
        </div>
        <div className="space-y-1">
          <Label htmlFor="redirect-uri">Redirect URI</Label>
          <Input
            id="redirect-uri"
            name="redirectUri"
            placeholder="https://example.com/oauth/callback"
            disabled
          />
        </div>
        <Alert>
          <AlertTitle>Create draft disabled</AlertTitle>
          <AlertDescription>
            Interactive registration unlocks after publisher verification and vault configuration.
            Use API Documentation to review required scopes now.
          </AlertDescription>
        </Alert>
        <Button type="submit" disabled title="Publisher verification required">
          Create draft application
        </Button>
      </form>
    </DeveloperPortalSectionShell>
  );
}
