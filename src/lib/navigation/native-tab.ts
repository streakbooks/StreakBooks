/** Visual treatment for semantic, URL-addressable subsection tabs.
 * Use a real router <Link>, not Radix TabsTrigger asChild: Radix's mouse handlers
 * can prevent modified/middle clicks from reaching native browser behavior.
 */
export const nativeTabLinkClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow";
