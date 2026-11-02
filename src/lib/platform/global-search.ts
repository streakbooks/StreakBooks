import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export type SearchHit = { kind: "business" | "user"; id: string; label: string };

export function globalSearch(input: {
  role: PlatformRoleName;
  query: string;
  businesses: readonly { id: string; name: string }[];
  users: readonly { id: string; label: string }[];
}): {
  status: "short" | "ready";
  results: SearchHit[];
  audit: { action: "search"; reason: string } | null;
} {
  const businesses = platformRoleAllows(input.role, "businesses.view");
  const users = platformRoleAllows(input.role, "users.view");
  if (!businesses && !users) throw new Error("Platform permission required");
  const query = input.query.trim().toLowerCase();
  if (query.length < 2) return { status: "short", results: [], audit: null };
  const results: SearchHit[] = [];
  if (businesses) {
    for (const business of input.businesses) {
      if (business.name.toLowerCase().includes(query)) {
        results.push({ kind: "business", id: business.id, label: business.name });
      }
    }
  }
  if (users) {
    for (const user of input.users) {
      if (user.label.toLowerCase().includes(query)) {
        results.push({ kind: "user", id: user.id, label: user.label });
      }
    }
  }
  return {
    status: "ready",
    results: results.slice(0, 20),
    audit: { action: "search", reason: "Platform search" },
  };
}
