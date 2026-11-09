import { Link } from "@tanstack/react-router";
import { useCan } from "@/hooks/use-can";
import { CRM_SECTIONS, type CrmSectionKey } from "@/lib/crm/sections";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const GROUP_LABELS: Record<string, string> = {
  workspace: "Workspace",
  pipeline: "Pipeline",
  relationships: "Relationships",
  engagement: "Engagement",
  revenue: "Revenue",
  insights: "Insights",
  admin: "Admin",
};

export function CrmSubnav({ current }: { current: CrmSectionKey }) {
  const { can } = useCan();
  const visible = CRM_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );

  const groups = visible.reduce<Record<string, typeof visible>>((acc, section) => {
    const group = section.group;
    if (!acc[group]) acc[group] = [] as unknown as typeof visible;
    (acc[group] as Array<(typeof CRM_SECTIONS)[number]>).push(section);
    return acc;
  }, {});

  return (
    <nav
      aria-label="CRM sections"
      className="mb-6 space-y-3 border-b border-border pb-3 print:hidden"
    >
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="min-w-0">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {GROUP_LABELS[group] ?? group}
          </p>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain">
            {items.map((item) => {
              const active = current === item.key;
              const className = cn(
                "inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 motion-reduce:transition-none",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              );
              if (item.key === "overview") {
                return (
                  <Link
                    key={item.key}
                    to="/crm"
                    className={className}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <Link
                  key={item.key}
                  to="/crm/$section"
                  params={{ section: item.key }}
                  className={className}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
