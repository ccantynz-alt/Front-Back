import { describe, expect, test } from "bun:test";
import { InMemoryStateStore } from "../src/state/store";
import type { PreviewState } from "../src/types";

const sample: PreviewState = {
  prId: "o/r#1",
  owner: "o",
  repo: "r",
  number: 1,
  hostname: "x.preview.crontech.dev",
  lastSha: "abcdef1234",
  status: "live",
  createdAt: 1,
  updatedAt: 2,
};

describe("InMemoryStateStore", () => {
  test("set then get returns a snapshot", () => {
    const store = new InMemoryStateStore();
    store.set(sample);
    const got = store.get(sample.prId);
    expect(got?.prId).toBe(sample.prId);
    // Mutating the returned record should not affect the store.
    if (got) got.status = "failed";
    expect(store.get(sample.prId)?.status).toBe("live");
  });

  test("delete removes the entry", () => {
    const store = new InMemoryStateStore();
    store.set(sample);
    store.delete(sample.prId);
    expect(store.get(sample.prId)).toBeUndefined();
  });

  test("list returns snapshots", () => {
    const store = new InMemoryStateStore();
    store.set(sample);
    store.set({ ...sample, prId: "o/r#2", number: 2 });
    expect(store.list()).toHaveLength(2);
  });
});
