import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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

  const onLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Native links keep Ctrl/Cmd-click, keyboard navigation and new-tab behavior.
    // Stop propagation so one pointer click does not also run CommandItem.onSelect.
    event.stopPropagation();
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      onOpenChange(false);
    }
  };

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
                className="py-2"
              >
                <Link
                  to="/settings"
                  search={{ section: category.id }}
                  onClick={onLinkClick}
                  className="flex w-full flex-col items-start gap-1"
                >
                  <span className="font-medium">{category.label}</span>
                  <span className="text-xs text-muted-foreground">{category.description}</span>
                </Link>
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
                <Link to={item.to as never} onClick={onLinkClick} className="block w-full">
                  {item.label}
                </Link>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
