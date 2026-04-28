//! Integration tests covering admin CRUD over the real Axum router and a
//! handful of full pipeline scenarios. The router is exercised via
//! `tower::ServiceExt::oneshot` so no real socket is bound.

use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;

use waf_rs::rate_limit::RateLimiter;
use waf_rs::registry::{EventStore, RuleRegistry};
use waf_rs::rules::RateLimitAlgorithm;
use waf_rs::{
    build_router, owasp_pack, AppState, Decision, Engine, EngineOptions, HttpMethod,
    RateLimitConfig, RateLimitScope, Reason, RequestContext, Rule,
};

fn admin_state() -> AppState {
    AppState {
        registry: Arc::new(RuleRegistry::new()),
        events: Arc::new(EventStore::default()),
        admin_token: Arc::new("test-token".to_string()),
    }
}

async fn body_json(b: Body) -> Value {
    let bytes = to_bytes(b, 1024 * 1024).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn healthz_is_open() {
    let app = build_router(admin_state());
    let res = app
        .oneshot(Request::get("/healthz").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn admin_requires_auth() {
    let app = build_router(admin_state());
    let res = app
        .oneshot(
            Request::get("/admin/tenants/t1/rules")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn admin_create_list_delete_cycle() {
    let app = build_router(admin_state());
    // create
    let body = json!({
        "id": "rule_a",
        "pattern": "^/admin",
        "deny": true,
        "priority": 50
    });
    let res = app
        .clone()
        .oneshot(
            Request::post("/admin/tenants/t1/rules")
                .header("authorization", "Bearer test-token")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let v = body_json(res.into_body()).await;
    assert_eq!(v["rule"]["id"], "rule_a");

    // list
    let res = app
        .clone()
        .oneshot(
            Request::get("/admin/tenants/t1/rules")
                .header("authorization", "Bearer test-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let v = body_json(res.into_body()).await;
    assert_eq!(v["rules"].as_array().unwrap().len(), 1);

    // delete
    let res = app
        .clone()
        .oneshot(
            Request::delete("/admin/tenants/t1/rules/rule_a")
                .header("authorization", "Bearer test-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // delete again → 404
    let res = app
        .oneshot(
            Request::delete("/admin/tenants/t1/rules/rule_a")
                .header("authorization", "Bearer test-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn admin_rejects_invalid_body() {
    let app = build_router(admin_state());
    let res = app
        .oneshot(
            Request::post("/admin/tenants/t1/rules")
                .header("authorization", "Bearer test-token")
                .header("content-type", "application/json")
                .body(Body::from("not-json"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[test]
fn full_pipeline_owasp_then_rate_limit() {
    let registry = Arc::new(RuleRegistry::new());
    registry.upsert(Rule {
        id: "rl1".into(),
        tenant_id: "t1".into(),
        description: None,
        pattern: "^/api".into(),
        methods: vec![HttpMethod::Any],
        allow: None,
        deny: None,
        rate_limit: Some(RateLimitConfig {
            limit: 2,
            window_ms: 60_000,
            scope: RateLimitScope::Ip,
            algorithm: RateLimitAlgorithm::TokenBucket,
        }),
        require_auth: None,
        priority: 100,
        ip_allowlist: None,
        ip_denylist: None,
        body_deny_patterns: None,
        created_at: 0,
    });

    let engine = Engine::new(
        registry,
        Arc::new(RateLimiter::new()),
        owasp_pack(),
        EngineOptions::default(),
    );

    let mk = |path: &'static str, ip: &'static str, ua: &'static str| RequestContext {
        tenant_id: "t1",
        method: HttpMethod::Get,
        pathname: path,
        ip,
        user_agent: ua,
        authenticated: false,
        body: None,
        query: "",
        now: 0,
    };

    // SQLi must beat the rate limiter.
    let mut sqli = mk("/api/users", "1.1.1.1", "");
    sqli.query = "?id=' OR 1=1 --";
    let o = engine.evaluate(&sqli);
    assert_eq!(o.decision, Decision::Deny);
    assert_eq!(o.reason, Reason::OwaspSqli);

    // Two clean requests pass.
    for _ in 0..2 {
        let o = engine.evaluate(&mk("/api/x", "2.2.2.2", ""));
        assert_eq!(o.decision, Decision::Allow);
    }
    // Third trips the bucket.
    let o = engine.evaluate(&mk("/api/x", "2.2.2.2", ""));
    assert_eq!(o.decision, Decision::RateLimited);
    assert_eq!(o.reason, Reason::RateLimit);
    assert!(o.retry_after.unwrap_or(0) >= 1);
}
