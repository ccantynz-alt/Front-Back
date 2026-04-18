// ── Migration SQL Linter (BLK-026) ──────────────────────────────────
// Static validator for Drizzle migration files. Implements the rules
// from CLAUDE.md §0.4.1:
//
//   * DDL statements must be separated by `--> statement-breakpoint`.
//     (The libsql migrator executes one statement per `execute()` call;
//     without breakpoints the second statement is silently dropped.)
//   * `CREATE TABLE` / `CREATE INDEX` must use `IF NOT EXISTS` so
//     partially-applied databases can re-run cleanly.
//   * Destructive operations (`DROP TABLE`, `DROP COLUMN`,
//     `ALTER COLUMN … TYPE`) are flagged as warnings — they may be
//     intentional, but they should never sneak in unnoticed.
//
// This file is a pure library. The CLI (`scripts/db-validate.ts`)
// imports it and adds I/O + exit-code handling. The test file in
// `packages/db/src/migration-status.test.ts` imports it directly so
// the rule suite stays testable without spawning a subprocess.

export type LintSeverity = "error" | "warn";

export interface LintFinding {
  /** Absolute or relative path of the migration file. */
  file: string;
  /** 1-based line number that triggered the finding, or 0 when file-level. */
  line: number;
  /** Rule identifier, stable across releases for CI filtering. */
  rule: LintRule;
  severity: LintSeverity;
  message: string;
}

export type LintRule =
  | "missing-breakpoint"
  | "missing-if-not-exists-table"
  | "missing-if-not-exists-index"
  | "destructive-op";

/**
 * Strip SQL line comments (`-- …`) and blank lines so statement
 * counting is not thrown off by doc headers. Block comments (`/* … *\/`)
 * are rare in generated migrations; we leave them alone to keep this
 * function honest about what it actually parses.
 */
function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      // Preserve the breakpoint marker — it *starts* with `--` so naive
      // stripping would delete it. The marker's exact form is
      // `--> statement-breakpoint`.
      if (idx === 0 && line.trimStart().startsWith("--> statement-breakpoint")) {
        return line;
      }
      if (idx >= 0) return line.slice(0, idx);
      return line;
    })
    .join("\n");
}

/**
 * Count top-level DDL statements. We consider a DDL statement to
 * start at any line whose first non-whitespace token is a DDL verb
 * (CREATE / ALTER / DROP). This is approximate but matches how
 * Drizzle's migrator splits files and is good enough for lint-level
 * enforcement.
 */
function countDdlStatements(sourceWithoutComments: string): number {
  const lines = sourceWithoutComments.split("\n");
  let count = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (/^(CREATE|ALTER|DROP)\b/i.test(line)) count += 1;
  }
  return count;
}

/**
 * Run every lint rule against a single migration file.
 * The caller supplies the text so this function stays pure.
 */
export function lintMigrationFile(file: string, source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const sourceNoComments = stripComments(source);
  const lines = source.split("\n");

  // ── Rule 1: breakpoints between DDL statements ───────────────────
  const ddlCount = countDdlStatements(sourceNoComments);
  const breakpointCount = (source.match(/-->\s*statement-breakpoint/g) ?? []).length;
  if (ddlCount >= 2 && breakpointCount < ddlCount - 1) {
    findings.push({
      file,
      line: 0,
      rule: "missing-breakpoint",
      severity: "error",
      message: `Found ${ddlCount} DDL statements but only ${breakpointCount} "--> statement-breakpoint" marker(s); expected at least ${ddlCount - 1}.`,
    });
  }

  // ── Rule 2 + 3: IF NOT EXISTS on CREATE TABLE / CREATE INDEX ─────
  const tableCreate = /^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/i;
  const indexCreate = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\b)/i;

  // ── Rule 4: destructive operations ───────────────────────────────
  const destructivePatterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /^\s*DROP\s+TABLE\b/i, label: "DROP TABLE" },
    { regex: /\bDROP\s+COLUMN\b/i, label: "DROP COLUMN" },
    { regex: /\bALTER\s+COLUMN\b.*\bTYPE\b/i, label: "ALTER COLUMN TYPE" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith("--")) continue;

    if (tableCreate.test(raw)) {
      findings.push({
        file,
        line: lineNo,
        rule: "missing-if-not-exists-table",
        severity: "error",
        message: "CREATE TABLE must use IF NOT EXISTS (CLAUDE.md §0.4.1).",
      });
    }
    if (indexCreate.test(raw)) {
      findings.push({
        file,
        line: lineNo,
        rule: "missing-if-not-exists-index",
        severity: "error",
        message: "CREATE INDEX must use IF NOT EXISTS (CLAUDE.md §0.4.1).",
      });
    }
    for (const { regex, label } of destructivePatterns) {
      if (regex.test(raw)) {
        findings.push({
          file,
          line: lineNo,
          rule: "destructive-op",
          severity: "warn",
          message: `Destructive operation detected: ${label}. Ensure a prior column dump / backup step exists before applying to production.`,
        });
      }
    }
  }

  return findings;
}

/**
 * Aggregate lint statistics across an entire migration set.
 * Returned by `lintMigrationSet` and consumed by the CLI.
 */
export interface LintSummary {
  totalFiles: number;
  filesWithErrors: number;
  filesWithWarnings: number;
  errors: LintFinding[];
  warnings: LintFinding[];
}

/**
 * Run `lintMigrationFile` over a list of `{ file, source }` records and
 * return a summary with findings split by severity.
 */
export function lintMigrationSet(
  files: Array<{ file: string; source: string }>,
): LintSummary {
  const errors: LintFinding[] = [];
  const warnings: LintFinding[] = [];
  const erroredFiles = new Set<string>();
  const warnedFiles = new Set<string>();

  for (const { file, source } of files) {
    const findings = lintMigrationFile(file, source);
    for (const f of findings) {
      if (f.severity === "error") {
        errors.push(f);
        erroredFiles.add(file);
      } else {
        warnings.push(f);
        warnedFiles.add(file);
      }
    }
  }

  return {
    totalFiles: files.length,
    filesWithErrors: erroredFiles.size,
    filesWithWarnings: warnedFiles.size,
    errors,
    warnings,
  };
}
