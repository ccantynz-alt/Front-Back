//! Exponential backoff with full-jitter (AWS pattern).
//!
//! Mirrors `services/tunnel/origin/src/backoff.ts`: 1s base, 60s ceiling,
//! double on every retry, then sample uniformly in `[0, capped]`.

use rand::Rng;
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
pub struct BackoffConfig {
    pub base_ms: u64,
    pub ceiling_ms: u64,
    pub multiplier: u32,
}

impl Default for BackoffConfig {
    fn default() -> Self {
        Self {
            base_ms: 1_000,
            ceiling_ms: 60_000,
            multiplier: 2,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Backoff {
    cfg: BackoffConfig,
    attempt: u32,
}

impl Backoff {
    pub fn new(cfg: BackoffConfig) -> Self {
        Self { cfg, attempt: 0 }
    }

    pub fn reset(&mut self) {
        self.attempt = 0;
    }

    /// Compute the cap (deterministic, no jitter) — useful for tests.
    pub fn cap_ms(&self) -> u64 {
        let pow = (self.cfg.multiplier as u64).saturating_pow(self.attempt);
        self.cfg
            .base_ms
            .saturating_mul(pow)
            .min(self.cfg.ceiling_ms)
    }

    /// Pull the next sleep duration. Increments the attempt counter.
    pub fn next_delay(&mut self) -> Duration {
        let cap = self.cap_ms();
        self.attempt = self.attempt.saturating_add(1);
        let jittered = if cap == 0 {
            0
        } else {
            rand::thread_rng().gen_range(0..=cap)
        };
        Duration::from_millis(jittered)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cap_doubles_then_clamps_to_ceiling() {
        let cfg = BackoffConfig {
            base_ms: 1_000,
            ceiling_ms: 60_000,
            multiplier: 2,
        };
        let mut b = Backoff::new(cfg);
        let caps: Vec<u64> = (0..8)
            .map(|_| {
                let c = b.cap_ms();
                let _ = b.next_delay();
                c
            })
            .collect();
        // 1000, 2000, 4000, 8000, 16000, 32000, 60000 (clamped), 60000
        assert_eq!(caps[0], 1_000);
        assert_eq!(caps[1], 2_000);
        assert_eq!(caps[2], 4_000);
        assert_eq!(caps[3], 8_000);
        assert_eq!(caps[4], 16_000);
        assert_eq!(caps[5], 32_000);
        assert_eq!(caps[6], 60_000);
        assert_eq!(caps[7], 60_000);
    }

    #[test]
    fn jitter_within_bounds() {
        let mut b = Backoff::new(BackoffConfig::default());
        for _ in 0..1_000 {
            let cap_before = b.cap_ms();
            let d = b.next_delay();
            assert!(d.as_millis() as u64 <= cap_before);
        }
    }

    #[test]
    fn reset_returns_to_base() {
        let mut b = Backoff::new(BackoffConfig::default());
        for _ in 0..5 {
            let _ = b.next_delay();
        }
        b.reset();
        assert_eq!(b.cap_ms(), 1_000);
    }
}
