import { useEffect, useMemo, useState } from "react";
import { SettingsDestinationLink } from "./ModuleSettingsLinks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getOrganisationConfig,
  upsertOrganisationConfig,
  type SettingsDocument,
} from "@/lib/settings/settings-centre.functions";
import {
  areSettingsDocumentsEqual,
  isNullableNumericSetting,
  validateSettingsDraft,
} from "@/lib/settings/form-state";
import {
  CATEGORY_SCHEMAS,
  categoryMeta,
  defaultDocumentFor,
  type SettingsCategory,
} from "@/lib/settings/registry";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Props = {
  companyId: string;
  category: SettingsCategory;
  canEdit: boolean;
  showModuleLinks?: boolean;
};

type DraftState = {
  scope: string;
  baseline: SettingsDocument;
  draft: SettingsDocument;
  version: number;
};

const ENUM_OPTIONS: Record<string, readonly string[]> = {
  "accounting.reporting_basis": ["accrual", "cash"],
  "sales.late_fee_type": ["fixed", "percentage"],
  "reports.default_basis": ["accrual", "cash"],
  "reports.default_comparison": ["none", "prior_period", "prior_year"],
  "products.valuation_method": ["fifo", "average", "standard"],
  "automation.ai_mode": ["off", "read_only", "suggest", "draft", "execute_with_approval"],
};

function displayLabel(value: string): string {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function SettingsCategoryConfigPanel({
  companyId,
  category,
  canEdit,
  showModuleLinks = true,
}: Props) {
  const meta = categoryMeta.find((item) => item.id === category);
  const scope = companyId + ":" + category;
  const qc = useQueryClient();
  const fetch = useServerFn(getOrganisationConfig);
  const save = useServerFn(upsertOrganisationConfig);
  const queryKey = ["organisation-config", companyId, category] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => fetch({ data: { companyId, category } }),
    enabled: Boolean(CATEGORY_SCHEMAS[category]),
  });

  const [state, setState] = useState<DraftState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const active = state?.scope === scope ? state : null;
  const dirty = Boolean(
    active && !areSettingsDocumentsEqual(active.baseline, active.draft),
  );
  const serverChanged = Boolean(active && dirty && q.data && q.data.version !== active.version);
  const defaults = useMemo(() => defaultDocumentFor(category), [category]);

  useEffect(() => {
    const data = q.data;
    if (!data || data.category !== category) return;
    setState((previous) => {
      const current = previous?.scope === scope ? previous : null;
      if (current && !areSettingsDocumentsEqual(current.baseline, current.draft)) {
        // Background refetches must never overwrite the user's unsaved edits.
        return previous;
      }
      if (
        current &&
        current.version === data.version &&
        areSettingsDocumentsEqual(current.baseline, data.document)
      ) {
        return previous;
      }
      return {
        scope,
        baseline: { ...data.document },
        draft: { ...data.document },
        version: data.version,
      };
    });
  }, [q.data, category, scope]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const mut = useMutation({
    mutationFn: (input: { document: SettingsDocument; expectedVersion: number }) =>
      save({
        data: {
          companyId,
          category,
          document: input.document,
          expectedVersion: input.expectedVersion,
          reason: (meta?.label ?? category) + " updated",
        },
      }),
    onSuccess: async (result) => {
      setState({
        scope,
        baseline: { ...result.document },
        draft: { ...result.document },
        version: result.version,
      });
      setFieldErrors({});
      qc.setQueryData(queryKey, {
        category,
        document: result.document,
        version: result.version,
        updated_at: new Date().toISOString(),
      });
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["organisation-features", companyId] });
      toast.success("Settings saved");
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error));
      void q.refetch();
    },
  });

  const resetDraft = () => {
    if (!q.data) return;
    setState({
      scope,
      baseline: { ...q.data.document },
      draft: { ...q.data.document },
      version: q.data.version,
    });
    setFieldErrors({});
  };

  const updateField = (key: string, value: SettingsDocument[string]) => {
    setState((current) =>
      current?.scope === scope
        ? { ...current, draft: { ...current.draft, [key]: value } }
        : current,
    );
    setFieldErrors((previous) => {
      if (!previous[key] && !previous["_form"]) return previous;
      const next = { ...previous };
      delete next[key];
      delete next["_form"];
      return next;
    });
  };

  const saveDraft = () => {
    if (!active || !dirty || serverChanged || !canEdit || mut.isPending) return;
    const validated = validateSettingsDraft(category, active.draft);
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      toast.error("Review the highlighted settings before saving.");
      return;
    }
    setFieldErrors({});
    mut.mutate({ document: validated.document, expectedVersion: active.version });
  };

  if (!meta) return null;

  const hasEditor = Boolean(CATEGORY_SCHEMAS[category]);
  const draft = active?.draft ?? {};
  const disabled = !canEdit || mut.isPending || !active;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>{meta.label}</AlertTitle>
        <AlertDescription>{meta.description}</AlertDescription>
      </Alert>

      {showModuleLinks && meta.moduleLinks?.length ? (
        <div className="flex flex-wrap gap-2">
          {meta.moduleLinks.map((link) => (
            <Button key={link.to} size="sm" variant="outline" asChild>
              <SettingsDestinationLink destination={{ to: link.to }}>
                {link.label}
              </SettingsDestinationLink>
            </Button>
          ))}
        </div>
      ) : null}

      {!hasEditor ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage in the connected module</CardTitle>
            <CardDescription>
              There are no editable organisation-level fields for this category in Settings
              Centre. Use the related module above for supported configuration.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>
              Changes are saved to your organisation with version checks to prevent overwriting
              another user's updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid max-w-xl gap-4">
            {q.isPending ? (
              <div className="space-y-3" aria-label="Loading settings">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : q.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Settings could not be loaded</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{friendlyAuthError(q.error)}</p>
                  <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {serverChanged ? (
                  <Alert variant="destructive">
                    <AlertTitle>Settings changed on the server</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>
                        Another update was saved while you were editing. Your draft is preserved.
                        Reload the latest values before making further changes.
                      </p>
                      <Button size="sm" variant="outline" onClick={resetDraft}>
                        Reload latest values
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {Object.entries(draft).map(([key, value]) => {
                  const id = "settings-" + category + "-" + key;
                  const options = ENUM_OPTIONS[category + "." + key];
                  const error = fieldErrors[key];
                  const isNumeric =
                    typeof defaults[key] === "number" ||
                    isNullableNumericSetting(category, key);

                  if (typeof value === "boolean") {
                    return (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <Label htmlFor={id}>{displayLabel(key)}</Label>
                        <Switch
                          id={id}
                          checked={value}
                          disabled={disabled}
                          onCheckedChange={(checked) => updateField(key, checked)}
                        />
                      </div>
                    );
                  }
                  if (options && typeof value === "string") {
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={id}>{displayLabel(key)}</Label>
                        <Select
                          value={value}
                          disabled={disabled}
                          onValueChange={(selected) => updateField(key, selected)}
                        >
                          <SelectTrigger id={id} aria-invalid={Boolean(error)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((option) => (
                              <SelectItem key={option} value={option}>
                                {displayLabel(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {error ? <p className="text-xs text-destructive">{error}</p> : null}
                      </div>
                    );
                  }
                  if (Array.isArray(value)) {
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={id}>{displayLabel(key)}</Label>
                        <Input
                          id={id}
                          value={value.join(", ")}
                          disabled={disabled}
                          aria-invalid={Boolean(error)}
                          onChange={(event) => {
                            const numbers = Array.isArray(defaults[key]) &&
                              (defaults[key] as Array<string | number>).some(
                                (item) => typeof item === "number",
                              );
                            const parts = event.target.value
                              .split(",")
                              .map((part) => part.trim())
                              .filter(Boolean)
                              .map((part) => (numbers && part !== "" && Number.isFinite(Number(part))
                                ? Number(part)
                                : part));
                            updateField(key, parts);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Enter comma-separated values.
                        </p>
                        {error ? <p className="text-xs text-destructive">{error}</p> : null}
                      </div>
                    );
                  }
                  if (typeof value === "number" || typeof value === "string" ||
                      (value === null && isNumeric)) {
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={id}>{displayLabel(key)}</Label>
                        <Input
                          id={id}
                          value={value === null ? "" : String(value)}
                          disabled={disabled}
                          inputMode={isNumeric ? "decimal" : undefined}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? id + "-error" : undefined}
                          onChange={(event) =>
                            updateField(
                              key,
                              value === null && event.target.value === ""
                                ? null
                                : event.target.value,
                            )
                          }
                        />
                        {error ? (
                          <p id={id + "-error"} className="text-xs text-destructive">
                            {error}
                          </p>
                        ) : null}
                      </div>
                    );
                  }
                  return null;
                })}

                {fieldErrors["_form"] ? (
                  <p className="text-sm text-destructive">{fieldErrors["_form"]}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <Button disabled={disabled || !dirty || serverChanged} onClick={saveDraft}>
                    {mut.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={mut.isPending || !dirty}
                    onClick={resetDraft}
                  >
                    Discard changes
                  </Button>
                  <span aria-live="polite" className="text-xs text-muted-foreground">
                    {!canEdit
                      ? "Read-only: you cannot change these settings."
                      : dirty
                        ? "Unsaved changes"
                        : "All changes saved"}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
