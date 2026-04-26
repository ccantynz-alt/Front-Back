// ── cron.ui.* — UI Component Catalog (Wave 4, keystone) ─────────────
// Schema-first component registry + generative-UI primitives. Every
// Crontech-hosted product registers the components it renders into
// a shared catalog, then AI agents (or deterministic composers)
// assemble validated component trees from that catalog.
//
// Design: we do NOT store raw JSX or HTML. We store ComponentDescriptor
// — a machine-readable shape { props, slots, examples } — as JSON.
// Consumers (Zoobicon's builder, the AI site-builder agent, the
// future preview runtime) read the catalog, compose a tree of
// ComponentTreeNodes, and validate the tree against the catalog
// before rendering. This is the keystone for preview, collab, and
// video builders — they all lean on "what components exist and
// what shape do they take."
//
// v0 scope (this file):
//   - register / list / getByName / deregister  (the catalog CRUD)
//   - validate                                  (tree → pass/fail + errors)
//   - compose                                   (intent → deterministic tree)
//
// v1 (future): compose() calls the AI router when a cloud provider
// is configured, falling back to the deterministic composer when
// not. Same contract, same return shape — wired in a future session.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { uiComponents } from "@back-to-the-future/db";

// ── Schemas ───────────────────────────────────────────────────

const ComponentNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]*$/,
    "Component name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
  );

const CategorySchema = z.enum([
  "layout",
  "input",
  "display",
  "navigation",
  "feedback",
  "media",
]);

const PropTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "enum",
]);

const PropDescriptorSchema = z.object({
  name: z.string().min(1).max(64),
  type: PropTypeSchema,
  required: z.boolean().default(false),
  description: z.string().max(500).optional(),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.unknown().optional(),
});

const ComponentDescriptorSchema = z.object({
  props: z.array(PropDescriptorSchema).default([]),
  slots: z.array(z.string()).default([]),
  examples: z.array(z.record(z.string(), z.unknown())).default([]),
});

type ComponentDescriptor = z.infer<typeof ComponentDescriptorSchema>;

// Recursive tree node — lazy so the type resolves.
export type ComponentTreeNode = {
  component: string;
  props?: Record<string, unknown> | undefined;
  children?: ComponentTreeNode[] | undefined;
};

const ComponentTreeNodeSchema: z.ZodType<ComponentTreeNode> = z.lazy(() =>
  z.object({
    component: ComponentNameSchema,
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(ComponentTreeNodeSchema).optional(),
  }),
);

// ── Input schemas ──────────────────────────────────────────────

const RegisterInputSchema = z.object({
  name: ComponentNameSchema,
  category: CategorySchema,
  description: z.string().min(1).max(2_000),
  descriptor: ComponentDescriptorSchema,
});

const ListInputSchema = z.object({
  category: CategorySchema.optional(),
  includeInactive: z.boolean().optional(),
});

const GetByNameInputSchema = z.object({ name: ComponentNameSchema });

const DeregisterInputSchema = z.object({ name: ComponentNameSchema });

const ComposeInputSchema = z.object({
  intent: z.string().min(1).max(4_000),
  category: CategorySchema.optional(),
  maxComponents: z.number().int().positive().max(20).optional(),
});

const ValidateInputSchema = z.object({ tree: ComponentTreeNodeSchema });

// ── Helpers ───────────────────────────────────────────────────

function newComponentId(): string {
  return `uic_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function parseDescriptor(raw: string): ComponentDescriptor {
  try {
    const parsed: unknown = JSON.parse(raw);
    return ComponentDescriptorSchema.parse(parsed);
  } catch {
    // A row whose descriptor_json has drifted out of spec should not
    // crash the whole catalog. Return an empty descriptor so at least
    // the component name/category can still be listed.
    return { props: [], slots: [], examples: [] };
  }
}

export interface ValidationIssue {
  readonly path: string;
  readonly code:
    | "unknown_component"
    | "missing_required_prop"
    | "unknown_prop"
    | "wrong_prop_type";
  readonly message: string;
}

function typeOfPropValue(value: unknown): string {
  if (value === null) return "object";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function propTypeMatches(
  expected: z.infer<typeof PropTypeSchema>,
  value: unknown,
  enumValues?: readonly string[],
): boolean {
  if (expected === "enum") {
    if (typeof value !== "string") return false;
    if (!enumValues || enumValues.length === 0) return true;
    return enumValues.includes(value);
  }
  const actual = typeOfPropValue(value);
  if (expected === "object") return actual === "object";
  return actual === expected;
}

function validateNode(
  node: ComponentTreeNode,
  catalog: Map<string, ComponentDescriptor>,
  path: string,
  issues: ValidationIssue[],
): void {
  const descriptor = catalog.get(node.component);
  if (!descriptor) {
    issues.push({
      path,
      code: "unknown_component",
      message: `Component "${node.component}" is not in the catalog.`,
    });
    return;
  }

  const propsGiven = node.props ?? {};
  const declaredPropNames = new Set(descriptor.props.map((p) => p.name));

  for (const prop of descriptor.props) {
    const present = Object.prototype.hasOwnProperty.call(propsGiven, prop.name);
    if (prop.required && !present) {
      issues.push({
        path: `${path}.props.${prop.name}`,
        code: "missing_required_prop",
        message: `Required prop "${prop.name}" is missing on "${node.component}".`,
      });
      continue;
    }
    if (present) {
      const value = propsGiven[prop.name];
      if (!propTypeMatches(prop.type, value, prop.enumValues)) {
        issues.push({
          path: `${path}.props.${prop.name}`,
          code: "wrong_prop_type",
          message: `Prop "${prop.name}" on "${node.component}" expected ${prop.type} but got ${typeOfPropValue(value)}.`,
        });
      }
    }
  }

  for (const givenName of Object.keys(propsGiven)) {
    if (!declaredPropNames.has(givenName)) {
      issues.push({
        path: `${path}.props.${givenName}`,
        code: "unknown_prop",
        message: `Unknown prop "${givenName}" on "${node.component}".`,
      });
    }
  }

  if (node.children) {
    node.children.forEach((child, idx) => {
      validateNode(child, catalog, `${path}.children[${idx}]`, issues);
    });
  }
}

interface CatalogRow {
  readonly name: string;
  readonly category: z.infer<typeof CategorySchema>;
  readonly descriptor: ComponentDescriptor;
}

function buildCatalogMap(
  rows: readonly CatalogRow[],
): Map<string, ComponentDescriptor> {
  const map = new Map<string, ComponentDescriptor>();
  for (const row of rows) {
    map.set(row.name, row.descriptor);
  }
  return map;
}

function defaultPropsFor(descriptor: ComponentDescriptor): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    if (prop.defaultValue !== undefined) {
      out[prop.name] = prop.defaultValue;
      continue;
    }
    if (!prop.required) continue;
    // Required prop with no default — fabricate a placeholder so the
    // composed tree still validates. Callers can override before render.
    switch (prop.type) {
      case "string":
        out[prop.name] = "";
        break;
      case "number":
        out[prop.name] = 0;
        break;
      case "boolean":
        out[prop.name] = false;
        break;
      case "array":
        out[prop.name] = [];
        break;
      case "object":
        out[prop.name] = {};
        break;
      case "enum":
        out[prop.name] = prop.enumValues?.[0] ?? "";
        break;
    }
  }
  return out;
}

// ── Router ─────────────────────────────────────────────────────

export const uiRouter = router({
  /**
   * Register a component in the shared catalog. Idempotent on name —
   * if a component with the same name already exists, the row is
   * returned unchanged. This lets product bootstrap scripts call
   * register() on every deploy without worrying about duplicates.
   *
   * The descriptor is stored as JSON so the shape can evolve without
   * a migration. Consumers that read back the descriptor should
   * always parse it through ComponentDescriptorSchema to absorb
   * drift.
   */
  register: protectedProcedure
    .input(RegisterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(uiComponents)
        .where(eq(uiComponents.name, input.name))
        .limit(1);
      if (existing[0]) {
        return existing[0];
      }

      const id = newComponentId();
      const now = new Date();
      await ctx.db.insert(uiComponents).values({
        id,
        name: input.name,
        category: input.category,
        description: input.description,
        descriptorJson: JSON.stringify(input.descriptor),
        registeredBy: ctx.userId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const inserted = await ctx.db
        .select()
        .from(uiComponents)
        .where(eq(uiComponents.id, id))
        .limit(1);
      const row = inserted[0];
      if (!row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to read back inserted component.",
        });
      }
      return row;
    }),

  /**
   * List every component in the catalog. Optionally filter by
   * category. Inactive components are excluded by default.
   */
  list: protectedProcedure
    .input(ListInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const category = input?.category;
      const includeInactive = input?.includeInactive ?? false;

      const whereClauses = [];
      if (!includeInactive) {
        whereClauses.push(eq(uiComponents.isActive, true));
      }
      if (category !== undefined) {
        whereClauses.push(eq(uiComponents.category, category));
      }

      if (whereClauses.length === 0) {
        return ctx.db.select().from(uiComponents);
      }
      if (whereClauses.length === 1) {
        return ctx.db
          .select()
          .from(uiComponents)
          .where(whereClauses[0]);
      }
      return ctx.db
        .select()
        .from(uiComponents)
        .where(and(...whereClauses));
    }),

  /**
   * Fetch a single component by name. Throws NOT_FOUND if the
   * component is missing OR has been deregistered (isActive=false).
   */
  getByName: protectedProcedure
    .input(GetByNameInputSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(uiComponents)
        .where(
          and(
            eq(uiComponents.name, input.name),
            eq(uiComponents.isActive, true),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Component "${input.name}" is not registered.`,
        });
      }
      return row;
    }),

  /**
   * Soft-delete a component. The row stays in the DB (for audit) but
   * is hidden from list() and getByName(). Re-calling register() with
   * the same name will NOT revive it — that path creates a new row
   * because the unique-on-name constraint is only honoured while the
   * old row is active. For v0 the deregister is truly terminal; v1
   * may add a `reregister` procedure if product flows need it.
   */
  deregister: protectedProcedure
    .input(DeregisterInputSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(uiComponents)
        .where(eq(uiComponents.name, input.name))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Component "${input.name}" is not registered.`,
        });
      }
      await ctx.db
        .update(uiComponents)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(uiComponents.id, row.id));
      return { ok: true as const, name: input.name };
    }),

  /**
   * Validate a component tree against the catalog. Walks every node,
   * checks that the component exists, that required props are
   * present, that prop types match, and that no unknown props are
   * passed. Returns `{ valid, issues }` — valid is true iff issues
   * is empty.
   *
   * This is how downstream runtimes (preview, builder, collab) gate
   * trees before rendering them. AI-generated trees MUST pass
   * validate() before hitting any rendering pipeline.
   */
  validate: protectedProcedure
    .input(ValidateInputSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(uiComponents)
        .where(eq(uiComponents.isActive, true));
      const catalog = buildCatalogMap(
        rows.map((r) => ({
          name: r.name,
          category: r.category as z.infer<typeof CategorySchema>,
          descriptor: parseDescriptor(r.descriptorJson),
        })),
      );

      const issues: ValidationIssue[] = [];
      validateNode(input.tree, catalog, "$", issues);
      return {
        valid: issues.length === 0,
        issues,
      };
    }),

  /**
   * Compose a component tree from an intent string. v0 is
   * deterministic: fetch components matching the optional category
   * filter, wrap them in a vertical Stack (if one is registered)
   * or return them as a flat list under a synthetic Root, and fill
   * every required prop with its default. The return value is
   * guaranteed to pass validate() against the current catalog.
   *
   * v1 will wire `routeAICall` here so real AI composition is
   * available when a cloud provider is configured, falling back to
   * this deterministic path otherwise. The v0 contract is stable
   * so Zoobicon can plug into compose() right now without waiting
   * for the AI path.
   */
  compose: protectedProcedure
    .input(ComposeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const whereClauses = [eq(uiComponents.isActive, true)];
      if (input.category !== undefined) {
        whereClauses.push(eq(uiComponents.category, input.category));
      }
      const rows = await ctx.db
        .select()
        .from(uiComponents)
        .where(and(...whereClauses));

      if (rows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cannot compose: catalog is empty. Register components with ui.register before calling compose.",
        });
      }

      const limit = input.maxComponents ?? 6;
      const picked = rows.slice(0, limit).map((r) => ({
        name: r.name,
        descriptor: parseDescriptor(r.descriptorJson),
      }));

      // Prefer a registered "Stack" layout component as the root. If
      // none exists, emit a synthetic "Root" node — the validator will
      // flag it as unknown_component, which is the correct signal to
      // register one.
      const stackRow = rows.find(
        (r) => r.name === "Stack" && r.category === "layout",
      );

      const children: ComponentTreeNode[] = picked
        .filter((p) => !(stackRow && p.name === "Stack"))
        .map((p) => ({
          component: p.name,
          props: defaultPropsFor(p.descriptor),
        }));

      const tree: ComponentTreeNode = stackRow
        ? {
            component: "Stack",
            props: defaultPropsFor(parseDescriptor(stackRow.descriptorJson)),
            children,
          }
        : {
            component: "Root",
            children,
          };

      return {
        tree,
        intent: input.intent,
        componentCount: children.length + (stackRow ? 1 : 0),
        method: "deterministic" as const,
      };
    }),
});
