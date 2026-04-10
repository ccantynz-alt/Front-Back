# Stack Rules

> Binding doctrine. Sits alongside CLAUDE.md and POSITIONING.md. Any agent
> touching the stack reads this first.

The stack is a weapon, not a museum. These rules keep the weapon sharp without
letting any one agent scatter-gun it into a pile of inconsistent choices.

---

## 1. Zod-first at every boundary

Every enum, every payload shape, every cross-process contract in a Zod-capable
package follows this pattern:

```ts
export const FooSchema = z.enum(["a", "b", "c"]);
export type Foo = z.infer<typeof FooSchema>;
export function isFoo(v: unknown): v is Foo {
  return FooSchema.safeParse(v).success;
}
```

Rules:

1. The schema is the source of truth. The type is inferred. Never hand-write
   a TS union and parse it separately.
2. Every exported enum ships a `safeParse`-backed type guard.
3. If a package cannot pull `zod` as a direct dep (currently only `apps/web`),
   hand-rolled validators are tolerated — but the validator lives next to the
   type, never embedded at the call site.
4. Changes to any enum require updating the schema first, then letting the
   compiler drive every call site.

## 2. Dependency discipline

- **Adding a top-level dep** to the stack is a §0.7 HARD GATE. Ask Craig.
- **Removing a top-level dep** is a HARD GATE. Ask Craig.
- **Bumping a major version** is a SOFT GATE. State the plan, wait 30s, act.
- **Bumping a patch/minor** is a free action — Renovate handles most of it.
- **Pinned versions always.** No `^`, no `~` on runtime-critical packages in
  the tier-1 services (`apps/api`, `apps/web`, `packages/cfo-engine`,
  `packages/audit-log`). Use exact versions so a drifting lockfile can't
  silently replace our battle-tested build.

## 3. Money and time

- **Money is BigInt.** Never `number`. Never `parseFloat`. The CFO engine
  denominates every value in integer minor units. Display-layer formatting
  lives at the edge of the UI, never in the ledger.
- **Currency is a 3-letter ISO 4217 code** validated against `/^[A-Z]{3}$/`
  at the Zod boundary.
- **Time is UTC ISO-8601** at every boundary. Local time exists only in the
  render layer.

## 4. Errors

- No `catch (e: any)`. Every catch either types the error via `unknown` and
  narrows, or uses Effect-TS for typed error flows.
- No error swallowing. If you log-and-continue, the log message has to say
  what the recovery path is.
- No fallbacks for impossible states. If something cannot happen, throw
  loudly — do not add a defensive `|| defaultValue` that hides the bug.

## 5. Files and file layout

- One concept per file. If a file grows past ~500 lines, it is probably two
  concepts wearing a trenchcoat.
- Tests live next to the code they test: `foo.ts` → `foo.test.ts`.
- The public surface of every package is declared in its `index.ts`. No
  deep imports into a package's internals from outside that package.

## 6. Strictness is not optional

Every package runs TS with:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `verbatimModuleSyntax: true`
- `exactOptionalPropertyTypes: true`
- `noUnusedLocals: true`

A `// @ts-expect-error` is a tripwire, not a solution — if it is still there
six months later, the underlying bug won.

## 7. Changes ship with tests

- New enum → exhaustiveness test that will break when a variant is added.
- New validator → test that accepts a happy-path fixture and at least two
  rejection fixtures.
- New ledger account type → double-entry invariant test.
- New route → smoke test that the route renders and its links resolve.

No test, no merge. Period.

---

**If a rule here conflicts with a future "clever idea," the rule wins.** The
whole point of writing this down is so we stop relitigating the same
decisions every session.
