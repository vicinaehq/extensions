import { describe, it, expect } from "vitest";
import { Mutex } from "../../src/utils/mutex";

describe("Mutex", () => {
  it("serializes async work in submission order", async () => {
    const m = new Mutex();
    const out: number[] = [];
    const tasks = [10, 5, 1].map((delay, i) =>
      m.run(async () => {
        await new Promise((r) => setTimeout(r, delay));
        out.push(i);
      }),
    );
    await Promise.all(tasks);
    expect(out).toEqual([0, 1, 2]);
  });

  it("propagates errors without breaking the queue", async () => {
    const m = new Mutex();
    await expect(m.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const v = await m.run(async () => 42);
    expect(v).toBe(42);
  });
});
