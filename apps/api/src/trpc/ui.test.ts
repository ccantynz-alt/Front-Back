// ── cron.ui.* tRPC tests ────────────────────────────────────────────
// Receipts for the UI component catalog: every procedure gets at
// least one happy-path and one failure-path test. Unauth is
// verified. Idempotency, soft-delete, validation of trees, and
// deterministic composition are all exercised end-to-end against
// the real DB (wiped + remigrated by test/setup.ts preload).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db, sessions, uiComponents, users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";
import { createSession } from "../auth/session";
import type { TRPCContext } from "./context";
import { appRouter } from "./router";

function createTestContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    db,
    userId: null,
    sessionToken: null,
    csrfToken: null,
    serviceKey: null,
    scopedDb: null,
    ...overrides,
  };
}

const caller = appRouter.createCaller;

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `test-ui-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}@example.com`,
    displayName: "Test UI User",
  });
  return id;
}

async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("tRPC cron.ui.*", () => {
  let userId: string;
  let sessionToken: string;

  beforeEach(async () => {
    await db.delete(uiComponents);
    userId = await createTestUser();
    sessionToken = await createSession(userId, db);
  });

  afterEach(async () => {
    await db.delete(uiComponents);
    await cleanupTestUser(userId);
  });

  function authedCtx(): TRPCContext {
    return createTestContext({ userId, sessionToken });
  }

  // ── register ──────────────────────────────────────────────────────

  test("ui.register rejects unauthenticated callers", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).ui.register({
        name: "Button",
        category: "input",
        description: "A clickable button",
        descriptor: { props: [], slots: [], examples: [] },
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("UNAUTHORIZED");
    }
  });

  test("ui.register creates a component with full descriptor", async () => {
    const ctx = authedCtx();
    const out = await caller(ctx).ui.register({
      name: "Button",
      category: "input",
      description: "A clickable button with variants and an optional icon",
      descriptor: {
        props: [
          {
            name: "label",
            type: "string",
            required: true,
          },
          {
            name: "variant",
            type: "enum",
            required: false,
            enumValues: ["primary", "secondary", "ghost"],
            defaultValue: "primary",
          },
          {
            name: "disabled",
            type: "boolean",
            required: false,
            defaultValue: false,
          },
        ],
        slots: [],
        examples: [{ label: "Click me", variant: "primary" }],
      },
    });
    expect(out.name).toBe("Button");
    expect(out.category).toBe("input");
    expect(out.isActive).toBe(true);
    expect(out.id).toMatch(/^uic_/);
    expect(out.registeredBy).toBe(userId);
    const parsed = JSON.parse(out.descriptorJson) as {
      props: Array<{ name: string }>;
    };
    expect(parsed.props).toHaveLength(3);
  });

  test("ui.register is idempotent on name", async () => {
    const ctx = authedCtx();
    const first = await caller(ctx).ui.register({
      name: "Stack",
      category: "layout",
      description: "Vertical stack",
      descriptor: { props: [], slots: ["children"], examples: [] },
    });
    const second = await caller(ctx).ui.register({
      name: "Stack",
      category: "layout",
      description: "Different description",
      descriptor: { props: [], slots: [], examples: [] },
    });
    expect(second.id).toBe(first.id);
    expect(second.description).toBe("Vertical stack"); // original wins
  });

  test("ui.register rejects malformed component names", async () => {
    const ctx = authedCtx();
    try {
      await caller(ctx).ui.register({
        name: "has spaces",
        category: "input",
        description: "nope",
        descriptor: { props: [], slots: [], examples: [] },
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("BAD_REQUEST");
    }
  });

  // ── list ──────────────────────────────────────────────────────────

  test("ui.list returns only active components by default", async () => {
    const ctx = authedCtx();
    await caller(ctx).ui.register({
      name: "Button",
      category: "input",
      description: "btn",
      descriptor: { props: [], slots: [], examples: [] },
    });
    await caller(ctx).ui.register({
      name: "Stack",
      category: "layout",
      description: "stk",
      descriptor: { props: [], slots: [], examples: [] },
    });
    await caller(ctx).ui.deregister({ name: "Button" });

    const visible = await caller(ctx).ui.list();
    expect(visible).toHaveLength(1);
    expect(visible[0]?.name).toBe("Stack");

    const withInactive = await caller(ctx).ui.list({ includeInactive: true });
    expect(withInactive).toHaveLength(2);
  });

  test("ui.list filters by category", async () => {
    const ctx = authedCtx();
    await caller(ctx).ui.register({
      name: "Button",
      category: "input",
      description: "btn",
      descriptor: { props: [], slots: [], examples: [] },
    });
    await caller(ctx).ui.register({
      name: "Card",
      category: "display",
      description: "crd",
      descriptor: { props: [], slots: [], examples: [] },
    });
    const inputs = await caller(ctx).ui.list({ category: "input" });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.name).toBe("Button");
  });

  // ── getByName ─────────────────────────────────────────────────────

  test("ui.getByName returns a registered component", async () => {
    const ctx = authedCtx();
    await caller(ctx).ui.register({
      name: "Heading",
      category: "display",
      description: "A heading",
      descriptor: { props: [], slots: [], examples: [] },
    });
    const out = await caller(ctx).ui.getByName({ name: "Heading" });
    expect(out.name).toBe("Heading");
  });

  test("ui.getByName throws NOT_FOUND for unknown name", async () => {
    const ctx = authedCtx();
    try {
      await caller(ctx).ui.getByName({ name: "Nope" });
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
  });

  test("ui.getByName throws NOT_FOUND for deregistered component", async () => {
    const ctx = authedCtx();
    await caller(ctx).ui.register({
      name: "Toast",
      category: "feedback",
      description: "A toast",
      descriptor: { props: [], slots: [], examples: [] },
    });
    await caller(ctx).ui.deregister({ name: "Toast" });
    try {
      await caller(ctx).ui.getByName({ name: "Toast" });
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
  });

  // ── deregister ────────────────────────────────────────────────────

  test("ui.deregister hides the component from list and getByName", async () => {
    const ctx = authedCtx();
    await caller(ctx).ui.register({
      name: "Modal",
      category: "feedback",
      description: "A modal",
      descriptor: { props: [], slots: [], examples: [] },
    });
    const out = await caller(ctx).ui.deregister({ name: "Modal" });
    expect(out.ok).toBe(true);
    expect(out.name).toBe("Modal");
    const visible = await caller(ctx).ui.list();
    expect(visible).toHaveLength(0);
  });

  test("ui.deregister throws NOT_FOUND for unknown name", async () => {
    const ctx = authedCtx();
    try {
      await caller(ctx).ui.deregister({ name: "Nope" });
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
  });

  // ── validate ──────────────────────────────────────────────────────

  async function seedValidatableCatalog(ctx: TRPCContext): Promise<void> {
    await caller(ctx).ui.register({
      name: "Stack",
      category: "layout",
      description: "Vertical stack",
      descriptor: {
        props: [
          {
            name: "gap",
            type: "enum",
            required: false,
            enumValues: ["sm", "md", "lg"],
            defaultValue: "md",
          },
        ],
        slots: ["children"],
        examples: [],
      },
    });
    await caller(ctx).ui.register({
      name: "Text",
      category: "display",
      description: "Plain text",
      descriptor: {
        props: [
          { name: "content", type: "string", required: true },
          { name: "bold", type: "boolean", required: false },
        ],
        slots: [],
        examples: [],
      },
    });
  }

  test("ui.validate accepts a well-formed tree", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.validate({
      tree: {
        component: "Stack",
        props: { gap: "md" },
        children: [
          {
            component: "Text",
            props: { content: "Hello", bold: true },
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  test("ui.validate flags unknown components", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.validate({
      tree: { component: "UnknownThing" },
    });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "unknown_component")).toBe(true);
  });

  test("ui.validate flags missing required props", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.validate({
      tree: {
        component: "Text",
        props: {}, // content is required, missing
      },
    });
    expect(res.valid).toBe(false);
    const codes = res.issues.map((i) => i.code);
    expect(codes).toContain("missing_required_prop");
  });

  test("ui.validate flags wrong prop types", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.validate({
      tree: {
        component: "Text",
        props: { content: 42 }, // expected string, got number
      },
    });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "wrong_prop_type")).toBe(true);
  });

  test("ui.validate flags unknown props", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.validate({
      tree: {
        component: "Text",
        props: { content: "ok", sparkles: true },
      },
    });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "unknown_prop")).toBe(true);
  });

  test("ui.validate recurses into children", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.validate({
      tree: {
        component: "Stack",
        children: [
          { component: "Text", props: { content: "ok" } },
          { component: "Text", props: {} }, // missing required content
        ],
      },
    });
    expect(res.valid).toBe(false);
    const missingIssue = res.issues.find((i) => i.code === "missing_required_prop");
    expect(missingIssue?.path).toContain("children[1]");
  });

  // ── compose ───────────────────────────────────────────────────────

  test("ui.compose fails on empty catalog", async () => {
    const ctx = authedCtx();
    try {
      await caller(ctx).ui.compose({ intent: "build a landing page" });
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("PRECONDITION_FAILED");
    }
  });

  test("ui.compose wraps components in a registered Stack when available", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const res = await caller(ctx).ui.compose({
      intent: "show some text",
    });
    expect(res.method).toBe("deterministic");
    expect(res.tree.component).toBe("Stack");
    expect(res.tree.children?.length).toBeGreaterThan(0);
    expect(res.intent).toBe("show some text");
  });

  test("ui.compose output passes ui.validate", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    const composed = await caller(ctx).ui.compose({
      intent: "assemble catalog",
    });
    const validation = await caller(ctx).ui.validate({
      tree: composed.tree,
    });
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  test("ui.compose respects category filter", async () => {
    const ctx = authedCtx();
    await seedValidatableCatalog(ctx);
    await caller(ctx).ui.register({
      name: "Button",
      category: "input",
      description: "btn",
      descriptor: {
        props: [{ name: "label", type: "string", required: true }],
        slots: [],
        examples: [],
      },
    });
    const res = await caller(ctx).ui.compose({
      intent: "only display things",
      category: "display",
    });
    // Stack is layout, so with category=display no Stack → synthetic Root
    expect(res.tree.component).toBe("Root");
    const childNames = res.tree.children?.map((c) => c.component) ?? [];
    expect(childNames).toContain("Text");
    expect(childNames).not.toContain("Button");
  });

  test("ui.compose respects maxComponents limit", async () => {
    const ctx = authedCtx();
    // Register 5 display components
    for (const name of ["A", "B", "C", "D", "E"]) {
      await caller(ctx).ui.register({
        name,
        category: "display",
        description: `Component ${name}`,
        descriptor: { props: [], slots: [], examples: [] },
      });
    }
    const res = await caller(ctx).ui.compose({
      intent: "limit test",
      maxComponents: 2,
    });
    // No Stack registered → Root + 2 children
    expect(res.tree.component).toBe("Root");
    expect(res.tree.children).toHaveLength(2);
    expect(res.componentCount).toBe(2);
  });
});
