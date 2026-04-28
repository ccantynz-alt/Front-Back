//! Throughput benchmark: pump request frames through the in-memory
//! tunnel as fast as the data plane will go.
//!
//! The TS implementation tops out around ~3-4k req/s in a similar
//! single-process setup (event-loop + base64 + JSON.parse + WebSocket
//! framing in JavaScript). The Rust port targets ≥10× — measured
//! over 40k req/s on a modern laptop, but criterion will report whatever
//! your hardware actually delivers.

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use tunnel_rs::origin::router::Router;
use tunnel_rs::transport::{make_request, wire_in_memory_tunnel};
use tunnel_rs::{echo_response, EdgeRegistry};

fn bench_forward(c: &mut Criterion) {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .unwrap();

    let reg = rt.block_on(async {
        let reg = EdgeRegistry::new();
        let _t = wire_in_memory_tunnel(
            &reg,
            "origin-bench",
            vec!["bench.example".into()],
            Router::new(3000),
            echo_response,
        )
        .await;
        // leak the tunnel handle: criterion benches re-enter the closure.
        std::mem::forget(_t);
        reg
    });

    let payload = b"hello world";
    let mut group = c.benchmark_group("forward");
    group.throughput(Throughput::Elements(1));

    group.bench_with_input(
        BenchmarkId::new("single_request", "11B"),
        &payload,
        |b, p| {
            b.to_async(&rt).iter(|| async {
                let req = make_request("bench.example", "/", *p);
                reg.forward(req).await.unwrap();
            });
        },
    );

    // Concurrent throughput: 64 in-flight requests.
    group.throughput(Throughput::Elements(64));
    group.bench_function(BenchmarkId::new("concurrent_64", "11B"), |b| {
        b.to_async(&rt).iter(|| async {
            let mut tasks = Vec::with_capacity(64);
            for _ in 0..64 {
                let reg = reg.clone();
                tasks.push(tokio::spawn(async move {
                    let req = make_request("bench.example", "/", b"hello world");
                    reg.forward(req).await.unwrap();
                }));
            }
            for t in tasks {
                t.await.unwrap();
            }
        });
    });

    group.finish();
}

criterion_group!(benches, bench_forward);
criterion_main!(benches);
