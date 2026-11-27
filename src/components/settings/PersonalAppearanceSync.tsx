import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePersonalAppearanceSync } from "@/hooks/use-personal-appearance-sync";
import { getPersonalAppearancePreferences } from "@/lib/settings/personal-appearance.functions";

export function PersonalAppearanceSync() {
  const fetchPreferences = useServerFn(getPersonalAppearancePreferences);
  const preferencesQuery = useQuery({
    queryKey: ["personal-appearance"],
    queryFn: () => fetchPreferences({ data: {} }),
  });
  usePersonalAppearanceSync(preferencesQuery);
  return null;
}
