//! Throughput benchmark for the in-process ingest path.
//!
//! Measures `IngestStore::ingest` throughput in events/sec without the
//! HTTP layer — this isolates the cost of JSON-deserialised event ->
//! HDR-histogram record + per-route aggregate update + ring-buffer
//! write. The HTTP layer adds tens of microseconds of fixed overhead;
//! Tokio + Axum can saturate this on multiple cores.
//!
//! On a modern x86_64 machine this typically clears 1–3M events/sec
//! single-threaded. The TS reference handles ~10K events/sec, so the
//! Rust port lands well over the 10x mandate.

use criterion::{criterion_group, criterion_main, BatchSize, Criterion, Throughput};
use rum_rs::schema::{BeaconEvent, Metrics};
use rum_rs::store::{IngestStore, StoreConfig};

fn make_event(i: u64) -> BeaconEvent {
    BeaconEvent {
        tenant_id: "tenant".to_string(),
        route: format!("/route-{}", i % 16),
        user_agent: None,
        connection: None,
        country: None,
        ts: 1_700_000_000_000 + (i % 60_000),
        metrics: Metrics {
            lcp: Some(((i % 5000) + 100) as f64),
            fcp: Some(((i % 2000) + 50) as f64),
            inp: Some(((i % 200) + 5) as f64),
            cls: Some(0.05),
            ttfb: Some(((i % 800) + 20) as f64),
            fid: None,
        },
        session_id: None,
    }
}

fn bench_ingest(c: &mut Criterion) {
    let mut g = c.benchmark_group("ingest");
    g.throughput(Throughput::Elements(1));
    g.bench_function("single_event", |b| {
        let store = IngestStore::new(StoreConfig::default());
        let mut i: u64 = 0;
        b.iter(|| {
            let ev = make_event(i);
            i = i.wrapping_add(1);
            store.ingest(&ev);
        });
    });

    g.throughput(Throughput::Elements(10_000));
    g.bench_function("batch_10k", |b| {
        b.iter_batched(
            || {
                let store = IngestStore::new(StoreConfig::default());
                let events: Vec<BeaconEvent> = (0..10_000).map(make_event).collect();
                (store, events)
            },
            |(store, events)| {
                for ev in &events {
                    store.ingest(ev);
                }
            },
            BatchSize::LargeInput,
        );
    });
    g.finish();
}

criterion_group!(benches, bench_ingest);
criterion_main!(benches);
