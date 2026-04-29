//! Axum HTTP server matching the TypeScript WAF admin API surface.
//!
//! Routes (mirrors `services/waf/src/admin.ts`):
//!   - `GET    /healthz`
//!   - `GET    /admin/tenants/:tenantId/rules`
//!   - `POST   /admin/tenants/:tenantId/rules`
//!   - `DELETE /admin/tenants/:tenantId/rules/:ruleId`
//!   - `GET    /admin/tenants/:tenantId/events?since=<ms>&limit=<n>`
//!
//! Auth: bearer token in `Authorization: Bearer <token>`. Token is required —
//! same posture as the TS service. Engine evaluation lives elsewhere; this
//! server is the rule CRUD + audit log surface.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::registry::{EventStore, RuleRegistry};
use crate::rules::{NewRule, Rule};

/// Shared state injected into every handler.
#[derive(Clone)]
pub struct AppState {
    pub registry: Arc<RuleRegistry>,
    pub events: Arc<EventStore>,
    pub admin_token: Arc<String>,
}

/// Build the router. Caller wires the listener.
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route(
            "/admin/tenants/:tenant_id/rules",
            get(list_rules).post(create_rule),
        )
        .route(
            "/admin/tenants/:tenant_id/rules/:rule_id",
            delete(delete_rule),
        )
        .route("/admin/tenants/:tenant_id/events", get(list_events))
        .with_state(state)
}

#[allow(clippy::unused_async)]
async fn healthz() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "service": "waf-rs" }))
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
}

#[derive(Serialize)]
struct ListRulesBody {
    rules: Vec<Rule>,
}

#[derive(Serialize)]
struct RuleBody {
    rule: Rule,
}

#[derive(Serialize)]
struct DeletedBody {
    deleted: bool,
}

#[derive(Serialize)]
struct EventsBody {
    events: Vec<crate::rules::Event>,
}

fn check_auth(headers: &HeaderMap, expected: &str) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let header = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let want = format!("Bearer {expected}");
    if header == want {
        Ok(())
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorBody {
                error: "unauthorized",
            }),
        ))
    }
}

#[allow(clippy::unused_async)]
async fn list_rules(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ListRulesBody>, (StatusCode, Json<ErrorBody>)> {
    check_auth(&headers, state.admin_token.as_str())?;
    Ok(Json(ListRulesBody {
        rules: state.registry.list(&tenant_id),
    }))
}

#[allow(clippy::unused_async)]
async fn create_rule(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<(StatusCode, Json<RuleBody>), (StatusCode, Json<ErrorBody>)> {
    check_auth(&headers, state.admin_token.as_str())?;
    let parsed: NewRule = serde_json::from_slice(&body).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: "invalid rule",
            }),
        )
    })?;
    let now = current_millis();
    let id = parsed.id.clone().unwrap_or_else(|| default_id(now));
    let rule = parsed.into_rule(tenant_id, id, now);
    state.registry.upsert(rule.clone());
    Ok((StatusCode::CREATED, Json(RuleBody { rule })))
}

#[allow(clippy::unused_async)]
async fn delete_rule(
    State(state): State<AppState>,
    Path((tenant_id, rule_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<DeletedBody>, (StatusCode, Json<ErrorBody>)> {
    check_auth(&headers, state.admin_token.as_str())?;
    if state.registry.delete(&tenant_id, &rule_id) {
        Ok(Json(DeletedBody { deleted: true }))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorBody { error: "not found" }),
        ))
    }
}

#[derive(Deserialize)]
struct EventsQuery {
    #[serde(default)]
    since: Option<i64>,
    #[serde(default)]
    limit: Option<usize>,
}

#[allow(clippy::unused_async)]
async fn list_events(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
    Query(q): Query<EventsQuery>,
    headers: HeaderMap,
) -> Result<Json<EventsBody>, (StatusCode, Json<ErrorBody>)> {
    check_auth(&headers, state.admin_token.as_str())?;
    let since = q.since.unwrap_or(0);
    if since < 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: "invalid since",
            }),
        ));
    }
    let limit = q.limit.unwrap_or(500);
    if !(1..=10_000).contains(&limit) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorBody {
                error: "invalid limit",
            }),
        ));
    }
    Ok(Json(EventsBody {
        events: state.events.recent(&tenant_id, since, limit),
    }))
}

fn current_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn default_id(now: i64) -> String {
    // Lightweight pseudo-random suffix without pulling in a crypto-rng — admin
    // routes are auth-gated and the id is replaced by `parsed.id` when callers
    // care about determinism.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("rule_{:x}_{:x}", now, nanos)
}
