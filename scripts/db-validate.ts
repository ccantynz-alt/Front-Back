#!/usr/bin/env bun
// ── db:validate — static migration linter CLI (BLK-026) ────────────
// Walks every file in `packages/db/migrations/*.sql` and runs the
// rules from `packages/db/src/migration-lint.ts` against each one.
//
// Exit codes:
//   0 — zero errors (warnings allowed — destructive ops may be intentional)
//   1 — at least one error
//
// Usage:
//   bun run db:validate

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { lintMigrationSet } from "../packages/db/src/migration-lint";

const USE_COLOR = process.stdout.isTTY === true && process.env["NO_COLOR"] !== "1";
const esc = (code: string, text: string): string =>
  USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
const green = (s: string) => esc("32", s);
const yellow = (s: string) => esc("33", s);
const red = (s: string) => esc("31", s);
const dim = (s: string) => esc("2", s);
const bold = (s: string) => esc("1", s);

// ── Entry point ────────────────────────────────────────────────────

const MIGRATIONS_DIR = resolve(import.meta.dir, "..", "packages", "db", "migrations");

function collectMigrationFiles(): Array<{ file: string; source: string; path: string }> {
  const entries = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return entries.map((name) => {
    const path = resolve(MIGRATIONS_DIR, name);
    const source = readFileSync(path, "utf8");
    return { file: name, source, path };
  });
}

function main(): number {
  const files = collectMigrationFiles();
  console.log(bold("Crontech migration validator"));
  console.log(dim(`scanning ${files.length} files in ${MIGRATIONS_DIR}`));
  console.log();

  const summary = lintMigrationSet(
    files.map(({ file, source }) => ({ file, source })),
  );

  for (const f of summary.errors) {
    console.log(
      `${red("ERROR")} ${f.file}${f.line > 0 ? `:${f.line}` : ""} [${f.rule}] ${f.message}`,
    );
  }
  for (const f of summary.warnings) {
    console.log(
      `${yellow("WARN ")} ${f.file}${f.line > 0 ? `:${f.line}` : ""} [${f.rule}] ${f.message}`,
    );
  }

  if (summary.errors.length === 0 && summary.warnings.length === 0) {
    console.log(dim("(no findings)"));
  }

  console.log();
  console.log(
    `${bold("summary:")} ${summary.totalFiles} file(s), ${
      summary.errors.length === 0
        ? green("0 errors")
        : red(`${summary.errors.length} errors`)
    }, ${
      summary.warnings.length === 0
        ? green("0 warnings")
        : yellow(`${summary.warnings.length} warnings`)
    }`,
  );

  if (summary.errors.length > 0) {
    console.log(red(bold("validation failed")));
    return 1;
  }
  console.log(green(bold("validation passed")));
  return 0;
}

process.exit(main());
