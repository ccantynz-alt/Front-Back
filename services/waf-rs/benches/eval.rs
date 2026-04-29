//! Criterion benchmark for the per-request hot path.
//!
//! Baseline (TS reference, services/waf):
//!   ~50K eval/sec on a single core (RegExp.test in series, no SIMD).
//!
//! Target: ≥10× → ≥500K eval/sec.
//!
//! Run: `cargo bench` from `services/waf-rs/`.

use std::sync::Arc;

use criterion::{criterion_group, criterion_main, Criterion};

use waf_rs::rate_limit::RateLimiter;
use waf_rs::registry::RuleRegistry;
use waf_rs::rules::RateLimitAlgorithm;
use waf_rs::{
    owasp_pack, Engine, EngineOptions, HttpMethod, RateLimitConfig, RateLimitScope, RequestContext,
    Rule,
};

fn build_engine() -> Engine {
    let registry = Arc::new(RuleRegistry::new());
    // Ten typical rules. Mirrors what production tenants run.
    for i in 0i32..10 {
        registry.upsert(Rule {
            id: format!("r_{i}"),
            tenant_id: "bench".into(),
            description: None,
            pattern: format!("^/svc-{i}"),
            methods: vec![HttpMethod::Any],
            allow: None,
            deny: Some(false),
            rate_limit: None,
            require_auth: None,
            priority: 100 + i,
            ip_allowlist: None,
            ip_denylist: None,
            body_deny_patterns: None,
            created_at: 0,
        });
    }
    // One terminal rate-limit rule on `/api`.
    registry.upsert(Rule {
        id: "rl".into(),
        tenant_id: "bench".into(),
        description: None,
        pattern: "^/api".into(),
        methods: vec![HttpMethod::Any],
        allow: None,
        deny: None,
        rate_limit: Some(RateLimitConfig {
            limit: 1_000_000_000, // never trip during bench
            window_ms: 60_000,
            scope: RateLimitScope::Ip,
            algorithm: RateLimitAlgorithm::TokenBucket,
        }),
        require_auth: None,
        priority: 200,
        ip_allowlist: None,
        ip_denylist: None,
        body_deny_patterns: None,
        created_at: 0,
    });
    Engine::new(
        registry,
        Arc::new(RateLimiter::new()),
        owasp_pack(),
        EngineOptions::default(),
    )
}

fn bench_clean(c: &mut Criterion) {
    let engine = build_engine();
    let ctx = RequestContext {
        tenant_id: "bench",
        method: HttpMethod::Get,
        pathname: "/api/users",
        ip: "10.0.0.1",
        user_agent: "Mozilla/5.0 (X11; Linux x86_64)",
        authenticated: true,
        body: None,
        query: "?page=1&size=20",
        now: 0,
    };
    c.bench_function("evaluate_clean_request", |b| {
        b.iter(|| {
            let o = engine.evaluate(&ctx);
            criterion::black_box(o);
        });
    });
}

fn bench_owasp_hit(c: &mut Criterion) {
    let engine = build_engine();
    let ctx = RequestContext {
        tenant_id: "bench",
        method: HttpMethod::Post,
        pathname: "/api/users",
        ip: "10.0.0.1",
        user_agent: "evil-client",
        authenticated: false,
        body: None,
        query: "?id=' or 1=1 -- ",
        now: 0,
    };
    c.bench_function("evaluate_sqli_hit", |b| {
        b.iter(|| {
            let o = engine.evaluate(&ctx);
            criterion::black_box(o);
        });
    });
}

fn bench_scanner_ua(c: &mut Criterion) {
    let engine = build_engine();
    let ctx = RequestContext {
        tenant_id: "bench",
        method: HttpMethod::Get,
        pathname: "/",
        ip: "10.0.0.1",
        user_agent: "sqlmap/1.6 (https://sqlmap.org)",
        authenticated: false,
        body: None,
        query: "",
        now: 0,
    };
    c.bench_function("evaluate_scanner_ua", |b| {
        b.iter(|| {
            let o = engine.evaluate(&ctx);
            criterion::black_box(o);
        });
    });
}

criterion_group!(benches, bench_clean, bench_owasp_hit, bench_scanner_ua);
criterion_main!(benches);
