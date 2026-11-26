import { categoryMeta, type SettingsCategory } from "@/lib/settings/registry";
import { SETTINGS_NAV_GROUPS } from "@/lib/settings/nav-groups";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  section: SettingsCategory;
  showDemo: boolean;
  onSection: (id: SettingsCategory) => void;
};

export function SettingsMobileNav({ section, showDemo, onSection }: Props) {
  const metaById = new Map(categoryMeta.map((item) => [item.id, item]));

  return (
    <div className="mb-4 lg:hidden">
      <Label htmlFor="mobile-settings-section" className="mb-2 block text-sm font-medium">
        Settings section
      </Label>
      <Select value={section} onValueChange={(value) => onSection(value as SettingsCategory)}>
        <SelectTrigger id="mobile-settings-section" aria-label="Choose settings section">
          <SelectValue placeholder="Choose a settings section" />
        </SelectTrigger>
        <SelectContent className="max-h-[min(70vh,28rem)]">
          {SETTINGS_NAV_GROUPS.map((group) => {
            const items = group.ids
              .map((id) => metaById.get(id))
              .filter((item): item is (typeof categoryMeta)[number] => Boolean(item))
              .filter((item) => item.id !== "demo" || showDemo);
            if (items.length === 0) return null;
            return (
              <SelectGroup key={group.label}>
                <SelectLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
