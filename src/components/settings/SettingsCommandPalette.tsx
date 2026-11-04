import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchSettings } from "@/lib/settings/registry";
import { navItems } from "@/lib/nav";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSection: (section: string) => void;
};

export function SettingsCommandPalette({ open, onOpenChange, onSelectSection }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const matches = searchSettings(query);
  const modules = navItems.filter(
    (item) =>
      item.to !== "/settings" &&
      (!query || item.label.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search settings or jump to a module…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matching settings or modules.</CommandEmpty>
        {matches.length > 0 ? (
          <CommandGroup heading="Settings">
            {matches.map((category) => (
              <CommandItem
                key={category.id}
                value={[category.label, category.description, ...category.synonyms].join(" ")}
                onSelect={() => {
                  onSelectSection(category.id);
                  onOpenChange(false);
                }}
                className="flex flex-col items-start gap-1 py-2"
              >
                <span className="font-medium">{category.label}</span>
                <span className="text-xs text-muted-foreground">{category.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {modules.length > 0 ? (
          <CommandGroup heading="Modules">
            {modules.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  void navigate({ to: item.to });
                  onOpenChange(false);
                }}
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
