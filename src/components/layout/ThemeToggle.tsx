import { useState } from "react";
import { Check, Monitor, Moon, Palette, RotateCcw, SlidersHorizontal, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PALETTE_OPTIONS,
  computeCustomTokens,
  isThemePreference,
  type CustomPalette,
} from "@/lib/theme";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The original Light/Dark/System mode stays available. A separate colour
 * collection changes the presentation only; ledger and status colours stay semantic.
 */
export function ThemeToggle() {
  const {
    preference,
    resolved,
    palette,
    customColors,
    setPreference,
    setPalette,
    setCustomColors,
    resetCustomColors,
  } = useTheme();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const preview = computeCustomTokens(customColors, resolved === "dark");

  function updateColor(field: keyof CustomPalette, value: string) {
    setCustomColors({ ...customColors, [field]: value });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Appearance and colour themes"
            title="Appearance"
          >
            {resolved === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="max-h-[min(78vh,680px)] w-[min(390px,calc(100vw-24px))] overflow-y-auto rounded-xl p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Palette className="size-4" />
            </div>
            <div>
              <DropdownMenuLabel className="p-0 text-sm font-semibold">
                Your appearance
              </DropdownMenuLabel>
              <p className="text-xs text-muted-foreground">Make LinkBooks feel like yours</p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Display mode
          </p>
          <DropdownMenuRadioGroup
            value={preference}
            onValueChange={(v) => {
              if (isThemePreference(v)) setPreference(v);
            }}
          >
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/70 p-1">
              {(
                [
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                  { id: "system", label: "System", icon: Monitor },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <DropdownMenuRadioItem
                  key={id}
                  value={id}
                  className="flex justify-center rounded-md px-1.5 py-2 text-xs font-medium data-[state=checked]:bg-background data-[state=checked]:shadow-sm [&>span:first-child]:hidden"
                >
                  <Icon className="mr-1.5 size-3.5" /> {label}
                </DropdownMenuRadioItem>
              ))}
            </div>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator className="my-3" />
          <div className="mb-2 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Colour collections
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Eight coordinated palettes for either display mode.
            </p>
          </div>
          <div
            className="grid grid-cols-2 gap-2 p-0.5"
            role="group"
            aria-label="Choose a colour palette"
          >
            {PALETTE_OPTIONS.map((item) => (
              <DropdownMenuItem
                key={item.id}
                aria-current={palette === item.id ? "true" : undefined}
                aria-label={item.name + ": " + item.description}
                onSelect={(e) => {
                  e.preventDefault();
                  setPalette(item.id);
                }}
                className={cn(
                  "group relative rounded-lg border bg-card p-2 text-left outline-none transition-all hover:border-primary/60 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
                  palette === item.id ? "border-primary ring-2 ring-primary/30" : "border-border",
                )}
              >
                <div
                  className="mb-2 flex h-11 overflow-hidden rounded-md border border-black/5"
                  aria-hidden="true"
                >
                  <div className="w-[31%] p-1.5" style={{ backgroundColor: item.sidebar }}>
                    <div className="h-1 w-full rounded-full bg-white/50" />
                    <div
                      className="mt-1.5 h-2 w-full rounded-sm"
                      style={{ backgroundColor: item.primary }}
                    />
                    <div className="mt-1 h-1 w-3/4 rounded-full bg-white/30" />
                  </div>
                  <div className="flex-1 p-1.5" style={{ backgroundColor: item.surface }}>
                    <div className="h-1.5 w-3/4 rounded-sm bg-black/10" />
                    <div className="mt-1.5 h-4 rounded-sm bg-white/80 shadow-sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {item.name}
                  </span>
                  {palette === item.id ? (
                    <Check aria-hidden className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.description}
                </div>
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator className="my-3" />
          <DropdownMenuItem
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
              palette === "custom" ? "border-primary bg-primary/5" : "border-border",
            )}
            onSelect={() => setCustomizeOpen(true)}
          >
            <SlidersHorizontal className="size-4 shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block font-semibold">Create your own palette</span>
              <span className="block text-xs text-muted-foreground">
                Primary, accent, sidebar and canvas colours
              </span>
            </span>
            {palette === "custom" ? <Check className="size-4 text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
          <p className="mt-2 px-1 text-[11px] text-muted-foreground">
            Appearance is saved in this browser. Financial status colours remain consistent.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="size-5 text-primary" /> Personalise LinkBooks
            </DialogTitle>
            <DialogDescription>
              Choose an original primary, accent and workspace palette. Text contrast adapts;
              financial status colours keep their meaning in every theme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="overflow-hidden rounded-xl border shadow-sm"
              aria-label="Live palette preview"
            >
              <div
                className="flex h-28"
                style={{ backgroundColor: preview["--background"], color: preview["--foreground"] }}
              >
                <div
                  className="w-1/3 p-3"
                  style={{
                    backgroundColor: customColors.sidebar,
                    color: preview["--sidebar-foreground"],
                  }}
                >
                  <div className="text-xs font-semibold">LinkBooks</div>
                  <div
                    className="mt-4 rounded px-2 py-1 text-xs"
                    style={{
                      backgroundColor: preview["--sidebar-active"],
                      color: preview["--sidebar-active-foreground"],
                    }}
                  >
                    Contacts
                  </div>
                </div>
                <div className="flex-1 p-3">
                  <div className="text-xs font-semibold">Your workspace</div>
                  <div
                    className="mt-2 rounded-lg border p-2 text-xs"
                    style={{
                      backgroundColor: preview["--card"],
                      color: preview["--card-foreground"],
                      borderColor: preview["--border"],
                    }}
                  >
                    Live colour preview
                    <div className="mt-2 flex items-center gap-2" aria-hidden="true">
                      <span
                        className="h-2 w-1/2 rounded-full"
                        style={{ backgroundColor: customColors.primary }}
                      />
                      <span
                        className="h-2 w-1/3 rounded-full"
                        style={{ backgroundColor: customColors.accent }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { key: "primary", label: "Primary colour", hint: "Actions and active navigation" },
                  { key: "accent", label: "Accent colour", hint: "Hover surfaces and chart series" },
                  { key: "sidebar", label: "Sidebar colour", hint: "Navigation background" },
                  {
                    key: "lightBackground",
                    label: "Light canvas",
                    hint: "Background in Light mode",
                  },
                  { key: "darkBackground", label: "Dark canvas", hint: "Background in Dark mode" },
                ] as const
              ).map(({ key, label, hint }) => (
                <label
                  key={key}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <input
                    type="color"
                    value={customColors[key]}
                    aria-label={label}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="size-10 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                    <span className="block text-[11px] font-mono text-muted-foreground">
                      {customColors[key].toUpperCase()}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Changes apply immediately and are kept on this device. Select Light, Dark or System
              independently in the Appearance menu.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" size="sm" onClick={resetCustomColors}>
              <RotateCcw className="mr-1.5 size-3.5" /> Reset colours
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPalette("custom");
                setCustomizeOpen(false);
              }}
            >
              <Check className="mr-1.5 size-4" /> Use my palette
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
