//! Edge-side tunnel data plane. The edge runs **two** listeners:
//!
//! * **Control port** — origin daemons handshake here over WebSocket.
//!   The first frame is `advertise`, signed via [`crate::protocol::verify_tunnel_token`].
//! * **Public port** — public HTTP traffic. The edge looks up the tunnel
//!   by `Host` header and forwards the request through the tunnel.
//!
//! See `services/tunnel/edge/` for the canonical TS reference.

pub mod registry;

pub use registry::{EdgeRegistry, ForwardError, RegistryEntry, TunnelHandle};
