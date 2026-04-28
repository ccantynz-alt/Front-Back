//! Integration tests for the Axum router.
//!
//! Exercise: gzip ingest, plain ingest, stats shape, time-series shape,
//! rate-limit trip, CORS preflight, malformed JSON rejection.

use std::io::Write;

use axum::body::{to_bytes, Body};
use axum::http::{header, Method, Request, StatusCode};
use flate2::write::GzEncoder;
use flate2::Compression;
use rum_rs::rate_limit::RateLimitConfig;
use rum_rs::{build_router, server::ServerConfig, AppState};
use tower::ServiceExt; // for `oneshot`

fn make_state(cfg: ServerConfig) -> AppState {
    AppState::new(cfg)
}

fn make_app() -> (axum::Router, AppState) {
    let state = make_state(ServerConfig::default());
    (build_router(state.clone()), state)
}

fn beacon_json(tenant: &str, route: &str, lcp: f64) -> String {
    format!(
        r#"{{"tenantId":"{tenant}","route":"{route}","ts":1700000000000,"metrics":{{"LCP":{lcp}}}}}"#
    )
}

#[tokio::test]
async fn collect_plain_json_then_stats() {
    let (app, _state) = make_app();
    // Ingest 3 events.
    for lcp in [100.0, 200.0, 300.0] {
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/rum/v1/collect")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(beacon_json("t1", "/home", lcp)))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
    // Stats reflects 3 events.
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/rum/v1/stats?tenant_id=t1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["total_events"], 3);
}

#[tokio::test]
async fn collect_gzipped_json() {
    let (app, _state) = make_app();
    let raw = beacon_json("t1", "/g", 555.0);
    let mut enc = GzEncoder::new(Vec::new(), Compression::default());
    enc.write_all(raw.as_bytes()).unwrap();
    let gz = enc.finish().unwrap();
    let res = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/rum/v1/collect")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::CONTENT_ENCODING, "gzip")
                .body(Body::from(gz))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn collect_batch() {
    let (app, _state) = make_app();
    let body = r#"{"events":[
        {"tenantId":"t","route":"/x","ts":1,"metrics":{"LCP":10}},
        {"tenantId":"t","route":"/y","ts":2,"metrics":{"LCP":20}}
    ]}"#;
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/rum/v1/collect")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["accepted"], 2);
}

#[tokio::test]
async fn malformed_json_rejected() {
    let (app, _state) = make_app();
    let res = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/rum/v1/collect")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("not json {"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn unknown_tenant_404() {
    let (app, _state) = make_app();
    let res = app
        .oneshot(
            Request::builder()
                .uri("/rum/v1/stats?tenant_id=ghost")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn rate_limit_trips() {
    let cfg = ServerConfig {
        rate_limit: RateLimitConfig {
            capacity: 2.0,
            refill_per_sec: 0.0001,
            idle_gc_secs: 60,
        },
        ..Default::default()
    };
    let app = build_router(AppState::new(cfg));
    // First 2 should pass, third should 429.
    let mut statuses = vec![];
    for _ in 0..3 {
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/rum/v1/collect")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(beacon_json("t", "/rl", 1.0)))
                    .unwrap(),
            )
            .await
            .unwrap();
        statuses.push(res.status());
    }
    assert_eq!(statuses[0], StatusCode::OK);
    assert_eq!(statuses[1], StatusCode::OK);
    assert_eq!(statuses[2], StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn cors_preflight_allows_any() {
    let (app, _state) = make_app();
    let res = app
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/rum/v1/collect")
                .header("origin", "https://example.com")
                .header("access-control-request-method", "POST")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    // tower-http cors returns 200 for permissive preflight.
    assert!(res.status().is_success() || res.status().as_u16() == 204);
}

#[tokio::test]
async fn timeseries_endpoint_returns_buckets() {
    let (app, _state) = make_app();
    // Two events in different minutes.
    let body = r#"{"events":[
        {"tenantId":"t","route":"/x","ts":1700000000000,"metrics":{"LCP":10}},
        {"tenantId":"t","route":"/x","ts":1700000060000,"metrics":{"LCP":20}}
    ]}"#;
    app.clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/rum/v1/collect")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    let res = app
        .oneshot(
            Request::builder()
                .uri("/rum/v1/timeseries?tenant_id=t")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["buckets"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn payload_too_large_rejected() {
    let cfg = ServerConfig {
        max_body_bytes: 50,
        ..Default::default()
    };
    let app = build_router(AppState::new(cfg));
    let big = "x".repeat(1000);
    let res = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/rum/v1/collect")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(big))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::PAYLOAD_TOO_LARGE);
}
