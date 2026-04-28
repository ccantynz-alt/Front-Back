//! Origin-side tunnel data plane. The origin daemon dials the edge
//! over WSS, presents a signed token via `advertise`, and from then on
//! services `request` frames by forwarding them to the local upstream
//! HTTP server (typically `127.0.0.1:3000`).
//!
//! See `services/tunnel/origin/` for the canonical TS reference.

pub mod backoff;
pub mod router;

pub use backoff::{Backoff, BackoffConfig};
pub use router::{Route, Router};
