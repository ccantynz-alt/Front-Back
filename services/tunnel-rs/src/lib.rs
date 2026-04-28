//! Crontech reverse-tunnel data plane (Rust port).
//!
//! Wire-compatible with `services/tunnel/` (TS, BLK-019). Customers can
//! flip `TUNNEL_BACKEND=rust` to run the high-throughput Tokio + tungstenite
//! version while leaving the protocol identical byte-for-byte.

pub mod edge;
pub mod origin;
pub mod protocol;
pub mod transport;

pub use edge::{EdgeRegistry, ForwardError, RegistryEntry, TunnelHandle};
pub use origin::{Backoff, BackoffConfig, Route, Router};
pub use protocol::{
    body_from_base64, body_to_base64, decode_frame, encode_frame, generate_nonce,
    generate_request_id, sign_tunnel_token, verify_tunnel_token, AdvertiseFrame, AuthError, Frame,
    FrameDecoder, FrameError, PingFrame, PongFrame, RequestFrame, ResponseFrame, ShutdownFrame,
    TunnelClaims, VerifyOptions, MAX_FRAME_BYTES, PROTOCOL_VERSION,
};

/// Build a synthetic upstream-server response from a `RequestFrame`.
/// Used by the in-memory transport and integration tests as a "pretend
/// the upstream is a real HTTP server" sink.
///
/// Real production code on the origin side opens a TCP socket to
/// `127.0.0.1:<port>` and forwards the request bytes. For unit-testing
/// the data-plane forwarding loop we substitute this pure function so
/// tests don't depend on a running upstream.
pub fn echo_response(req: &RequestFrame, _router: &Router) -> ResponseFrame {
    use std::collections::BTreeMap;
    let mut headers = BTreeMap::new();
    headers.insert("x-tunnel-rs".into(), "v1".into());
    headers.insert("x-method".into(), req.method.clone());
    let body = body_from_base64(&req.body).unwrap_or_default();
    ResponseFrame {
        id: req.id.clone(),
        status: 200,
        headers,
        body: body_to_base64(&body),
    }
}
