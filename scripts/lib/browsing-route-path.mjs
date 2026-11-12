/** Canonical relative file paths in the authenticated route inventory. */
export function isCanonicalRoutePath(route) {
  return typeof route === "string" &&
    route.split("/").every((segment) =>
      segment.length > 0 && segment !== "." && segment !== ".." &&
      /^[A-Za-z0-9_$.-]+$/.test(segment)
    ) &&
    /\.tsx?$/.test(route) && !route.includes("\\");
}
