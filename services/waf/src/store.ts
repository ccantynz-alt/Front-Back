/**
 * In-memory rule + event store.
 *
 * v1 is intentionally in-memory so the WAF can run as a sidecar in tests and
 * preview deploys without external dependencies. v2 will move to Turso so
 * rules persist across worker restarts (see README "Roadmap"). The interface
 * below is the migration boundary — keep it stable.
 */
import type { Event, Rule } from "./types";

export interface RuleStore {
  list(tenantId: string): Rule[];
  get(tenantId: string, ruleId: string): Rule | undefined;
  upsert(rule: Rule): Rule;
  delete(tenantId: string, ruleId: string): boolean;
}

export interface EventStore {
  append(event: Event): void;
  recent(tenantId: string, sinceTs: number, limit?: number): Event[];
}

export class InMemoryRuleStore implements RuleStore {
  private readonly rules = new Map<string, Rule>(); // key = `${tenantId}:${ruleId}`

  private k(tenantId: string, ruleId: string): string {
    return `${tenantId}:${ruleId}`;
  }

  list(tenantId: string): Rule[] {
    const out: Rule[] = [];
    for (const r of this.rules.values()) {
      if (r.tenantId === tenantId) out.push(r);
    }
    out.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    return out;
  }

  get(tenantId: string, ruleId: string): Rule | undefined {
    return this.rules.get(this.k(tenantId, ruleId));
  }

  upsert(rule: Rule): Rule {
    this.rules.set(this.k(rule.tenantId, rule.id), rule);
    return rule;
  }

  delete(tenantId: string, ruleId: string): boolean {
    return this.rules.delete(this.k(tenantId, ruleId));
  }
}

export class InMemoryEventStore implements EventStore {
  private readonly events: Event[] = [];
  private readonly cap: number;

  constructor(cap = 10_000) {
    this.cap = cap;
  }

  append(event: Event): void {
    this.events.push(event);
    if (this.events.length > this.cap) {
      this.events.splice(0, this.events.length - this.cap);
    }
  }

  recent(tenantId: string, sinceTs: number, limit = 500): Event[] {
    const out: Event[] = [];
    // Walk newest -> oldest so limit truncates the tail.
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (!e) continue;
      if (e.tenantId !== tenantId) continue;
      if (e.ts < sinceTs) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out.reverse();
  }
}
