//! Time-series bucket aggregation.
//!
//! Each tenant keeps a fixed-size ring of buckets (one per minute by
//! default). Every event is folded into the bucket whose start ≤ ts <
//! end. Rolling over is O(1) — we drop the oldest bucket and reuse its
//! slot.

use std::collections::HashMap;

use crate::percentile::PercentileSketch;

/// One time-series bucket: counts plus one sketch per metric name.
#[derive(Debug)]
pub struct Bucket {
    /// Bucket start (ms since epoch, aligned to interval).
    pub start_ms: u64,
    /// Number of events folded in.
    pub count: u64,
    /// Per-metric sketches (LCP, FCP, INP, CLS, TTFB, FID).
    pub metrics: HashMap<&'static str, PercentileSketch>,
}

impl Bucket {
    pub fn new(start_ms: u64) -> Self {
        Self {
            start_ms,
            count: 0,
            metrics: HashMap::new(),
        }
    }

    pub fn record(&mut self, metric: &'static str, value_ms: f64) {
        self.metrics.entry(metric).or_default().record_ms(value_ms);
    }

    pub fn inc_count(&mut self) {
        self.count += 1;
    }
}

/// Fixed-capacity ring of buckets. Oldest bucket is overwritten when
/// the ring is full. Bucket index = `(ts - origin) / interval_ms %
/// capacity`, which makes both writes and lookups O(1).
#[derive(Debug)]
pub struct TimeSeries {
    interval_ms: u64,
    capacity: usize,
    buckets: Vec<Option<Bucket>>,
}

impl TimeSeries {
    pub fn new(interval_ms: u64, capacity: usize) -> Self {
        assert!(interval_ms > 0, "interval must be positive");
        assert!(capacity > 0, "capacity must be positive");
        let mut buckets = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            buckets.push(None);
        }
        Self {
            interval_ms,
            capacity,
            buckets,
        }
    }

    fn align(&self, ts_ms: u64) -> u64 {
        ts_ms - (ts_ms % self.interval_ms)
    }

    fn slot_index(&self, start_ms: u64) -> usize {
        // start_ms / interval_ms easily fits in usize on every platform we
        // ship (64-bit). On a 32-bit target the truncation would still
        // hash correctly — `% capacity` keeps it bounded.
        #[allow(clippy::cast_possible_truncation)]
        let bucket_no = (start_ms / self.interval_ms) as usize;
        bucket_no % self.capacity
    }

    /// Get (or create) the bucket containing `ts_ms`. If a bucket from
    /// a previous wrap occupies the slot, it is evicted.
    pub fn bucket_mut(&mut self, ts_ms: u64) -> &mut Bucket {
        let start = self.align(ts_ms);
        let idx = self.slot_index(start);
        let needs_replace = matches!(&self.buckets[idx], Some(b) if b.start_ms != start);
        if needs_replace || self.buckets[idx].is_none() {
            self.buckets[idx] = Some(Bucket::new(start));
        }
        self.buckets[idx].as_mut().expect("just inserted")
    }

    /// Snapshot of all live buckets, ordered oldest → newest.
    pub fn snapshot(&self) -> Vec<&Bucket> {
        let mut out: Vec<&Bucket> = self.buckets.iter().filter_map(|b| b.as_ref()).collect();
        out.sort_by_key(|b| b.start_ms);
        out
    }

    pub fn interval_ms(&self) -> u64 {
        self.interval_ms
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_alignment_groups_close_events() {
        let mut ts = TimeSeries::new(60_000, 60);
        // Two events whose timestamps share the same aligned minute →
        // same bucket. We pick a base aligned to 60s and offset within.
        let base = 1_700_000_040_000u64; // 1700000040000 / 60000 = 28333334 exactly
        ts.bucket_mut(base + 1_000).inc_count();
        ts.bucket_mut(base + 59_999).inc_count();
        let snap = ts.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].count, 2);
    }

    #[test]
    fn bucket_alignment_separates_distinct_minutes() {
        let mut ts = TimeSeries::new(60_000, 60);
        ts.bucket_mut(1_700_000_000_000).inc_count();
        ts.bucket_mut(1_700_000_120_000).inc_count();
        let snap = ts.snapshot();
        assert_eq!(snap.len(), 2);
    }

    #[test]
    fn ring_evicts_oldest_when_wrapping() {
        let mut ts = TimeSeries::new(60_000, 3);
        // capacity 3 → 4 distinct minutes will evict the oldest.
        for m in 0..4u64 {
            ts.bucket_mut(m * 60_000).inc_count();
        }
        let snap = ts.snapshot();
        assert_eq!(snap.len(), 3, "only 3 buckets retained");
        // Oldest visible should be minute 1, not minute 0.
        assert_eq!(snap[0].start_ms, 60_000);
    }

    #[test]
    fn records_metric_into_correct_bucket() {
        let mut ts = TimeSeries::new(60_000, 10);
        ts.bucket_mut(1_700_000_000_000).record("LCP", 1234.0);
        ts.bucket_mut(1_700_000_000_500).record("LCP", 1300.0);
        let snap = ts.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].metrics["LCP"].count(), 2);
    }
}
