import { describe, expect, it, vi } from "vitest";
import { runNotificationBulk } from "./bulk-actions";

describe("Action Center bulk operation reliability", () => {
  it("executes unique selections once and reports progress", async () => {
    const update = vi.fn(async (_id: string) => undefined);
    const progress: number[] = [];
    const result = await runNotificationBulk(
      ["first", "first", "second"],
      update,
      () => true,
      (done) => progress.push(done),
    );
    expect(update.mock.calls.map(([id]) => id)).toEqual(["first", "second"]);
    expect(progress).toEqual([1, 2]);
    expect(result).toEqual({
      attempted: 2,
      updated: 2,
      failedIds: [],
      firstError: null,
      cancelled: false,
    });
  });

  it("continues after a failed update while retaining only failed IDs for retry", async () => {
    const result = await runNotificationBulk(
      ["a", "b", "c"],
      async (id) => {
        if (id === "b") throw new Error("Access revoked");
      },
      () => true,
      () => undefined,
    );
    expect(result).toEqual({
      attempted: 3,
      updated: 2,
      failedIds: ["b"],
      firstError: "Access revoked",
      cancelled: false,
    });
  });

  it("stops before sending a second RPC when scope changes during a request", async () => {
    let active = true;
    const sent: string[] = [];
    const progress = vi.fn();
    const result = await runNotificationBulk(
      ["a", "b", "c"],
      async (id) => {
        sent.push(id);
        active = false;
      },
      () => active,
      progress,
    );
    expect(result.cancelled).toBe(true);
    expect(result.attempted).toBe(1);
    expect(sent).toEqual(["a"]);
    expect(progress).not.toHaveBeenCalled();
  });

  it("does not send any RPC when the operation is already invalidated", async () => {
    const update = vi.fn(async () => undefined);
    const result = await runNotificationBulk(
      ["a"],
      update,
      () => false,
      () => undefined,
    );
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 0, updated: 0, cancelled: true });
  });

  it("handles empty selections without invoking an update", async () => {
    const update = vi.fn(async () => undefined);
    const result = await runNotificationBulk(
      [],
      update,
      () => true,
      () => undefined,
    );
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 0, updated: 0, cancelled: false });
  });
});
