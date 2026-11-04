import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryMeta } from "@/lib/settings/registry";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function SettingsUnavailablePanel({ meta }: { meta: CategoryMeta }) {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>These settings are not available yet</AlertTitle>
        <AlertDescription>
          {meta.id === "fixed_assets"
            ? "Manage your assets and depreciation in the Fixed assets workspace. Additional configuration is not available here yet."
            : `${meta.label} cannot be configured in this version of LinkBooks.`}
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{meta.label}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {meta.id === "fixed_assets" ? (
            <Button asChild>
              <Link to="/fixed-assets">Open fixed assets</Link>
            </Button>
          ) : (
            "Your existing organisation settings are unchanged."
          )}
        </CardContent>
      </Card>
    </div>
  );
}
