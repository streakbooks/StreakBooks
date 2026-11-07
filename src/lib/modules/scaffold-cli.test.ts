import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

describe("scaffold-module CLI", () => {
  it("dry-run emits shared workspace paths without writing files", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/scaffold-module.mjs",
        "--id",
        "premium-scaffold-probe",
        "--label",
        "Premium Scaffold Probe",
        "--kind",
        "list",
        "--dry-run",
      ],
      { encoding: "utf8", cwd: resolve(".") },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("src\\screens\\premium-scaffold-probe\\index.tsx");
    expect(result.stdout).toContain("Dry run complete");
  });

  it("template source requires ListWorkspace and fail-closed wording", () => {
    const source = readFileSync(resolve("scripts/scaffold-module.mjs"), "utf8");
    expect(source).toContain("ListWorkspace");
    expect(source).toContain("fail-closed");
    expect(source).toContain("NEW-MODULE-DEFINITION-OF-DONE");
    expect(source).toContain("disabled");
  });
});
