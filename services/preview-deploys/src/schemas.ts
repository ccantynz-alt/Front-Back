/**
 * Inbound webhook payload validation.
 *
 * GitHub PR webhooks have a large surface, but we only need a thin slice. We
 * validate the slice with a hand-written checker so this service has zero
 * runtime dependencies (every byte not shipped is a byte not patched).
 *
 * Any extra fields are tolerated; missing required fields produce a typed
 * error result so the boundary never lets a malformed event reach the
 * orchestrator.
 */

export type ValidationIssue = { readonly path: string; readonly message: string };

export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: ValidationIssue[] };

const ALLOWED_ACTIONS = ["opened", "synchronize", "reopened", "closed"] as const;

export type GithubPrAction = (typeof ALLOWED_ACTIONS)[number];

export interface GithubPrWebhook {
  readonly action: GithubPrAction;
  readonly number: number;
  readonly repository: { readonly name: string; readonly owner: { readonly login: string } };
  readonly pull_request: {
    readonly head: { readonly sha: string; readonly ref: string };
    readonly base: { readonly ref: string };
    readonly merged?: boolean;
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getStringField(
  source: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
  minLen = 1,
): string | undefined {
  const value = source[path.split(".").at(-1) ?? ""];
  if (typeof value !== "string" || value.length < minLen) {
    issues.push({ path, message: `expected string with length >= ${minLen}` });
    return undefined;
  }
  return value;
}

export function parseGithubPrWebhook(
  raw: unknown,
): ValidationResult<GithubPrWebhook> {
  const issues: ValidationIssue[] = [];
  if (!isObject(raw)) {
    return {
      success: false,
      issues: [{ path: "$", message: "expected object" }],
    };
  }
  const action = raw["action"];
  const allowed = ALLOWED_ACTIONS as readonly string[];
  if (typeof action !== "string" || !allowed.includes(action)) {
    issues.push({ path: "action", message: `expected one of ${allowed.join("|")}` });
  }
  const num = raw["number"];
  if (
    typeof num !== "number" ||
    !Number.isInteger(num) ||
    num <= 0
  ) {
    issues.push({ path: "number", message: "expected positive integer" });
  }
  const repo = raw["repository"];
  let repoName: string | undefined;
  let ownerLogin: string | undefined;
  if (!isObject(repo)) {
    issues.push({ path: "repository", message: "expected object" });
  } else {
    repoName = getStringField(repo, "repository.name", issues);
    const owner = repo["owner"];
    if (!isObject(owner)) {
      issues.push({ path: "repository.owner", message: "expected object" });
    } else {
      ownerLogin = getStringField(owner, "repository.owner.login", issues);
    }
  }
  const pr = raw["pull_request"];
  let headSha: string | undefined;
  let headRef: string | undefined;
  let baseRef: string | undefined;
  let merged: boolean | undefined;
  if (!isObject(pr)) {
    issues.push({ path: "pull_request", message: "expected object" });
  } else {
    const head = pr["head"];
    if (!isObject(head)) {
      issues.push({ path: "pull_request.head", message: "expected object" });
    } else {
      headSha = getStringField(head, "pull_request.head.sha", issues, 7);
      headRef = getStringField(head, "pull_request.head.ref", issues);
    }
    const base = pr["base"];
    if (!isObject(base)) {
      issues.push({ path: "pull_request.base", message: "expected object" });
    } else {
      baseRef = getStringField(base, "pull_request.base.ref", issues);
    }
    const m = pr["merged"];
    if (m !== undefined) {
      if (typeof m !== "boolean") {
        issues.push({ path: "pull_request.merged", message: "expected boolean" });
      } else {
        merged = m;
      }
    }
  }
  if (issues.length > 0) {
    return { success: false, issues };
  }
  return {
    success: true,
    data: {
      action: action as GithubPrAction,
      number: num as number,
      repository: {
        name: repoName as string,
        owner: { login: ownerLogin as string },
      },
      pull_request: {
        head: { sha: headSha as string, ref: headRef as string },
        base: { ref: baseRef as string },
        ...(merged !== undefined ? { merged } : {}),
      },
    },
  };
}
