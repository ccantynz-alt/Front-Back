//! Per-IP token-bucket rate limiter.
//!
//! Lock-coarse: one mutex around an ahash map. The hot path is one
//! hash + one arithmetic update — well under the cost of doing JSON +
//! HDR record work that follows.

use std::time::Instant;

use ahash::AHashMap;
use parking_lot::Mutex;

/// Token-bucket parameters.
#[derive(Debug, Clone, Copy)]
pub struct RateLimitConfig {
    /// Burst capacity (max tokens in the bucket).
    pub capacity: f64,
    /// Refill rate (tokens per second).
    pub refill_per_sec: f64,
    /// GC threshold — drop entries older than this on access.
    pub idle_gc_secs: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        // 1000 events/burst, 200/sec sustained per IP. Plenty for a
        // single-page beacon, lethal to a flood.
        Self {
            capacity: 1000.0,
            refill_per_sec: 200.0,
            idle_gc_secs: 300,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct Bucket {
    tokens: f64,
    last: Instant,
}

#[derive(Debug)]
pub struct RateLimiter {
    cfg: RateLimitConfig,
    buckets: Mutex<AHashMap<String, Bucket>>,
}

impl RateLimiter {
    pub fn new(cfg: RateLimitConfig) -> Self {
        Self {
            cfg,
            buckets: Mutex::new(AHashMap::new()),
        }
    }

    /// Try to consume `cost` tokens for `key`. Returns true if allowed.
    pub fn check(&self, key: &str, cost: f64) -> bool {
        let now = Instant::now();
        let mut map = self.buckets.lock();
        let bucket = map.entry(key.to_string()).or_insert(Bucket {
            tokens: self.cfg.capacity,
            last: now,
        });
        let elapsed = now.saturating_duration_since(bucket.last).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.cfg.refill_per_sec).min(self.cfg.capacity);
        bucket.last = now;
        if bucket.tokens >= cost {
            bucket.tokens -= cost;
            // Opportunistic GC: only when the map gets large.
            if map.len() > 4096 {
                let cutoff = self.cfg.idle_gc_secs;
                map.retain(|_, b| now.saturating_duration_since(b.last).as_secs() < cutoff);
            }
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn allows_under_capacity() {
        let rl = RateLimiter::new(RateLimitConfig {
            capacity: 5.0,
            refill_per_sec: 0.001,
            idle_gc_secs: 60,
        });
        for _ in 0..5 {
            assert!(rl.check("ip-1", 1.0));
        }
        // Sixth call should fail (no refill yet).
        assert!(!rl.check("ip-1", 1.0));
    }

    #[test]
    fn separate_keys_have_separate_budgets() {
        let rl = RateLimiter::new(RateLimitConfig {
            capacity: 1.0,
            refill_per_sec: 0.001,
            idle_gc_secs: 60,
        });
        assert!(rl.check("ip-a", 1.0));
        assert!(rl.check("ip-b", 1.0));
        assert!(!rl.check("ip-a", 1.0));
    }

    #[test]
    fn refills_over_time() {
        let rl = RateLimiter::new(RateLimitConfig {
            capacity: 1.0,
            refill_per_sec: 1000.0,
            idle_gc_secs: 60,
        });
        assert!(rl.check("ip-1", 1.0));
        assert!(!rl.check("ip-1", 1.0));
        sleep(Duration::from_millis(10));
        assert!(rl.check("ip-1", 1.0));
    }
}
