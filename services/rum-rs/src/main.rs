//! `rum-rs` binary — boots the Axum server.
//!
//! Env vars:
//!
//! | Var                   | Default     | Meaning                              |
//! | --------------------- | ----------- | ------------------------------------ |
//! | `RUM_ADDR`            | `0.0.0.0`   | Bind address                          |
//! | `RUM_PORT`            | `8787`      | Bind port                             |
//! | `RUM_BUCKET_INTERVAL` | `60000`     | Time-series bucket size (ms)          |
//! | `RUM_BUCKET_CAPACITY` | `1440`      | Buckets retained per tenant           |
//! | `RUM_MAX_BODY_BYTES`  | `1048576`   | Max decoded body size                 |
//! | `RUM_RL_CAPACITY`     | `1000`      | Rate-limit burst                      |
//! | `RUM_RL_REFILL`       | `200`       | Rate-limit tokens/sec sustained       |
//! | `RUST_LOG`            | `info`      | Log level                             |

use std::net::SocketAddr;

use rum_rs::{build_router, AppState, ServerConfig};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let mut cfg = ServerConfig::default();
    if let Some(v) = env_u64("RUM_BUCKET_INTERVAL") {
        cfg.store.bucket_interval_ms = v;
    }
    if let Some(v) = env_u64("RUM_BUCKET_CAPACITY") {
        cfg.store.bucket_capacity = v as usize;
    }
    if let Some(v) = env_u64("RUM_MAX_BODY_BYTES") {
        cfg.max_body_bytes = v as usize;
    }
    if let Some(v) = env_f64("RUM_RL_CAPACITY") {
        cfg.rate_limit.capacity = v;
    }
    if let Some(v) = env_f64("RUM_RL_REFILL") {
        cfg.rate_limit.refill_per_sec = v;
    }

    let host = std::env::var("RUM_ADDR").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("RUM_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8787);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let app = build_router(AppState::new(cfg));
    tracing::info!(%addr, "rum-rs listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}

fn env_u64(name: &str) -> Option<u64> {
    std::env::var(name).ok().and_then(|s| s.parse().ok())
}

fn env_f64(name: &str) -> Option<f64> {
    std::env::var(name).ok().and_then(|s| s.parse().ok())
}
