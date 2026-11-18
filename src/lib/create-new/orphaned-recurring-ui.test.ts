import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = ["RecurringBillOverlay", "NewRecurringBillDialog"] as const;

function walkTsx(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walkTsx(full, out);
    } else if (/\.(tsx|ts)$/.test(name) && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

describe("orphaned recurring Sheet UI", () => {
  it("removes Sheet wrapper files after full-page recurring create/edit", () => {
    expect(
      existsSync(join(process.cwd(), "src/components/recurring/RecurringBillOverlay.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(process.cwd(), "src/components/recurring/NewRecurringBillDialog.tsx")),
    ).toBe(false);
  });

  it("does not reference RecurringBillOverlay or NewRecurringBillDialog in app source", () => {
    const offenders: string[] = [];
    for (const root of [
      join(process.cwd(), "src/routes"),
      join(process.cwd(), "src/screens"),
      join(process.cwd(), "src/components"),
      join(process.cwd(), "src/lib"),
    ]) {
      for (const file of walkTsx(root)) {
        if (file.includes("orphaned-recurring-ui.test")) continue;
        const source = readFileSync(file, "utf8");
        for (const name of FORBIDDEN) {
          if (source.includes(name)) offenders.push(`${file} → ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
