import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  label: string;
  dirty: boolean;
  canEdit: boolean;
  pending: boolean;
  valid?: boolean;
  serverChanged?: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
};

/** Common, functional save / discard controls for the older Settings Centre forms. */
export function SettingsSaveBar({
  label,
  dirty,
  canEdit,
  pending,
  valid = true,
  serverChanged = false,
  error,
  onSave,
  onDiscard,
}: Props) {
  return (
    <div className="space-y-3 sm:col-span-2">
      {serverChanged ? (
        <Alert variant="destructive">
          <AlertTitle>Settings changed in another session</AlertTitle>
          <AlertDescription>
            Your draft is preserved. Reload the latest values before changing these settings.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save changes</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button
          type="button"
          size="sm"
          disabled={!canEdit || !dirty || pending || !valid || serverChanged}
          onClick={onSave}
        >
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : label}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!dirty || pending}
          onClick={onDiscard}
        >
          {serverChanged ? "Reload latest" : "Discard changes"}
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {!canEdit
            ? "Read-only settings"
            : serverChanged
              ? "Newer server values detected"
              : dirty
                ? valid
                  ? "Unsaved changes"
                  : "Review invalid settings"
                : "All changes saved"}
        </span>
      </div>
    </div>
  );
}
