import { describe, expect, it } from "vitest";
import { MAX_FILES_PER_BATCH, runFileBatch } from "./file-batch";

describe("Files batch operations", () => {
  it("completes sequentially, retains failed ids, and records the first failure", async () => {
    const order: string[] = [];
    const result = await runFileBatch(["a", "b", "c"], async (id) => {
      order.push(id);
      if (id !== "b") return { cleanup: "complete" };
      throw new Error("Not permitted");
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.completedIds).toEqual(["a", "c"]);
    expect(result.failedIds).toEqual(["b"]);
    expect(result.warningIds).toEqual([]);
    expect(result.firstError).toBeInstanceOf(Error);
    expect((result.firstError as Error).message).toBe("Not permitted");
  });

  it("distinguishes completed deletions with Storage cleanup warnings", async () => {
    const result = await runFileBatch(
      ["a", "b", "c"],
      async (id) => ({ cleanup: id === "b" ? "requires_admin" : "complete" }),
      (r) => r.cleanup === "requires_admin",
    );
    expect(result.completedIds).toEqual(["a", "b", "c"]);
    expect(result.failedIds).toEqual([]);
    expect(result.warningIds).toEqual(["b"]);
    expect(result.firstError).toBeNull();
  });

  it("rejects duplicate, empty and oversized batches before calling the server", async () => {
    let called = 0;
    const operation = async () => {
      called += 1;
      return true;
    };
    await expect(runFileBatch([], operation)).rejects.toThrow("1–25 distinct");
    await expect(runFileBatch(["a", "a"], operation)).rejects.toThrow("1–25 distinct");
    await expect(
      runFileBatch(Array.from({ length: MAX_FILES_PER_BATCH + 1 }, (_, i) => String(i)), operation),
    ).rejects.toThrow("1–25 distinct");
    expect(called).toBe(0);
  });

  it("attempts every item after a failure and never duplicates an operation", async () => {
    const called: string[] = [];
    const result = await runFileBatch(["a", "b", "c", "d"], async (id) => {
      called.push(id);
      if (id === "a" || id === "d") throw new Error(id);
      return id;
    });
    expect(called).toEqual(["a", "b", "c", "d"]);
    expect(result.failedIds).toEqual(["a", "d"]);
    expect(result.completedIds).toEqual(["b", "c"]);
  });
});
