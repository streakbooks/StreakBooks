/** Maps an authenticated company route to the module shown in the client access log. */
export function firmAccessModuleKey(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first || first === "_authenticated") return "dashboard";
  return /^[a-z][a-z0-9_-]{0,63}$/.test(first) ? first.replaceAll("-", "_") : "workspace";
}
