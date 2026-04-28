import { describe, expect, it } from "bun:test";
import type { AnalyticsEvent } from "../src/collector/schema";
import { AnalyticsStore } from "../src/collector/store";

const make = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  sessionId: "s1",
  route: "/",
  event: "$pageview",
  ts: 1,
  ...over,
});

describe("AnalyticsStore — aggregation", () => {
  it("counts pageviews and unique sessions", () => {
    const s = new AnalyticsStore();
    s.ingest(
      "acme",
      [
        make({ sessionId: "s1", event: "$pageview", route: "/" }),
        make({ sessionId: "s1", event: "$pageview", route: "/about" }),
        make({ sessionId: "s2", event: "$pageview", route: "/" }),
      ],
      1,
    );
    const r = s.stats("acme");
    expect(r.pageviews).toBe(3);
    expect(r.uniqueSessions).toBe(2);
    expect(r.totalEvents).toBe(3);
  });

  it("computes bounce rate as single-event sessions / total sessions", () => {
    const s = new AnalyticsStore();
    s.ingest(
      "acme",
      [
        make({ sessionId: "bounce-1", event: "$pageview" }),
        make({ sessionId: "bounce-2", event: "$pageview" }),
        make({ sessionId: "engaged", event: "$pageview" }),
        make({ sessionId: "engaged", event: "click" }),
      ],
      1,
    );
    const r = s.stats("acme");
    expect(r.uniqueSessions).toBe(3);
    expect(r.bounceRate).toBeCloseTo(2 / 3, 5);
  });

  it("returns top routes / referrers / events sorted by count", () => {
    const s = new AnalyticsStore();
    s.ingest(
      "acme",
      [
        make({ route: "/a", event: "$pageview", referrer: "https://google.com" }),
        make({ route: "/a", event: "$pageview", referrer: "https://google.com" }),
        make({ route: "/a", event: "click" }),
        make({ route: "/b", event: "$pageview", referrer: "https://twitter.com" }),
      ],
      1,
    );
    const r = s.stats("acme");
    expect(r.topRoutes[0]).toEqual({ route: "/a", count: 3 });
    expect(r.topReferrers[0]).toEqual({ referrer: "https://google.com", count: 2 });
    expect(r.topEvents.find((e) => e.event === "$pageview")?.count).toBe(3);
  });

  it("buckets utm sources and campaigns", () => {
    const s = new AnalyticsStore();
    s.ingest(
      "acme",
      [
        make({ event: "$pageview", utm: { source: "twitter", campaign: "launch" } }),
        make({ event: "$pageview", utm: { source: "twitter", campaign: "launch" } }),
        make({ event: "$pageview", utm: { source: "google", campaign: "brand" } }),
      ],
      1,
    );
    const r = s.stats("acme");
    expect(r.topUtmSources[0]).toEqual({ source: "twitter", count: 2 });
    expect(r.topUtmCampaigns[0]).toEqual({ campaign: "launch", count: 2 });
  });

  it("respects topN", () => {
    const s = new AnalyticsStore();
    const events: AnalyticsEvent[] = [];
    for (let i = 0; i < 20; i++) events.push(make({ route: `/r${i}`, sessionId: `s${i}` }));
    s.ingest("acme", events, 1);
    const r = s.stats("acme", {}, 5);
    expect(r.topRoutes.length).toBe(5);
  });
});

describe("AnalyticsStore — funnel", () => {
  it("computes step-by-step conversion", () => {
    const s = new AnalyticsStore();
    s.ingest(
      "acme",
      [
        // Three sessions land. Two click signup. One converts.
        make({ sessionId: "a", event: "land", ts: 0 }),
        make({ sessionId: "b", event: "land", ts: 0 }),
        make({ sessionId: "c", event: "land", ts: 0 }),
        make({ sessionId: "a", event: "signup", ts: 1_000 }),
        make({ sessionId: "b", event: "signup", ts: 2_000 }),
        make({ sessionId: "a", event: "purchase", ts: 5_000 }),
      ],
      1,
    );
    const f = s.funnel("acme", ["land", "signup", "purchase"]);
    expect(f.steps[0]?.reached).toBe(3);
    expect(f.steps[1]?.reached).toBe(2);
    expect(f.steps[2]?.reached).toBe(1);
    expect(f.steps[1]?.conversionFromPrev).toBeCloseTo(2 / 3, 5);
    expect(f.steps[2]?.conversionFromStart).toBeCloseTo(1 / 3, 5);
  });

  it("enforces the windowMs gap between steps", () => {
    const s = new AnalyticsStore();
    s.ingest(
      "acme",
      [
        make({ sessionId: "slow", event: "land", ts: 0 }),
        // gap is 90 minutes — outside the default 30-min window.
        make({ sessionId: "slow", event: "signup", ts: 90 * 60_000 }),
      ],
      1,
    );
    const f = s.funnel("acme", ["land", "signup"]);
    expect(f.steps[0]?.reached).toBe(1);
    expect(f.steps[1]?.reached).toBe(0);
  });

  it("returns zeroed steps for an unknown tenant", () => {
    const s = new AnalyticsStore();
    const f = s.funnel("ghost", ["a", "b"]);
    expect(f.totalSessions).toBe(0);
    expect(f.steps[0]?.reached).toBe(0);
  });

  it("requires at least 2 steps", () => {
    const s = new AnalyticsStore();
    const f = s.funnel("acme", ["only"]);
    expect(f.steps.length).toBe(0);
  });
});

describe("AnalyticsStore — ring-buffer behaviour", () => {
  it("evicts the oldest event when capacity is exceeded", () => {
    const s = new AnalyticsStore({ capacity: 3 });
    s.ingest(
      "acme",
      [
        make({ event: "a", ts: 1 }),
        make({ event: "b", ts: 2 }),
        make({ event: "c", ts: 3 }),
        make({ event: "d", ts: 4 }),
      ],
      1,
    );
    const events = s.query("acme");
    expect(events.length).toBe(3);
    const names = events.map((e) => e.event).sort();
    expect(names).toContain("d");
    expect(names).not.toContain("a");
  });
});
