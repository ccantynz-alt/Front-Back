import { describe, expect, test } from "bun:test";
import { StubLlmClient } from "../src/llm-client";
import { scoreVariants } from "../src/variant-scorer";

describe("scoreVariants", () => {
  test("ranks clean variant above spammy variant", async () => {
    const { ranked } = await scoreVariants({
      variants: [
        {
          id: "spammy",
          subject: "WIN $$$ CLICK HERE NOW!!!",
          html: '<a href="x">click here now</a><a href="y">click here now</a>',
          fromDomain: "winner.zip",
        },
        {
          id: "clean",
          subject: "Your weekly project digest",
          html: '<p>Hi Alex, here is your digest. <a href="https://app.example.com/digest">Read more</a></p>',
          text: "Hi Alex, here is your digest. Read more at https://app.example.com/digest",
          fromDomain: "acme.com",
        },
      ],
    });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.id).toBe("clean");
    expect(ranked[1]?.id).toBe("spammy");
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
    expect(ranked[1]?.spamRisk).toBeGreaterThan(ranked[0]?.spamRisk ?? 0);
  });

  test("historical performance shifts ranking via Bayesian shrink", async () => {
    const baseHtml = '<p>Read <a href="x">our latest</a> deploys</p>';
    const { ranked } = await scoreVariants({
      variants: [
        {
          id: "a",
          subject: "Latest deploys for your team",
          html: baseHtml,
          fromDomain: "acme.com",
        },
        {
          id: "b",
          subject: "Latest deploys for your team",
          html: baseHtml,
          fromDomain: "acme.com",
        },
      ],
      historical: [
        { id: "a", opens: 800, clicks: 200, sent: 1000 },
        { id: "b", opens: 50, clicks: 5, sent: 1000 },
      ],
    });
    expect(ranked[0]?.id).toBe("a");
    expect(ranked[0]?.predictedOpenRate).toBeGreaterThan(
      ranked[1]?.predictedOpenRate ?? 0,
    );
  });

  test("LLM second-opinion is averaged into the spam-risk", async () => {
    const stub = new StubLlmClient({
      responses: { "variant-spam-second-opinion": "100" },
    });
    const { ranked } = await scoreVariants(
      {
        variants: [
          {
            id: "v1",
            subject: "Hello",
            html: "<p>Hi</p>",
            fromDomain: "acme.com",
          },
        ],
      },
      { llm: stub },
    );
    expect(ranked[0]?.spamRisk).toBeGreaterThan(0);
    expect(stub.callLog[0]?.purpose).toBe("variant-spam-second-opinion");
  });

  test("composite score reflects spam penalty", async () => {
    const { ranked } = await scoreVariants({
      variants: [
        {
          id: "spam",
          subject: "WIN $$$ FREE !!!",
          html: '<a href="x">click here now</a><a href="y">click here now</a><a href="z">click here now</a>',
          fromDomain: "winner.zip",
        },
      ],
    });
    expect(ranked[0]?.compositeScore).toBeLessThan(0.21);
  });

  test("CTA detection lifts predicted click rate", async () => {
    const { ranked } = await scoreVariants({
      variants: [
        {
          id: "with-cta",
          subject: "Your monthly recap",
          html: '<p>See the full report. <a href="https://x.example/recap">Read the recap</a></p>',
          fromDomain: "acme.com",
        },
        {
          id: "no-cta",
          subject: "Your monthly recap",
          html: "<p>See the full report.</p>",
          fromDomain: "acme.com",
        },
      ],
    });
    const withCta = ranked.find((r) => r.id === "with-cta");
    const noCta = ranked.find((r) => r.id === "no-cta");
    expect(withCta?.predictedClickRate).toBeGreaterThan(
      noCta?.predictedClickRate ?? 0,
    );
  });
});
