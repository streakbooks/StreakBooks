import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { PALETTE_OPTIONS, isPaletteId, isThemePreference } from "@/lib/theme";
import {
  DEFAULT_PERSONAL_APPEARANCE,
  type PersonalAppearancePreferences,
} from "@/lib/settings/personal-appearance";
import {
  getPersonalAppearancePreferences,
  savePersonalAppearancePreferences,
} from "@/lib/settings/personal-appearance.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PersonalAppearanceCard({ companyId }: { companyId: string | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const fetchPreferences = useServerFn(getPersonalAppearancePreferences);
  const savePreferences = useServerFn(savePersonalAppearancePreferences);
  const queryKey = ["personal-appearance", companyId] as const;
  const preferencesQuery = useQuery({
    queryKey,
    queryFn: () => fetchPreferences({ data: { companyId: companyId! } }),
    enabled: Boolean(companyId),
  });
  const persistedPreferences = preferencesQuery.data;
  const { preference: themePreference, palette: themePalette, setPreference, setPalette } = theme;

  useEffect(() => {
    if (!preferencesQuery.isSuccess || !persistedPreferences) return;
    if (themePreference !== persistedPreferences.theme) {
      setPreference(persistedPreferences.theme);
    }
    // Custom palettes are stored only on this device, so a named server value must not replace one.
    if (themePalette !== "custom" && themePalette !== persistedPreferences.palette) {
      setPalette(persistedPreferences.palette);
    }
  }, [
    preferencesQuery.isSuccess,
    persistedPreferences,
    themePreference,
    themePalette,
    setPreference,
    setPalette,
  ]);

  const mutation = useMutation({
    mutationFn: (preferences: PersonalAppearancePreferences) => {
      if (!companyId) return Promise.resolve(preferences);
      return savePreferences({ data: { companyId, ...preferences } });
    },
    onSuccess: (preferences) => queryClient.setQueryData(queryKey, preferences),
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const savedPreferences = preferencesQuery.data ?? DEFAULT_PERSONAL_APPEARANCE;
  const syncPalette = (): PersonalAppearancePreferences["palette"] =>
    theme.palette === "custom" ? savedPreferences.palette : theme.palette;
  const savingDisabled = Boolean(companyId && preferencesQuery.isPending) || mutation.isPending;

  const updateTheme = (value: string) => {
    if (!isThemePreference(value)) return;
    theme.setPreference(value);
    if (companyId) mutation.mutate({ theme: value, palette: syncPalette() });
  };

  const updatePalette = (value: string) => {
    if (!isPaletteId(value)) return;
    theme.setPalette(value);
    if (companyId && value !== "custom") {
      mutation.mutate({ theme: theme.preference, palette: value });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>
          Colour mode and named palettes sync for this organisation. Custom colours stay on this
          device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preferencesQuery.isError && companyId ? (
          <Alert variant="destructive">
            <AlertDescription>
              StreakBooks could not load saved appearance preferences. Changes still apply in this
              browser; try reloading to sync them.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-theme">Colour mode</Label>
            <Select value={theme.preference} onValueChange={updateTheme}>
              <SelectTrigger id="profile-theme" aria-label="Colour mode" disabled={savingDisabled}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Use device setting</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-palette">Colour palette</Label>
            <Select value={theme.palette} onValueChange={updatePalette}>
              <SelectTrigger
                id="profile-palette"
                aria-label="Colour palette"
                disabled={savingDisabled}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* lookup-fixed-enum: Theme palettes are a short display preference enumeration. */}
                {PALETTE_OPTIONS.map((palette) => (
                  <SelectItem key={palette.id} value={palette.id}>
                    {palette.name}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom palette</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {!companyId ? (
          <p className="text-xs text-muted-foreground">
            Select an organisation to sync these preferences across devices.
          </p>
        ) : null}
        {mutation.isPending ? (
          <p role="status" className="text-xs text-muted-foreground">
            Saving appearance preferences…
          </p>
        ) : null}
        {theme.palette === "custom" ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => theme.resetCustomColors()}
          >
            Reset custom colours on this device
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
