//! Binary entrypoint. Boots the Axum admin server.
//!
//! Env vars (matches `services/waf` for drop-in replacement):
//!   - `WAF_ADMIN_TOKEN` — required bearer token for the admin API.
//!   - `PORT`            — listen port (default 8788).
//!   - `RUST_LOG`        — tracing filter (default `info`).

use std::net::SocketAddr;
use std::sync::Arc;

use tracing_subscriber::{fmt, EnvFilter};
use waf_rs::registry::{EventStore, RuleRegistry};
use waf_rs::{build_router, owasp_pack, AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let admin_token = std::env::var("WAF_ADMIN_TOKEN")
        .map_err(|_| "WAF_ADMIN_TOKEN environment variable is required")?;
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8788);

    // Pre-build the OWASP pack so the first request doesn't pay for it.
    let _ = owasp_pack();

    let state = AppState {
        registry: Arc::new(RuleRegistry::new()),
        events: Arc::new(EventStore::default()),
        admin_token: Arc::new(admin_token),
    };

    let app = build_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "waf-rs admin listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
