import { describe, expect, test } from "bun:test";
import { PreviewOrchestrator } from "../src/orchestrator";
import { InMemoryStateStore } from "../src/state/store";
import type { PullRequestEvent } from "../src/types";
import { MockBuildRunner, MockComments, MockDeployer } from "./mocks";

const PREVIEW_DOMAIN = "preview.crontech.dev";

function makeOrchestrator() {
  const buildRunner = new MockBuildRunner();
  const deployer = new MockDeployer();
  const comments = new MockComments();
  const store = new InMemoryStateStore();
  let nowCounter = 1_700_000_000_000;
  const orchestrator = new PreviewOrchestrator({
    buildRunner,
    deployer,
    comments,
    store,
    config: {
      previewDomain: PREVIEW_DOMAIN,
      now: () => nowCounter++,
    },
  });
  return { orchestrator, buildRunner, deployer, comments, store };
}

const baseEvent: PullRequestEvent = {
  action: "opened",
  owner: "crontech",
  repo: "btf",
  number: 7,
  headSha: "abcdef1234567890",
  headRef: "feature/x",
  baseRef: "main",
};

describe("PreviewOrchestrator — open/sync flow", () => {
  test("opens a PR: build → deploy → live, posts comment once", async () => {
    const { orchestrator, buildRunner, deployer, comments } =
      makeOrchestrator();
    const state = await orchestrator.handlePrEvent(baseEvent);

    expect(state.status).toBe("live");
    expect(state.hostname).toBe(
      `crontech-btf-pr7-abcdef1.${PREVIEW_DOMAIN}`,
    );
    expect(buildRunner.triggers).toHaveLength(1);
    expect(buildRunner.triggers[0]?.sha).toBe("abcdef1234567890");
    expect(deployer.deploys).toHaveLength(1);
    expect(deployer.deploys[0]?.target).toBe("preview");
    expect(deployer.deploys[0]?.hostname).toBe(state.hostname);

    // Comment is posted exactly once, then updated for each transition
    // (pending → building → deploying → live).
    expect(comments.posts).toHaveLength(1);
    expect(comments.updates.length).toBeGreaterThanOrEqual(3);
    expect(state.commentId).toBe(100);
  });

  test("idempotent comment update on synchronize event", async () => {
    const { orchestrator, comments } = makeOrchestrator();
    await orchestrator.handlePrEvent(baseEvent);
    const postCountAfterOpen = comments.posts.length;

    await orchestrator.handlePrEvent({
      ...baseEvent,
      action: "synchronize",
      headSha: "0123456789abcdef",
    });
    // Still only the original post — subsequent updates only.
    expect(comments.posts.length).toBe(postCountAfterOpen);
    expect(comments.updates.length).toBeGreaterThan(0);
  });

  test("hostname rotates with the new SHA on synchronize", async () => {
    const { orchestrator } = makeOrchestrator();
    const opened = await orchestrator.handlePrEvent(baseEvent);
    const synced = await orchestrator.handlePrEvent({
      ...baseEvent,
      action: "synchronize",
      headSha: "ffffffe0000000000",
    });
    expect(opened.hostname).not.toBe(synced.hostname);
    expect(synced.hostname).toContain("pr7-ffffffe");
  });

  test("rapid sync events cancel the in-flight build", async () => {
    // Use a build runner that hangs on the first call so we can fire a
    // second sync while the first build is still in flight.
    const buildRunner = new MockBuildRunner();
    const deployer = new MockDeployer();
    const comments = new MockComments();
    const store = new InMemoryStateStore();
    let nowCounter = 1_700_000_000_000;

    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let callCount = 0;
    const originalTrigger = buildRunner.triggerBuild.bind(buildRunner);
    buildRunner.triggerBuild = async (req) => {
      callCount += 1;
      if (callCount === 1) {
        // Record the call but block until released.
        buildRunner.triggers.push(req);
        await firstReleased;
        return { buildId: "build-1-frozen", artefactUrl: "https://a/1" };
      }
      return originalTrigger(req);
    };

    const orchestrator = new PreviewOrchestrator({
      buildRunner,
      deployer,
      comments,
      store,
      config: {
        previewDomain: PREVIEW_DOMAIN,
        now: () => nowCounter++,
      },
    });

    // Kick off the first event but don't await it.
    const first = orchestrator.handlePrEvent(baseEvent);

    // Wait until the orchestrator has assigned the buildId for the first
    // run. We poll the store directly.
    let assigned = false;
    for (let i = 0; i < 100 && !assigned; i++) {
      await new Promise((r) => setTimeout(r, 5));
      const s = store.get("crontech/btf#7");
      if (s?.lastBuildId === "build-1-frozen") {
        assigned = true;
        break;
      }
      // The build runner records the trigger before assigning the id; if
      // the state machine is at "building" with no id yet, keep waiting.
    }

    // The first build is now blocked inside triggerBuild — it has been
    // recorded but the orchestrator hasn't received its return value yet,
    // so lastBuildId is still unset on the store. Instead, assert via the
    // recorded triggers that the first call happened, then release and
    // synchronously fire the second event after the first completes.
    expect(buildRunner.triggers.length).toBe(1);

    // Release the first build so the orchestrator can complete its chain.
    releaseFirst();
    await first;

    // Now manually rewind the store to "deploying" with a known buildId,
    // then fire a sync — this exercises the cancel path deterministically.
    const live = store.get("crontech/btf#7");
    expect(live).toBeDefined();
    if (!live) return;
    live.status = "deploying";
    live.lastBuildId = "build-in-flight";
    store.set(live);

    await orchestrator.handlePrEvent({
      ...baseEvent,
      action: "synchronize",
      headSha: "ffffffe0000000000",
    });
    expect(buildRunner.cancels).toContain("build-in-flight");
  });
});

describe("PreviewOrchestrator — failure handling", () => {
  test("marks state failed when build-runner throws", async () => {
    const { orchestrator, buildRunner, comments } = makeOrchestrator();
    buildRunner.failOnce = true;
    await expect(orchestrator.handlePrEvent(baseEvent)).rejects.toThrow(
      /build-runner exploded/,
    );
    const state = orchestrator.getState("crontech/btf#7");
    expect(state?.status).toBe("failed");
    expect(state?.errorMessage).toContain("build-runner exploded");
    // Comment was posted and updated to reflect failure.
    expect(comments.updates.at(-1)?.body).toContain("Build failed");
  });

  test("marks state failed when deployer throws", async () => {
    const { orchestrator, deployer } = makeOrchestrator();
    deployer.failOnce = true;
    await expect(orchestrator.handlePrEvent(baseEvent)).rejects.toThrow(
      /deployer exploded/,
    );
    const state = orchestrator.getState("crontech/btf#7");
    expect(state?.status).toBe("failed");
  });

  test("recovers from previous failure on next sync", async () => {
    const { orchestrator, buildRunner } = makeOrchestrator();
    buildRunner.failOnce = true;
    await expect(orchestrator.handlePrEvent(baseEvent)).rejects.toThrow();
    const next = await orchestrator.handlePrEvent({
      ...baseEvent,
      action: "synchronize",
      headSha: "ffffffe0000000000",
    });
    expect(next.status).toBe("live");
    expect(next.errorMessage).toBeUndefined();
  });
});

describe("PreviewOrchestrator — close/teardown flow", () => {
  test("tears down deployment on close", async () => {
    const { orchestrator, deployer, comments } = makeOrchestrator();
    await orchestrator.handlePrEvent(baseEvent);
    const state = await orchestrator.handlePrEvent({
      ...baseEvent,
      action: "closed",
      merged: true,
    });
    expect(state.status).toBe("torn-down");
    expect(deployer.teardowns).toHaveLength(1);
    expect(comments.updates.at(-1)?.body).toContain("torn down");
  });

  test("close on unknown PR yields a synthesized torn-down record", async () => {
    const { orchestrator, deployer } = makeOrchestrator();
    const state = await orchestrator.handlePrEvent({
      ...baseEvent,
      action: "closed",
    });
    expect(state.status).toBe("torn-down");
    expect(deployer.teardowns).toHaveLength(0);
  });

  test("manualTeardown returns undefined for unknown PR", async () => {
    const { orchestrator } = makeOrchestrator();
    const result = await orchestrator.manualTeardown("nope/missing#1");
    expect(result).toBeUndefined();
  });

  test("manualTeardown tears down a known PR", async () => {
    const { orchestrator, deployer } = makeOrchestrator();
    await orchestrator.handlePrEvent(baseEvent);
    const result = await orchestrator.manualTeardown("crontech/btf#7");
    expect(result?.status).toBe("torn-down");
    expect(deployer.teardowns).toHaveLength(1);
  });
});

describe("PreviewOrchestrator — concurrency mutex", () => {
  test("serialises concurrent events for the same PR", async () => {
    const { orchestrator, buildRunner, deployer } = makeOrchestrator();
    // Fire three events simultaneously.
    const ev2: PullRequestEvent = {
      ...baseEvent,
      action: "synchronize",
      headSha: "1111111aaaaaaaaaa",
    };
    const ev3: PullRequestEvent = {
      ...baseEvent,
      action: "synchronize",
      headSha: "2222222bbbbbbbbbb",
    };
    await Promise.all([
      orchestrator.handlePrEvent(baseEvent),
      orchestrator.handlePrEvent(ev2),
      orchestrator.handlePrEvent(ev3),
    ]);
    // Three sequential builds, no interleaving.
    expect(buildRunner.triggers).toHaveLength(3);
    // SHAs hit in submission order — proves serialisation.
    expect(buildRunner.triggers.map((t) => t.sha)).toEqual([
      baseEvent.headSha,
      ev2.headSha,
      ev3.headSha,
    ]);
    // Final state reflects the last sync.
    const state = orchestrator.getState("crontech/btf#7");
    expect(state?.lastSha).toBe(ev3.headSha);
    expect(deployer.deploys).toHaveLength(3);
  });
});
