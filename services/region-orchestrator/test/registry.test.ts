import { describe, expect, test } from "bun:test";
import { RegionRegistry } from "../src/registry";

describe("RegionRegistry", () => {
  test("starts empty", () => {
    const r = new RegionRegistry();
    expect(r.size()).toBe(0);
    expect(r.list()).toEqual([]);
  });

  test("upserts a valid region", () => {
    const r = new RegionRegistry();
    const region = r.upsert({
      id: "r1",
      code: "us-east",
      location: "Virginia",
      capacity: 100,
      currentLoad: 0,
      costPerHour: 0.05,
    });
    expect(region.id).toBe("r1");
    expect(r.size()).toBe(1);
    expect(r.get("r1")).toMatchObject({ code: "us-east" });
  });

  test("rejects invalid input", () => {
    const r = new RegionRegistry();
    expect(() =>
      r.upsert({ id: "", code: "x", location: "y", capacity: 1, currentLoad: 0, costPerHour: 0 }),
    ).toThrow();
  });

  test("rejects bad code format", () => {
    const r = new RegionRegistry();
    expect(() =>
      r.upsert({
        id: "r",
        code: "BAD CODE",
        location: "y",
        capacity: 1,
        currentLoad: 0,
        costPerHour: 0,
      }),
    ).toThrow();
  });

  test("delete returns true on hit, false on miss", () => {
    const r = new RegionRegistry();
    r.upsert({
      id: "r1",
      code: "us",
      location: "x",
      capacity: 1,
      currentLoad: 0,
      costPerHour: 0,
    });
    expect(r.delete("r1")).toBe(true);
    expect(r.delete("r1")).toBe(false);
  });

  test("list is stable-sorted by id", () => {
    const r = new RegionRegistry();
    r.upsert({
      id: "z",
      code: "zz",
      location: "z",
      capacity: 1,
      currentLoad: 0,
      costPerHour: 0,
    });
    r.upsert({
      id: "a",
      code: "aa",
      location: "a",
      capacity: 1,
      currentLoad: 0,
      costPerHour: 0,
    });
    expect(r.list().map((x) => x.id)).toEqual(["a", "z"]);
  });
});
