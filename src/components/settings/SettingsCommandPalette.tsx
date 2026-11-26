import { useEffect, useState, useRef, type MouseEvent } from "react";
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
import { SETTING_FIELD_COVERAGE } from "@/lib/settings/capability-registry";
import { settingsRouteForSection } from "@/lib/settings/route-model";
import { navItems } from "@/lib/nav";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSection: (section: string) => void;
  showDemo?: boolean;
};

export function SettingsCommandPalette({
  open,
  onOpenChange,
  onSelectSection,
  showDemo = false,
}: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const keyboardActivation = useRef(false);
  // cmdk invokes onSelect for pointer clicks too. Native links own pointer navigation;
  // keyboard activation retains the caller's embedded settings behavior.
  const selectFromKeyboard = (action: () => void) => {
    if (!keyboardActivation.current) return;
    keyboardActivation.current = false;
    action();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const matches = searchSettings(query).filter((category) => category.id !== "demo" || showDemo);
  const fieldQuery = query.trim().toLowerCase();
  const fieldMatches = fieldQuery
    ? SETTING_FIELD_COVERAGE.filter(
        (field) =>
          field.label.toLowerCase().includes(fieldQuery) ||
          field.key.toLowerCase().includes(fieldQuery) ||
          field.consumer.toLowerCase().includes(fieldQuery),
      ).slice(0, 8)
    : [];
  const modules = navItems.filter(
    (item) =>
      item.to !== "/settings" &&
      (!query || item.label.toLowerCase().includes(query.trim().toLowerCase())),
  );

  const onLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Native links keep Ctrl/Cmd-click, keyboard navigation and new-tab behavior.
    // Stop propagation so one pointer click does not also run CommandItem.onSelect.
    keyboardActivation.current = false;
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
    <CommandDialog title="Search settings and modules" open={open} onOpenChange={onOpenChange}>
      <CommandInput
        aria-label="Search settings or modules"
        placeholder="Search settings or jump to a module…"
        onKeyDown={(event) => {
          keyboardActivation.current = event.key === "Enter" && !event.nativeEvent.isComposing;
        }}
        onKeyUp={() => {
          keyboardActivation.current = false;
        }}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matching settings or modules.</CommandEmpty>
        {matches.length > 0 ? (
          <CommandGroup heading="Settings">
            {matches.map((category) => (
              <CommandItem
                asChild
                key={category.id}
                value={[category.label, category.description, ...category.synonyms].join(" ")}
                onSelect={() => {
                  selectFromKeyboard(() => onSelectSection(category.id));
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
        {fieldMatches.length > 0 ? (
          <CommandGroup heading="Setting fields">
            {fieldMatches.map((field) => (
              <CommandItem
                asChild
                key={field.key}
                value={`${field.label} ${field.key} ${field.consumer}`}
                onSelect={() => {
                  selectFromKeyboard(() => onSelectSection(field.category));
                }}
              >
                <Link
                  to="/settings/$group/$page"
                  params={settingsRouteForSection(field.category)}
                  search={{ section: field.category }}
                  onClick={onLinkClick}
                  className="flex w-full items-start justify-between gap-3 py-2"
                >
                  <span>
                    <span className="block font-medium">{field.label}</span>
                    <span className="text-xs text-muted-foreground">{field.category}</span>
                  </span>
                  {field.status === "partial" ? (
                    <span className="text-xs text-muted-foreground">Partial</span>
                  ) : null}
                </Link>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {modules.length > 0 ? (
          <CommandGroup heading="Modules">
            {modules.map((item) => (
              <CommandItem
                asChild
                key={item.to}
                value={item.label}
                onSelect={() => {
                  selectFromKeyboard(() => {
                    void navigate({ to: item.to });
                  });
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
