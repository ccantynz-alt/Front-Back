//! Crontech image-optimizer-rs
//!
//! Rust v1 port of the TS `services/image-optimizer/` service. Same HTTP
//! query-param API, same cache-key derivation, same allowlist model — only
//! materially faster. The TS service uses sharp; this crate uses the
//! pure-Rust `image` crate (with the `webp` crate for WebP encoding) so the
//! binary is statically linkable without libvips/native deps. A `libvips`
//! feature flag is reserved for v2 if a customer requires it.
//!
//! Public modules are kept intentionally small so embedders can pull only
//! what they need (e.g. `params` is useful to share with admin tooling).

#![forbid(unsafe_code)]

pub mod error;
pub mod negotiation;
pub mod params;
pub mod source;
pub mod transform;

pub mod server;

pub use error::{Error, Result};
pub use negotiation::{negotiate_format, OutputFormat};
pub use params::{cache_key, Fit, TransformParams};
pub use source::{SourceAllowlist, SourceFetcher};
pub use transform::{apply_transforms, TransformOutput};
