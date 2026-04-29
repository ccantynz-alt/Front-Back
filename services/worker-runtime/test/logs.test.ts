import { describe, expect, test } from "bun:test";
import { LogRingBuffer, MAX_LINES_PER_STREAM } from "../src/logs";

describe("LogRingBuffer", () => {
  test("appends lines with monotonic sequences", () => {
    const buf = new LogRingBuffer();
    const a = buf.append("stdout", "hello");
    const b = buf.append("stderr", "world");
    expect(a.sequence).toBe(1);
    expect(b.sequence).toBe(2);
    expect(buf.snapshot().map((l) => l.text)).toEqual(["hello", "world"]);
  });

  test("snapshot filters by `since`", () => {
    const buf = new LogRingBuffer();
    buf.append("stdout", "a");
    const b = buf.append("stdout", "b");
    buf.append("stderr", "c");
    const after = buf.snapshot(b.sequence);
    expect(after.map((l) => l.text)).toEqual(["c"]);
  });

  test("evicts oldest stdout lines once cap is hit", () => {
    const buf = new LogRingBuffer();
    for (let i = 0; i < MAX_LINES_PER_STREAM + 50; i++) {
      buf.append("stdout", `line-${i}`);
    }
    const sizes = buf.size();
    expect(sizes.stdout).toBe(MAX_LINES_PER_STREAM);
    const snap = buf.snapshot();
    expect(snap[0]?.text).toBe("line-50");
    expect(snap[snap.length - 1]?.text).toBe(
      `line-${MAX_LINES_PER_STREAM + 49}`,
    );
  });

  test("eviction is per-stream — stderr is independent of stdout", () => {
    const buf = new LogRingBuffer();
    for (let i = 0; i < MAX_LINES_PER_STREAM; i++) buf.append("stdout", `o-${i}`);
    buf.append("stderr", "e-0");
    buf.append("stdout", "o-overflow");
    const sizes = buf.size();
    expect(sizes.stdout).toBe(MAX_LINES_PER_STREAM);
    expect(sizes.stderr).toBe(1);
  });

  test("subscribers receive new lines and unsub stops delivery", () => {
    const buf = new LogRingBuffer();
    const got: string[] = [];
    const unsub = buf.subscribe((l) => got.push(l.text));
    buf.append("stdout", "x");
    buf.append("stderr", "y");
    unsub();
    buf.append("stdout", "z");
    expect(got).toEqual(["x", "y"]);
  });

  test("a throwing subscriber is removed", () => {
    const buf = new LogRingBuffer();
    let goodCount = 0;
    buf.subscribe(() => {
      throw new Error("flaky");
    });
    buf.subscribe(() => {
      goodCount++;
    });
    buf.append("stdout", "1");
    buf.append("stdout", "2");
    expect(goodCount).toBe(2);
  });

  test("clear empties both streams", () => {
    const buf = new LogRingBuffer();
    buf.append("stdout", "x");
    buf.append("stderr", "y");
    buf.clear();
    expect(buf.size()).toEqual({ stdout: 0, stderr: 0 });
  });
});
