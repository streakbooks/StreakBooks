import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enqueueJob, jobConsole } from "./job-console";

describe("job console", () => {
  it("keeps a missing list unrecorded and does not run the job", () => {
    expect(jobConsole({ role: "platform_owner", jobs: null })).toEqual({
      status: "unrecorded",
      jobs: [],
    });
    expect(
      enqueueJob({ role: "platform_owner", name: "Nightly check", reason: "Schedule" }),
    ).toMatchObject({
      status: "queued",
      executed: false,
    });
  });

  it("refuses support and has not been applied", () => {
    expect(() => jobConsole({ role: "platform_support", jobs: null })).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102280000_job_console.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("'executed', false");
    expect(() =>
      enqueueJob({
        role: "platform_owner",
        name: "Nightly check",
        reason: "Schedule",
        queued: true,
      }),
    ).toThrow(/already queued/);
    const once = readFileSync(
      new URL("../../../supabase/migrations/20261102530000_job_one_queued.sql", import.meta.url),
      "utf8",
    );
    expect(once).toContain("platform_jobs_one_queued");
    expect(once).toContain("That job is already queued");
    expect(once).toContain("'executed', false");
    expect(once).toContain("require_platform('settings.manage')");
  });
});
