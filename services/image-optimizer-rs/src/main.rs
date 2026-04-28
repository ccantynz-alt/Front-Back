//! image-optimizer-rs binary entry point.
//!
//! Env vars:
//!   - `IMAGE_OPTIMIZER_BIND`           default `0.0.0.0:8787`
//!   - `IMAGE_OPTIMIZER_SOURCE_ALLOWLIST` comma-separated host list. Use
//!     `.example.com` for wildcard subdomains. Required in production.

use std::sync::Arc;

use image_optimizer_rs::server::{router, AppState};
use image_optimizer_rs::source::{SourceAllowlist, SourceFetcher};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let bind = std::env::var("IMAGE_OPTIMIZER_BIND").unwrap_or_else(|_| "0.0.0.0:8787".into());
    let allowlist_raw = std::env::var("IMAGE_OPTIMIZER_SOURCE_ALLOWLIST").unwrap_or_default();
    let allowlist = SourceAllowlist::from_env_value(&allowlist_raw);
    let fetcher = Arc::new(SourceFetcher::new(allowlist));

    let app = router(AppState { fetcher });

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(target: "image_optimizer_rs", %bind, "listening");
    axum::serve(listener, app).await?;
    Ok(())
}
