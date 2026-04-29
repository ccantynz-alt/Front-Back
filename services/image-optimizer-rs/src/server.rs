//! Axum HTTP layer.
//!
//! Exposes:
//!   - `GET  /healthz`        — liveness
//!   - `GET  /readyz`         — readiness
//!   - `GET  /v1/image`       — transform endpoint, query-param driven
//!
//! The transform endpoint is the same surface as the TS service so a customer
//! can flip `IMAGE_OPTIMIZER_BACKEND=rust` and observe the speedup with no
//! client changes.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;

use crate::error::{Error, Result};
use crate::negotiation::negotiate_format;
use crate::params::{cache_key, TransformParams};
use crate::source::SourceFetcher;
use crate::transform::apply_transforms;

#[derive(Clone)]
pub struct AppState {
    pub fetcher: Arc<SourceFetcher>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/v1/image", get(handle_transform))
        .with_state(state)
}

async fn healthz() -> &'static str {
    "ok"
}

async fn readyz() -> &'static str {
    "ready"
}

#[derive(Debug, Deserialize)]
struct RawQuery {
    #[serde(flatten)]
    raw: std::collections::BTreeMap<String, String>,
}

async fn handle_transform(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(raw): Query<RawQuery>,
) -> Result<Response> {
    let qs = serialize_query(&raw.raw);
    let params = TransformParams::from_query(&qs)?;

    let accept = headers.get(header::ACCEPT).and_then(|v| v.to_str().ok());
    let output = negotiate_format(params.format, accept);

    let bytes = state.fetcher.fetch(&params.source).await?;
    let out = apply_transforms(&bytes, &params, output)?;

    let key = cache_key(&params, output);

    let resp = Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            HeaderValue::from_static(output.mime()),
        )
        .header("x-cache-key", HeaderValue::from_str(&key).unwrap())
        .header("x-image-width", HeaderValue::from(out.width))
        .header("x-image-height", HeaderValue::from(out.height))
        .header("x-backend", HeaderValue::from_static("image-optimizer-rs"))
        .header(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        )
        .body(Body::from(out.bytes))
        .map_err(|e| Error::Encode(format!("response build: {e}")))?;
    Ok(resp)
}

fn serialize_query(map: &std::collections::BTreeMap<String, String>) -> String {
    let mut out = String::new();
    for (k, v) in map {
        if !out.is_empty() {
            out.push('&');
        }
        out.push_str(k);
        out.push('=');
        out.push_str(v);
    }
    out
}

impl IntoResponse for crate::transform::TransformOutput {
    fn into_response(self) -> Response {
        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, self.format.mime())
            .body(Body::from(self.bytes))
            .unwrap()
    }
}
