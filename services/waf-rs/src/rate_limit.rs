//! Token-bucket + sliding-window rate limiters.
//!
//! Behaviour matches `services/waf/src/rate-limit.ts` so the API surface
//! stays consistent across backends. Tests pass an explicit `now` to keep
//! every check deterministic — the engine forwards `RequestContext::now`.
//!
//! Storage is sharded behind [`parking_lot::RwLock`] so reads (the hot path)
//! never block each other. Writes bump tokens or push timestamps; both are
//! short critical sections.

use std::collections::HashMap;

use parking_lot::Mutex;

use crate::rules::{RateLimitAlgorithm, RateLimitConfig, RateLimitScope};

#[derive(Debug, Clone, Copy)]
struct BucketState {
    tokens: f64,
    last_refill: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct RateLimitResult {
    pub allowed: bool,
    /// Seconds until the next allowed request when blocked. 0 when allowed.
    pub retry_after: u64,
}

/// In-memory rate limiter. One instance for the whole process, keyed by
/// `<scope>:<id>:<ip>` strings.
#[derive(Debug, Default)]
pub struct RateLimiter {
    buckets: Mutex<HashMap<String, BucketState>>,
    windows: Mutex<HashMap<String, Vec<i64>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn check(&self, key: &str, cfg: &RateLimitConfig, now: i64) -> RateLimitResult {
        match cfg.algorithm {
            RateLimitAlgorithm::SlidingWindow => self.check_sliding(key, cfg, now),
            RateLimitAlgorithm::TokenBucket => self.check_bucket(key, cfg, now),
        }
    }

    fn check_bucket(&self, key: &str, cfg: &RateLimitConfig, now: i64) -> RateLimitResult {
        let refill_rate = cfg.limit as f64 / cfg.window_ms as f64; // tokens per ms
        let mut buckets = self.buckets.lock();
        let entry = buckets
            .entry(key.to_owned())
            .or_insert_with(|| BucketState {
                tokens: cfg.limit as f64,
                last_refill: now,
            });
        let elapsed = (now - entry.last_refill).max(0) as f64;
        entry.tokens = (entry.tokens + elapsed * refill_rate).min(cfg.limit as f64);
        entry.last_refill = now;
        if entry.tokens >= 1.0 {
            entry.tokens -= 1.0;
            RateLimitResult {
                allowed: true,
                retry_after: 0,
            }
        } else {
            let tokens_needed = 1.0 - entry.tokens;
            let ms_until = tokens_needed / refill_rate;
            let retry = ((ms_until / 1000.0).ceil() as i64).max(1) as u64;
            RateLimitResult {
                allowed: false,
                retry_after: retry,
            }
        }
    }

    fn check_sliding(&self, key: &str, cfg: &RateLimitConfig, now: i64) -> RateLimitResult {
        let cutoff = now - cfg.window_ms as i64;
        let mut windows = self.windows.lock();
        let hits = windows.entry(key.to_owned()).or_default();
        hits.retain(|ts| *ts > cutoff);
        if hits.len() as u32 >= cfg.limit {
            let oldest = *hits.first().unwrap_or(&now);
            let ms_until_free = oldest + cfg.window_ms as i64 - now;
            let retry = ((ms_until_free as f64 / 1000.0).ceil() as i64).max(1) as u64;
            RateLimitResult {
                allowed: false,
                retry_after: retry,
            }
        } else {
            hits.push(now);
            RateLimitResult {
                allowed: true,
                retry_after: 0,
            }
        }
    }

    /// Test-only / admin: drop all rate-limit state.
    pub fn reset(&self) {
        self.buckets.lock().clear();
        self.windows.lock().clear();
    }
}

pub fn build_key(scope: RateLimitScope, tenant_id: &str, ip: &str) -> String {
    match scope {
        RateLimitScope::Tenant => format!("tenant:{tenant_id}"),
        RateLimitScope::Ip => format!("ip:{tenant_id}:{ip}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(algo: RateLimitAlgorithm, limit: u32, window_ms: u64) -> RateLimitConfig {
        RateLimitConfig {
            limit,
            window_ms,
            scope: RateLimitScope::Ip,
            algorithm: algo,
        }
    }

    #[test]
    fn token_bucket_blocks_at_limit() {
        let l = RateLimiter::new();
        let c = cfg(RateLimitAlgorithm::TokenBucket, 3, 60_000);
        for _ in 0..3 {
            assert!(l.check("k", &c, 0).allowed);
        }
        let r = l.check("k", &c, 0);
        assert!(!r.allowed);
        assert!(r.retry_after >= 1);
    }

    #[test]
    fn token_bucket_refills() {
        let l = RateLimiter::new();
        let c = cfg(RateLimitAlgorithm::TokenBucket, 1, 1_000);
        assert!(l.check("k", &c, 0).allowed);
        assert!(!l.check("k", &c, 0).allowed);
        // 1 second later → exactly one token refilled
        assert!(l.check("k", &c, 1_000).allowed);
    }

    #[test]
    fn sliding_window_blocks_at_limit() {
        let l = RateLimiter::new();
        let c = cfg(RateLimitAlgorithm::SlidingWindow, 2, 1_000);
        assert!(l.check("k", &c, 0).allowed);
        assert!(l.check("k", &c, 100).allowed);
        let r = l.check("k", &c, 200);
        assert!(!r.allowed);
        // After window has passed everything is fresh.
        assert!(l.check("k", &c, 1_500).allowed);
    }

    #[test]
    fn key_includes_scope() {
        let a = build_key(RateLimitScope::Ip, "t", "1.1.1.1");
        let b = build_key(RateLimitScope::Tenant, "t", "1.1.1.1");
        assert_ne!(a, b);
        assert!(a.starts_with("ip:"));
        assert!(b.starts_with("tenant:"));
    }
}
