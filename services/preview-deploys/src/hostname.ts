/**
 * Preview hostname generation.
 *
 * Scheme: `<owner>-<repo>-pr<number>-<sha7>.<previewDomain>`
 *
 * The hostname must be a valid DNS label (RFC 1035): lowercase, [a-z0-9-],
 * each label <= 63 chars, no leading/trailing hyphens. We sanitise by:
 *   1. Lowercasing.
 *   2. Replacing any character not in [a-z0-9] with `-`.
 *   3. Collapsing runs of `-`.
 *   4. Trimming leading/trailing `-`.
 *   5. Truncating to a per-segment limit so the assembled label fits in 63 chars.
 *
 * Crontech wins: Vercel preview URLs use opaque hashes (e.g.
 * `myapp-git-feature-x-team.vercel.app`) — they're forgettable and slow to
 * copy-paste. Crontech preview URLs are deterministic, human-readable, and
 * encode the PR number directly so reviewers can land on the right preview
 * without clicking through PR comments.
 */

/** Maximum length of a single DNS label per RFC 1035. */
const MAX_DNS_LABEL = 63;
const SHORT_SHA_LEN = 7;

/** The fixed shape `pr<number>-<sha7>` adds at most ~14 chars per typical PR. */
const FIXED_OVERHEAD = "pr".length + SHORT_SHA_LEN + 2; // dashes

function sanitiseSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface HostnameInput {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly sha: string;
  /** e.g. `preview.crontech.dev` */
  readonly previewDomain: string;
}

export function generateHostname(input: HostnameInput): string {
  const { owner, repo, number, sha, previewDomain } = input;
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Invalid PR number: ${number}`);
  }
  if (sha.length < SHORT_SHA_LEN) {
    throw new Error(`SHA too short, need >= ${SHORT_SHA_LEN} chars: ${sha}`);
  }

  const safeOwner = sanitiseSegment(owner);
  const safeRepo = sanitiseSegment(repo);
  if (safeOwner.length === 0) {
    throw new Error(`Owner produces empty DNS label: ${owner}`);
  }
  if (safeRepo.length === 0) {
    throw new Error(`Repo produces empty DNS label: ${repo}`);
  }
  const shortSha = sha.slice(0, SHORT_SHA_LEN).toLowerCase();
  if (!/^[a-f0-9]+$/.test(shortSha)) {
    throw new Error(`SHA is not hex: ${sha}`);
  }

  // Budget the variable parts (owner + repo) so the assembled label fits.
  const prSegment = `pr${number}`;
  const variableBudget =
    MAX_DNS_LABEL - FIXED_OVERHEAD - prSegment.length - 1; // separators
  // Split the budget between owner and repo (favour repo since it's more
  // identifying). Minimum 4 chars each so the label stays readable.
  const minPart = 4;
  let ownerPart = safeOwner;
  let repoPart = safeRepo;
  if (ownerPart.length + repoPart.length > variableBudget) {
    const repoTarget = Math.max(minPart, variableBudget - minPart);
    repoPart = repoPart.slice(0, repoTarget);
    const ownerTarget = Math.max(minPart, variableBudget - repoPart.length);
    ownerPart = ownerPart.slice(0, ownerTarget);
  }

  const label = `${ownerPart}-${repoPart}-${prSegment}-${shortSha}`.replace(
    /^-+|-+$/g,
    "",
  );
  if (label.length > MAX_DNS_LABEL) {
    throw new Error(`Generated label exceeds ${MAX_DNS_LABEL} chars: ${label}`);
  }
  return `${label}.${previewDomain}`;
}

export function prId(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`;
}
