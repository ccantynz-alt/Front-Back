//! Axum server: `/rum/v1/collect`, `/rum/v1/stats`, `/rum/v1/timeseries`.
//!
//! API parity with the TS reference is intentional. The JS beacon does
//! not need to change. Gzip-encoded bodies are decoded transparently.

use std::io::Read;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use flate2::read::GzDecoder;
use serde::Deserialize;
use tower_http::cors::{Any, CorsLayer};
use tracing::{debug, warn};

use crate::rate_limit::{RateLimitConfig, RateLimiter};
use crate::schema::BeaconPayload;
use crate::store::{IngestStore, StatsSnapshot, StoreConfig, TimeSeriesSnapshot};

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub store: StoreConfig,
    pub rate_limit: RateLimitConfig,
    /// Maximum decoded body size (bytes). Default 1 MiB.
    pub max_body_bytes: usize,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            store: StoreConfig::default(),
            rate_limit: RateLimitConfig::default(),
            max_body_bytes: 1 << 20,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub store: IngestStore,
    pub rate_limiter: Arc<RateLimiter>,
    pub cfg: ServerConfig,
}

impl AppState {
    pub fn new(cfg: ServerConfig) -> Self {
        Self {
            store: IngestStore::new(cfg.store),
            rate_limiter: Arc::new(RateLimiter::new(cfg.rate_limit)),
            cfg,
        }
    }
}

/// Build the public Axum router. Permissive CORS — RUM beacons fire
/// from arbitrary origins.
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/healthz", get(healthz))
        .route("/rum/v1/collect", post(collect))
        .route("/rum/v1/stats", get(stats))
        .route("/rum/v1/timeseries", get(timeseries))
        .with_state(state)
        .layer(cors)
}

async fn healthz() -> &'static str {
    "ok"
}

#[derive(Debug, Deserialize)]
pub struct TenantQuery {
    pub tenant_id: String,
}

async fn stats(
    State(s): State<AppState>,
    Query(q): Query<TenantQuery>,
) -> Result<Json<StatsSnapshot>, ApiError> {
    s.store
        .stats_snapshot(&q.tenant_id)
        .map(Json)
        .ok_or(ApiError::NotFound)
}

async fn timeseries(
    State(s): State<AppState>,
    Query(q): Query<TenantQuery>,
) -> Result<Json<TimeSeriesSnapshot>, ApiError> {
    s.store
        .timeseries_snapshot(&q.tenant_id)
        .map(Json)
        .ok_or(ApiError::NotFound)
}

async fn collect(
    State(s): State<AppState>,
    connect: Option<ConnectInfo<SocketAddr>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<CollectResponse>, ApiError> {
    let fallback: SocketAddr = "0.0.0.0:0".parse().expect("valid socket addr");
    let addr = connect.map_or(fallback, |c| c.0);
    let ip = client_ip(&headers, addr);
    if !s.rate_limiter.check(&ip, 1.0) {
        return Err(ApiError::RateLimited);
    }

    if body.len() > s.cfg.max_body_bytes {
        return Err(ApiError::PayloadTooLarge);
    }

    // Gzip-aware decode.
    let bytes = if is_gzip(&headers) {
        decode_gzip(&body, s.cfg.max_body_bytes).map_err(|_| ApiError::BadRequest)?
    } else {
        body.to_vec()
    };

    if bytes.len() > s.cfg.max_body_bytes {
        return Err(ApiError::PayloadTooLarge);
    }

    let payload: BeaconPayload = serde_json::from_slice(&bytes).map_err(|e| {
        debug!(error = %e, "rejecting malformed beacon payload");
        ApiError::BadRequest
    })?;

    let mut accepted: u64 = 0;
    for ev in payload.into_events() {
        s.store.ingest(&ev);
        accepted += 1;
    }

    Ok(Json(CollectResponse { accepted }))
}

fn is_gzip(headers: &HeaderMap) -> bool {
    headers
        .get("content-encoding")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("gzip"))
}

fn decode_gzip(body: &[u8], max: usize) -> Result<Vec<u8>, std::io::Error> {
    let mut d = GzDecoder::new(body);
    let mut out = Vec::with_capacity(body.len() * 4);
    let mut buf = [0u8; 8192];
    loop {
        let n = d.read(&mut buf)?;
        if n == 0 {
            break;
        }
        if out.len() + n > max {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "decoded body too large",
            ));
        }
        out.extend_from_slice(&buf[..n]);
    }
    Ok(out)
}

fn client_ip(headers: &HeaderMap, fallback: SocketAddr) -> String {
    if let Some(v) = headers
        .get("cf-connecting-ip")
        .and_then(|v| v.to_str().ok())
    {
        return v.to_string();
    }
    if let Some(v) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = v.split(',').next() {
            return first.trim().to_string();
        }
    }
    fallback.ip().to_string()
}

#[derive(Debug, serde::Serialize)]
pub struct CollectResponse {
    pub accepted: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("not found")]
    NotFound,
    #[error("bad request")]
    BadRequest,
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("rate limited")]
    RateLimited,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (code, msg) = match self {
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            Self::BadRequest => (StatusCode::BAD_REQUEST, "bad_request"),
            Self::PayloadTooLarge => (StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large"),
            Self::RateLimited => {
                warn!("rate limited");
                (StatusCode::TOO_MANY_REQUESTS, "rate_limited")
            }
        };
        (code, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}
