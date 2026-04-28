//! Per-tenant in-memory ingest store.
//!
//! Layout:
//!
//! ```text
//! IngestStore
//!   └── tenants: HashMap<tenant_id, RwLock<Tenant>>
//!         └── routes: HashMap<route, RouteAggregate>
//!         └── timeseries: TimeSeries  (per tenant, all routes)
//! ```
//!
//! Reads (`/stats`, `/timeseries`) take read locks; writes (`/collect`)
//! take write locks per-tenant. Different tenants never contend.

use std::sync::Arc;

use ahash::AHashMap;
use parking_lot::RwLock;

use crate::percentile::PercentileSketch;
use crate::schema::BeaconEvent;
use crate::timeseries::{Bucket, TimeSeries};

#[derive(Debug, Clone, Copy)]
pub struct StoreConfig {
    /// Time-series bucket interval (ms). Default 60s.
    pub bucket_interval_ms: u64,
    /// Number of buckets retained per tenant. Default 1440 (24h at 60s).
    pub bucket_capacity: usize,
}

impl Default for StoreConfig {
    fn default() -> Self {
        Self {
            bucket_interval_ms: 60_000,
            bucket_capacity: 1440,
        }
    }
}

#[derive(Debug, Default)]
pub struct RouteAggregate {
    pub count: u64,
    pub metrics: AHashMap<&'static str, PercentileSketch>,
}

impl RouteAggregate {
    fn record(&mut self, metric: &'static str, value_ms: f64) {
        self.metrics.entry(metric).or_default().record_ms(value_ms);
    }
}

#[derive(Debug)]
pub struct Tenant {
    pub routes: AHashMap<String, RouteAggregate>,
    pub timeseries: TimeSeries,
    pub total_events: u64,
}

impl Tenant {
    fn new(cfg: StoreConfig) -> Self {
        Self {
            routes: AHashMap::new(),
            timeseries: TimeSeries::new(cfg.bucket_interval_ms, cfg.bucket_capacity),
            total_events: 0,
        }
    }
}

/// Top-level store. Cheap to clone (Arc-internal).
#[derive(Debug, Clone)]
pub struct IngestStore {
    cfg: StoreConfig,
    tenants: Arc<RwLock<AHashMap<String, Arc<RwLock<Tenant>>>>>,
}

impl IngestStore {
    pub fn new(cfg: StoreConfig) -> Self {
        Self {
            cfg,
            tenants: Arc::new(RwLock::new(AHashMap::new())),
        }
    }

    fn tenant_handle(&self, tenant_id: &str) -> Arc<RwLock<Tenant>> {
        // Fast path: read lock.
        if let Some(t) = self.tenants.read().get(tenant_id) {
            return Arc::clone(t);
        }
        // Slow path: insert under write lock.
        let mut w = self.tenants.write();
        Arc::clone(
            w.entry(tenant_id.to_string())
                .or_insert_with(|| Arc::new(RwLock::new(Tenant::new(self.cfg)))),
        )
    }

    /// Ingest a single event.
    pub fn ingest(&self, ev: &BeaconEvent) {
        let t = self.tenant_handle(&ev.tenant_id);
        let mut w = t.write();
        w.total_events += 1;

        // Per-route aggregate.
        let route_entry = w.routes.entry(ev.route.clone()).or_default();
        route_entry.count += 1;
        for (name, val) in ev.metrics.present() {
            route_entry.record(name, val);
        }

        // Time series bucket.
        let bucket = w.timeseries.bucket_mut(ev.ts);
        bucket.inc_count();
        for (name, val) in ev.metrics.present() {
            bucket.record(name, val);
        }
    }

    /// Snapshot of stats for `/stats` endpoint.
    pub fn stats_snapshot(&self, tenant_id: &str) -> Option<StatsSnapshot> {
        let t = self.tenants.read().get(tenant_id).cloned()?;
        let r = t.read();
        let mut routes = Vec::with_capacity(r.routes.len());
        for (route, agg) in &r.routes {
            let mut metrics = Vec::with_capacity(agg.metrics.len());
            for (name, sk) in &agg.metrics {
                metrics.push(MetricSnapshot {
                    name: (*name).to_string(),
                    count: sk.count(),
                    p50: sk.p50(),
                    p75: sk.p75(),
                    p95: sk.p95(),
                    p99: sk.p99(),
                    mean: sk.mean_ms(),
                    min: sk.min_ms(),
                    max: sk.max_ms(),
                });
            }
            metrics.sort_by(|a, b| a.name.cmp(&b.name));
            routes.push(RouteSnapshot {
                route: route.clone(),
                count: agg.count,
                metrics,
            });
        }
        routes.sort_by(|a, b| a.route.cmp(&b.route));
        Some(StatsSnapshot {
            tenant_id: tenant_id.to_string(),
            total_events: r.total_events,
            routes,
        })
    }

    /// Snapshot of time-series for `/timeseries` endpoint.
    pub fn timeseries_snapshot(&self, tenant_id: &str) -> Option<TimeSeriesSnapshot> {
        let t = self.tenants.read().get(tenant_id).cloned()?;
        let r = t.read();
        let buckets: Vec<BucketSnapshot> = r
            .timeseries
            .snapshot()
            .into_iter()
            .map(bucket_to_snapshot)
            .collect();
        Some(TimeSeriesSnapshot {
            tenant_id: tenant_id.to_string(),
            interval_ms: r.timeseries.interval_ms(),
            buckets,
        })
    }
}

fn bucket_to_snapshot(b: &Bucket) -> BucketSnapshot {
    let mut metrics = Vec::with_capacity(b.metrics.len());
    for (name, sk) in &b.metrics {
        metrics.push(MetricSnapshot {
            name: (*name).to_string(),
            count: sk.count(),
            p50: sk.p50(),
            p75: sk.p75(),
            p95: sk.p95(),
            p99: sk.p99(),
            mean: sk.mean_ms(),
            min: sk.min_ms(),
            max: sk.max_ms(),
        });
    }
    metrics.sort_by(|a, b| a.name.cmp(&b.name));
    BucketSnapshot {
        start_ms: b.start_ms,
        count: b.count,
        metrics,
    }
}

// ----- Snapshot DTOs (serialisable) -----

#[derive(Debug, serde::Serialize)]
pub struct MetricSnapshot {
    pub name: String,
    pub count: u64,
    pub p50: f64,
    pub p75: f64,
    pub p95: f64,
    pub p99: f64,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct RouteSnapshot {
    pub route: String,
    pub count: u64,
    pub metrics: Vec<MetricSnapshot>,
}

#[derive(Debug, serde::Serialize)]
pub struct StatsSnapshot {
    pub tenant_id: String,
    pub total_events: u64,
    pub routes: Vec<RouteSnapshot>,
}

#[derive(Debug, serde::Serialize)]
pub struct BucketSnapshot {
    pub start_ms: u64,
    pub count: u64,
    pub metrics: Vec<MetricSnapshot>,
}

#[derive(Debug, serde::Serialize)]
pub struct TimeSeriesSnapshot {
    pub tenant_id: String,
    pub interval_ms: u64,
    pub buckets: Vec<BucketSnapshot>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::Metrics;

    fn ev(tenant: &str, route: &str, ts: u64, lcp: f64) -> BeaconEvent {
        BeaconEvent {
            tenant_id: tenant.to_string(),
            route: route.to_string(),
            user_agent: None,
            connection: None,
            country: None,
            ts,
            metrics: Metrics {
                lcp: Some(lcp),
                ..Default::default()
            },
            session_id: None,
        }
    }

    #[test]
    fn isolates_tenants() {
        let s = IngestStore::new(StoreConfig::default());
        s.ingest(&ev("t1", "/a", 1_700_000_000_000, 100.0));
        s.ingest(&ev("t2", "/a", 1_700_000_000_000, 200.0));
        assert_eq!(s.stats_snapshot("t1").unwrap().total_events, 1);
        assert_eq!(s.stats_snapshot("t2").unwrap().total_events, 1);
    }

    #[test]
    fn aggregates_per_route_per_metric() {
        let s = IngestStore::new(StoreConfig::default());
        for v in 1..=100 {
            s.ingest(&ev("t", "/home", 1_700_000_000_000, f64::from(v)));
        }
        let snap = s.stats_snapshot("t").unwrap();
        assert_eq!(snap.total_events, 100);
        assert_eq!(snap.routes.len(), 1);
        let route = &snap.routes[0];
        assert_eq!(route.route, "/home");
        let lcp = route
            .metrics
            .iter()
            .find(|m| m.name == "LCP")
            .expect("LCP present");
        assert_eq!(lcp.count, 100);
        assert!((49.0..=52.0).contains(&lcp.p50));
    }

    #[test]
    fn timeseries_buckets_separate_minutes() {
        let s = IngestStore::new(StoreConfig::default());
        s.ingest(&ev("t", "/a", 1_700_000_000_000, 100.0));
        s.ingest(&ev("t", "/a", 1_700_000_120_000, 200.0));
        let snap = s.timeseries_snapshot("t").unwrap();
        assert_eq!(snap.buckets.len(), 2);
    }

    #[test]
    fn unknown_tenant_returns_none() {
        let s = IngestStore::new(StoreConfig::default());
        assert!(s.stats_snapshot("nope").is_none());
        assert!(s.timeseries_snapshot("nope").is_none());
    }
}
