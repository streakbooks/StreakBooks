import { MODULE_REGISTRY } from "@/lib/modules/registry";

/** Accept only same-origin paths owned by a registered StreakBooks module. */
export function validateSettingsReturnTo(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return undefined;
  }
  const encodedPath = value.split(/[?#]/, 1)[0] ?? "";
  let path: string;
  try {
    path = decodeURIComponent(encodedPath);
  } catch {
    return undefined;
  }
  if (path === "/settings" || path.startsWith("/settings/")) return undefined;
  if (path.split("/").some((part) => part === "." || part === "..")) return undefined;
  const owned = MODULE_REGISTRY.some(
    (module) => module.inSidebar && (path === module.path || path.startsWith(module.path + "/")),
  );
  return owned ? value : undefined;
}

export function currentSettingsReturnTo(pathname: string): string | undefined {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return undefined;
  if (typeof window === "undefined") return validateSettingsReturnTo(pathname);
  return validateSettingsReturnTo(`${window.location.pathname}${window.location.search}`);
}
