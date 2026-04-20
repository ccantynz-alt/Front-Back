# Crontech Migrations

Canonical guide for authoring, validating, and rolling out Drizzle migrations in
the Crontech monorepo. This doc is the operational complement to the doctrine
rule in `CLAUDE.md` §0.4.1 — the doctrine tells you **what** to do, this file
tells you **how** to do it safely.

> **Never rewrite a migration that has already been applied.** Once a migration
> lands on `main` (and especially once it has run on prod), its SQL contents
> are frozen. Drizzle keys applied migrations by the SHA-256 of the file's
> bytes — changing a single character turns a previously-applied migration
> into a brand-new unapplied migration from the DB's perspective, and the two
> states diverge silently.

---

## How migrations work in this repo

- **ORM**: Drizzle, SQLite dialect, libsql client.
- **Folder**: `packages/db/migrations/` holds one `NNNN_<tag>.sql` file per
  migration, plus `meta/_journal.json` which is the source of truth for which
  files exist and in what order.
- **Runtime**: `packages/db/src/migrate.ts` exposes `runMigrations()`. It calls
  Drizzle's libsql migrator, which reads each `.sql` file, splits on
  `--> statement-breakpoint`, and runs each chunk as a separate statement.
- **Bookkeeping table**: `__drizzle_migrations` is created in the target
  database and stores one row per applied migration: `{ hash, created_at }`.
  The `hash` is `sha256(<raw file bytes>)`.

Why the breakpoint matters: the libsql client runs **one statement per
`execute()` call**. Without `--> statement-breakpoint` between statements, only
the first DDL in the file actually executes and everything after it is silently
dropped. The linter enforces this (see below).

---

## Author workflow

1. **Edit `packages/db/src/schema.ts`.** That's the only place schema changes
   belong. Never hand-author DDL from scratch.
2. **Generate a migration**: `bun run --cwd packages/db db:generate`. Drizzle
   inserts `--> statement-breakpoint` between statements for you and updates
   `meta/_journal.json`.
3. **Review the generated SQL.** Check for:
   - `CREATE TABLE IF NOT EXISTS` on every table (not bare `CREATE TABLE`).
   - `CREATE INDEX IF NOT EXISTS` on every index.
   - `--> statement-breakpoint` between every DDL statement.
   - No destructive ops you didn't explicitly plan (drops, column retypes).
4. **Validate locally**: `bun run db:validate`. Zero errors is required;
   warnings on destructive ops are informative and intentional.
5. **Apply locally and verify**: `bun run --cwd packages/db migrate` followed
   by `bun run db:status`. You should see the new migration listed as applied
   and the status should report `in sync`.
6. **Commit.** Include the generated `NNNN_<tag>.sql` *and* the updated
   `meta/_journal.json` in the same commit. Never split them.
7. **Never hand-edit a migration after it has been committed to `main`.**
   If you need to change schema, write a new migration that evolves the
   previous one.

---

## Rollback strategy: forward-only

Crontech migrations are **forward-only**. There are no `down` migrations.

- If a migration is found to be broken **before** it ships to prod: amend the
  PR, force-push the branch (feature branches only), re-run locally, re-review.
- If a broken migration has already shipped: **write a new migration** that
  corrects the damage. Never mutate the original file.
- Destructive ops (`DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN … TYPE`) must be
  preceded by a column dump or snapshot step that Craig has explicitly
  approved. The validator flags these as warnings, not errors, precisely
  because they are sometimes legitimate — but they always need extra eyes.

---

## CI integration

Two commands enforce the rules in CI:

| Command | What it checks | Exit code on failure |
|---|---|---|
| `bun run db:validate` | Static SQL lint (breakpoints, `IF NOT EXISTS`, destructive-op warnings) | `1` |
| `bun run db:status` | Drift between the filesystem and the target DB | `1` |

`db:validate` runs in `.github/workflows/deploy.yml` as a pre-deploy check in
the `build-and-test` job. Broken migrations cannot land on `main`.

`db:status` is intended for:
- Local dev (sanity-check your working tree against your local DB).
- Production shell sessions (verify the Vultr box's DB matches the repo).
- Any CI job that provisions an ephemeral DB and wants to confirm the full
  journal applied cleanly.

Both commands are pure Bun scripts with zero runtime deps beyond what
`@back-to-the-future/db` already pulls in, so they are safe to run anywhere
the repo's lockfile installs.

---

## Known-bad patterns (the linter's rule set)

### Error-level (CI fails)

1. **Missing breakpoint between DDL statements.** The file has two or more
   `CREATE` / `ALTER` / `DROP` statements but fewer `--> statement-breakpoint`
   markers than needed. Every statement after the first is silently dropped
   at apply time.

   ```sql
   -- BAD
   CREATE TABLE IF NOT EXISTS foo (id text PRIMARY KEY);
   CREATE INDEX IF NOT EXISTS foo_idx ON foo (id);

   -- GOOD
   CREATE TABLE IF NOT EXISTS foo (id text PRIMARY KEY);
   --> statement-breakpoint
   CREATE INDEX IF NOT EXISTS foo_idx ON foo (id);
   ```

2. **`CREATE TABLE` without `IF NOT EXISTS`.** If the migration is partially
   applied (e.g. it died mid-way on a prior run) the retry will crash on the
   first already-existing table.

3. **`CREATE INDEX` without `IF NOT EXISTS`.** Same reasoning as tables.

### Warning-level (informational)

4. **Destructive operations**: `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN …
   TYPE`. These are flagged as warnings because they are sometimes intentional,
   but they should never sneak in unnoticed. A destructive op must be paired
   with a prior column dump / backup / snapshot step that Craig has signed off
   on (see `CLAUDE.md` §0.7 — schema migrations that drop data are a hard
   authorization gate).

### Not currently linted (but watch out)

- **Hand-editing an applied migration.** The linter can't see this — Git and
  `db:status` drift reporting are the defense here. If `db:status` reports
  `DRIFT: N migration(s) exist in the database with no matching file on disk`,
  someone has mutated history and the DB hash no longer matches the file.
- **Non-idempotent seed data inside migrations.** Migrations should be DDL,
  not data. Seed data goes in separate scripts (e.g. `scripts/seed-admin.ts`).
