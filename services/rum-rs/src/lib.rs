//! Crontech RUM collector — Rust core.
//!
//! See [`server`] for the Axum router and [`store`] for the in-memory
//! per-tenant ingest store. Percentile math lives in [`percentile`] and
//! is backed by [`hdrhistogram`] for sub-microsecond P50/P75/P95/P99
//! computation across millions of events.
//!
//! API parity with the TS `services/rum/` reference is intentional —
//! the JS beacon does not need to change.

#![deny(rust_2018_idioms)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::module_name_repetitions,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]

pub mod percentile;
pub mod rate_limit;
pub mod schema;
pub mod server;
pub mod store;
pub mod timeseries;

pub use server::{build_router, AppState, ServerConfig};
pub use store::{IngestStore, StoreConfig};
