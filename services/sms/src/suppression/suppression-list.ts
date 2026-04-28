/**
 * Per-tenant suppression list. Once a recipient is suppressed for a
 * tenant, every subsequent send to that number is rejected — this is
 * the legal backbone of STOP-keyword handling under TCPA / 10DLC.
 */
export class SuppressionList {
  private readonly suppressed = new Map<string, Set<string>>();

  add(tenantId: string, e164: string, reason = "STOP"): void {
    let set = this.suppressed.get(tenantId);
    if (!set) {
      set = new Set();
      this.suppressed.set(tenantId, set);
    }
    set.add(`${e164}|${reason}`);
    set.add(e164); // canonical lookup key
  }

  isSuppressed(tenantId: string, e164: string): boolean {
    const set = this.suppressed.get(tenantId);
    if (!set) return false;
    return set.has(e164);
  }

  remove(tenantId: string, e164: string): boolean {
    const set = this.suppressed.get(tenantId);
    if (!set) return false;
    const removed = set.delete(e164);
    for (const key of [...set]) {
      if (key.startsWith(`${e164}|`)) set.delete(key);
    }
    return removed;
  }

  list(tenantId: string): string[] {
    const set = this.suppressed.get(tenantId);
    if (!set) return [];
    const out: string[] = [];
    for (const key of set) {
      if (!key.includes("|")) out.push(key);
    }
    return out;
  }
}

/**
 * Detect inbound STOP / UNSUBSCRIBE keywords. Returns the matched
 * keyword (uppercased) or null. Whitespace and punctuation are
 * tolerated — carriers are inconsistent about trimming.
 */
export function detectStopKeyword(body: string): string | null {
  const normalised = body
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (normalised.length === 0) return null;
  const keywords = new Set([
    "STOP",
    "STOPALL",
    "UNSUBSCRIBE",
    "CANCEL",
    "END",
    "QUIT",
    "REVOKE",
    "OPTOUT",
  ]);
  if (keywords.has(normalised)) return normalised;
  return null;
}
