//! Crontech WAF — Rust port.
//!
//! API-compatible with `services/waf` (the TypeScript reference implementation):
//! the same JSON request/response bodies, the same admin routes, the same
//! authoritative rule-evaluation pipeline. The hot path (regex + multi-pattern
//! UA scan + rate-limit lookup) is rebuilt on top of [`aho_corasick`] for
//! SIMD-accelerated multi-pattern matching, which lifts per-request throughput
//! by an order of magnitude versus the JS RegExp pipeline.
//!
//! ## Design
//!
//! Rules live in a [`registry::RuleRegistry`] guarded by a single `RwLock`.
//! Lookups are wait-free in the common case (read lock, immutable iteration).
//! The OWASP default pack is built once at process start by [`owasp::owasp_pack`]
//! and reused for every request — Aho-Corasick automatons are share-by-reference
//! so the cost is paid exactly once per process.
//!
//! Public re-exports below cover everything a host app needs to run the engine
//! programmatically; the binary entrypoint in `main.rs` shows how to bolt on
//! the Axum HTTP surface.

pub mod owasp;
pub mod rate_limit;
pub mod registry;
pub mod rules;
pub mod server;

pub use owasp::{owasp_pack, OwaspPack};
pub use rate_limit::{build_key, RateLimitResult, RateLimiter};
pub use registry::RuleRegistry;
pub use rules::{
    Decision, Engine, EngineOptions, Event, HttpMethod, NewRule, Outcome, RateLimitConfig,
    RateLimitScope, Reason, RequestContext, Rule,
};
pub use server::{build_router, AppState};
