//! Percentile estimation backed by HDR histograms.
//!
//! We use [`hdrhistogram`] because it gives us:
//!
//! - O(1) record cost (no per-event allocation)
//! - Configurable precision (we use 3 sig figs — < 0.1 % error)
//! - Mergeable across threads / shards (additive)
//! - Sub-microsecond `value_at_quantile` lookups
//!
//! Values are stored in **microseconds** so we can model 0.001 ms — 600 s
//! with three significant figures. The public API takes/returns
//! milliseconds (matching the JS beacon) and converts internally.

use hdrhistogram::Histogram;

const MAX_MICROS_F: f64 = 600.0 * 1_000_000.0;

/// HDR-histogram wrapper for one (route, metric) bucket.
#[derive(Debug)]
pub struct PercentileSketch {
    hist: Histogram<u64>,
    count: u64,
    min_ms: f64,
    max_ms: f64,
    sum_ms: f64,
}

impl Default for PercentileSketch {
    fn default() -> Self {
        Self::new()
    }
}

impl PercentileSketch {
    /// 1µs — 10 minutes, 3 sig figs (~< 0.1% error).
    pub fn new() -> Self {
        Self {
            hist: Histogram::<u64>::new_with_bounds(1, 600 * 1_000_000, 3)
                .expect("valid histogram bounds"),
            count: 0,
            min_ms: f64::INFINITY,
            max_ms: f64::NEG_INFINITY,
            sum_ms: 0.0,
        }
    }

    /// Record a sample in milliseconds. Negative or non-finite values
    /// are dropped silently — corrupt beacon data should not poison
    /// the sketch.
    pub fn record_ms(&mut self, value_ms: f64) {
        if !value_ms.is_finite() || value_ms < 0.0 {
            return;
        }
        // Bounded above by `MAX_MICROS_F`; non-negative; rounded — the cast is
        // saturating-safe in practice. Clippy's pedantic warnings don't apply.
        let scaled = (value_ms * 1000.0).round().clamp(1.0, MAX_MICROS_F);
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let micros = scaled as u64;
        let micros = micros.clamp(1, 600 * 1_000_000);
        // record_correct never fails for in-range values.
        if self.hist.record(micros).is_ok() {
            self.count += 1;
            self.min_ms = self.min_ms.min(value_ms);
            self.max_ms = self.max_ms.max(value_ms);
            self.sum_ms += value_ms;
        }
    }

    pub fn count(&self) -> u64 {
        self.count
    }

    pub fn quantile_ms(&self, q: f64) -> f64 {
        if self.count == 0 {
            return 0.0;
        }
        let q = q.clamp(0.0, 1.0);
        // Histogram values are bounded ≤ 6e8 (well within f64 mantissa range).
        #[allow(clippy::cast_precision_loss)]
        let v = self.hist.value_at_quantile(q) as f64;
        v / 1000.0
    }

    pub fn p50(&self) -> f64 {
        self.quantile_ms(0.50)
    }
    pub fn p75(&self) -> f64 {
        self.quantile_ms(0.75)
    }
    pub fn p95(&self) -> f64 {
        self.quantile_ms(0.95)
    }
    pub fn p99(&self) -> f64 {
        self.quantile_ms(0.99)
    }

    pub fn mean_ms(&self) -> f64 {
        if self.count == 0 {
            0.0
        } else {
            // Counts in practice fit in 2^53; precision loss is acceptable.
            #[allow(clippy::cast_precision_loss)]
            let n = self.count as f64;
            self.sum_ms / n
        }
    }

    pub fn min_ms(&self) -> f64 {
        if self.count == 0 {
            0.0
        } else {
            self.min_ms
        }
    }

    pub fn max_ms(&self) -> f64 {
        if self.count == 0 {
            0.0
        } else {
            self.max_ms
        }
    }

    /// Merge another sketch into this one in-place.
    pub fn merge(&mut self, other: &Self) {
        self.hist.add(&other.hist).expect("hdrhistogram add");
        self.count += other.count;
        self.min_ms = self.min_ms.min(other.min_ms);
        self.max_ms = self.max_ms.max(other.max_ms);
        self.sum_ms += other.sum_ms;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reference: numpy.percentile([1..=100], q, interpolation='lower') equals q.
    /// HDR-histogram gives the bucket containing the q-th rank, so for
    /// integers 1..=100 it lands within ±1 of the linear-interpolation answer.
    #[test]
    fn percentiles_uniform_1_to_100() {
        let mut s = PercentileSketch::new();
        for v in 1..=100 {
            s.record_ms(f64::from(v));
        }
        // numpy reference values (default linear interp):
        //   p50=50.5, p75=75.25, p95=95.05, p99=99.01
        // HDR returns the upper edge of the bucket containing the rank,
        // so we expect the answers in [target-1, target+2].
        let p50 = s.p50();
        let p75 = s.p75();
        let p95 = s.p95();
        let p99 = s.p99();
        assert!((49.0..=52.0).contains(&p50), "p50={p50}");
        assert!((74.0..=77.0).contains(&p75), "p75={p75}");
        assert!((94.0..=97.0).contains(&p95), "p95={p95}");
        assert!((98.0..=100.0).contains(&p99), "p99={p99}");
        assert_eq!(s.count(), 100);
    }

    /// HDR error guarantee: with 3 sig figs, the answer is within 0.1% of
    /// the true quantile. We verify on a 10k-sample dataset where every
    /// value is 1234ms.
    #[test]
    fn percentiles_constant_dataset() {
        let mut s = PercentileSketch::new();
        for _ in 0..10_000 {
            s.record_ms(1234.0);
        }
        // All quantiles should be ~1234 ms within 0.1%.
        for q in [0.5, 0.75, 0.95, 0.99] {
            let v = s.quantile_ms(q);
            let err = (v - 1234.0).abs() / 1234.0;
            assert!(err < 0.001, "q={q} v={v} err={err}");
        }
    }

    #[test]
    fn percentiles_long_tail() {
        let mut s = PercentileSketch::new();
        for _ in 0..99 {
            s.record_ms(100.0);
        }
        s.record_ms(10_000.0);
        // P50, P75, P95 should all be ~100; P99 should pick up the tail.
        assert!((s.p50() - 100.0).abs() < 1.0);
        assert!((s.p75() - 100.0).abs() < 1.0);
        assert!((s.p95() - 100.0).abs() < 1.0);
        assert!(s.p99() >= 100.0);
    }

    #[test]
    fn rejects_corrupt_values() {
        let mut s = PercentileSketch::new();
        s.record_ms(f64::NAN);
        s.record_ms(f64::INFINITY);
        s.record_ms(-1.0);
        assert_eq!(s.count(), 0);
    }

    #[test]
    fn merge_preserves_total_count() {
        let mut a = PercentileSketch::new();
        let mut b = PercentileSketch::new();
        for v in 1..=50 {
            a.record_ms(f64::from(v));
        }
        for v in 51..=100 {
            b.record_ms(f64::from(v));
        }
        a.merge(&b);
        assert_eq!(a.count(), 100);
        let p99 = a.p99();
        assert!((98.0..=100.0).contains(&p99), "merged p99={p99}");
    }

    #[test]
    fn empty_sketch_is_zero() {
        let s = PercentileSketch::new();
        assert_eq!(s.count(), 0);
        assert!((s.p50() - 0.0).abs() < f64::EPSILON);
        assert!((s.mean_ms() - 0.0).abs() < f64::EPSILON);
    }
}
