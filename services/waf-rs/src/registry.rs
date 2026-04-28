//! In-memory rule + event registry. RwLock-protected.
//!
//! v1 mirrors the TS in-memory store — no persistence, no cross-process sync.
//! v2 will move to Turso. The public API below is the migration boundary.
//!
//! Snapshots return cloned `Arc<CompiledRule>` slices so the engine can iterate
//! without holding the read lock for the duration of evaluation.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::rules::{CompiledRule, Event, Rule};

#[derive(Default)]
pub struct RuleRegistry {
    inner: RwLock<HashMap<String, Vec<Arc<CompiledRule>>>>,
}

impl RuleRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert / replace a rule. The full tenant slice is re-sorted by
    /// `(priority asc, created_at asc)` after every mutation so the hot path
    /// can iterate without sorting.
    pub fn upsert(&self, rule: Rule) -> Arc<CompiledRule> {
        let compiled = Arc::new(CompiledRule::compile(rule));
        let tenant = compiled.rule.tenant_id.clone();
        let mut guard = self.inner.write();
        let bucket = guard.entry(tenant).or_default();
        if let Some(pos) = bucket.iter().position(|r| r.rule.id == compiled.rule.id) {
            bucket[pos] = compiled.clone();
        } else {
            bucket.push(compiled.clone());
        }
        bucket.sort_by(|a, b| {
            a.rule
                .priority
                .cmp(&b.rule.priority)
                .then_with(|| a.rule.created_at.cmp(&b.rule.created_at))
        });
        compiled
    }

    pub fn delete(&self, tenant_id: &str, rule_id: &str) -> bool {
        let mut guard = self.inner.write();
        let Some(bucket) = guard.get_mut(tenant_id) else {
            return false;
        };
        let before = bucket.len();
        bucket.retain(|r| r.rule.id != rule_id);
        before != bucket.len()
    }

    pub fn get(&self, tenant_id: &str, rule_id: &str) -> Option<Arc<CompiledRule>> {
        let guard = self.inner.read();
        guard
            .get(tenant_id)
            .and_then(|bucket| bucket.iter().find(|r| r.rule.id == rule_id))
            .cloned()
    }

    pub fn list(&self, tenant_id: &str) -> Vec<Rule> {
        let guard = self.inner.read();
        guard
            .get(tenant_id)
            .map(|bucket| bucket.iter().map(|cr| cr.rule.clone()).collect())
            .unwrap_or_default()
    }

    /// Hot-path snapshot. Returns the priority-sorted compiled view without
    /// cloning any rules — only the `Arc`s are bumped.
    pub fn snapshot(&self, tenant_id: &str) -> Vec<Arc<CompiledRule>> {
        let guard = self.inner.read();
        guard.get(tenant_id).cloned().unwrap_or_default()
    }
}

/// Rolling event log capped at `cap` entries (oldest evicted).
pub struct EventStore {
    inner: RwLock<EventInner>,
}

struct EventInner {
    events: Vec<Event>,
    cap: usize,
}

impl EventStore {
    pub fn new(cap: usize) -> Self {
        Self {
            inner: RwLock::new(EventInner {
                events: Vec::with_capacity(cap.min(10_000)),
                cap,
            }),
        }
    }

    pub fn append(&self, event: Event) {
        let mut g = self.inner.write();
        g.events.push(event);
        let cap = g.cap;
        if g.events.len() > cap {
            let drop = g.events.len() - cap;
            g.events.drain(0..drop);
        }
    }

    pub fn recent(&self, tenant_id: &str, since_ts: i64, limit: usize) -> Vec<Event> {
        let g = self.inner.read();
        let mut out = Vec::new();
        for e in g.events.iter().rev() {
            if e.tenant_id != tenant_id {
                continue;
            }
            if e.ts < since_ts {
                continue;
            }
            out.push(e.clone());
            if out.len() >= limit {
                break;
            }
        }
        out.reverse();
        out
    }
}

impl Default for EventStore {
    fn default() -> Self {
        Self::new(10_000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::HttpMethod;

    fn rule(tenant: &str, id: &str, priority: i32) -> Rule {
        Rule {
            id: id.into(),
            tenant_id: tenant.into(),
            description: None,
            pattern: "^/".into(),
            methods: vec![HttpMethod::Any],
            allow: None,
            deny: None,
            rate_limit: None,
            require_auth: None,
            priority,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        }
    }

    #[test]
    fn upsert_and_list() {
        let r = RuleRegistry::new();
        r.upsert(rule("t1", "a", 100));
        r.upsert(rule("t1", "b", 50));
        let listed = r.list("t1");
        assert_eq!(listed.len(), 2);
        // priority-sorted ascending
        assert_eq!(listed[0].id, "b");
        assert_eq!(listed[1].id, "a");
    }

    #[test]
    fn delete_removes() {
        let r = RuleRegistry::new();
        r.upsert(rule("t1", "a", 100));
        assert!(r.delete("t1", "a"));
        assert!(!r.delete("t1", "a"));
        assert!(r.list("t1").is_empty());
    }

    #[test]
    fn upsert_replaces_existing() {
        let r = RuleRegistry::new();
        r.upsert(rule("t1", "a", 100));
        r.upsert(rule("t1", "a", 10));
        let listed = r.list("t1");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].priority, 10);
    }
}
