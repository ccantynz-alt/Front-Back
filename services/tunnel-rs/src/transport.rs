//! Transport abstractions.
//!
//! In production the tunnel rides a `tokio_tungstenite::WebSocketStream`,
//! but the data-plane forwarding logic is transport-agnostic. We expose
//! an [`InMemoryTransport`] for benchmarks and end-to-end integration
//! tests so every test doesn't need to bind a TCP port.

use crate::edge::EdgeRegistry;
use crate::origin::router::Router;
use crate::protocol::{Frame, RequestFrame, ResponseFrame};
use std::collections::BTreeMap;
use tokio::sync::mpsc;

/// Spawn the origin-side forwarding loop bound to an in-memory channel.
///
/// `responder` is a synchronous function that fakes the local upstream
/// server (e.g. [`crate::echo_response`]). Returns a sender into which
/// the edge can push request frames; responses come back via the
/// returned receiver.
pub fn spawn_origin_loop(
    router: Router,
    mut inbound: mpsc::Receiver<Frame>,
    outbound: mpsc::Sender<Frame>,
    responder: impl Fn(&RequestFrame, &Router) -> ResponseFrame + Send + Sync + 'static,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(frame) = inbound.recv().await {
            if let Frame::Request(req) = frame {
                let resp = responder(&req, &router);
                if outbound.send(Frame::Response(resp)).await.is_err() {
                    break;
                }
            }
            // ignore other frame types — production code handles ping/pong/shutdown,
            // but the data-plane benchmark only cares about request/response.
        }
    })
}

/// End-to-end in-memory tunnel: register an origin in the [`EdgeRegistry`]
/// and wire it up to a fake upstream. Returns a closure that drives a
/// background task forwarding `Response` frames back into the registry's
/// pending map.
pub async fn wire_in_memory_tunnel(
    reg: &EdgeRegistry,
    origin_id: &str,
    hostnames: Vec<String>,
    router: Router,
    responder: impl Fn(&RequestFrame, &Router) -> ResponseFrame + Send + Sync + 'static,
) -> InMemoryTunnel {
    // outbound: registry → origin (request frames)
    let (edge_to_origin_tx, edge_to_origin_rx) = mpsc::channel::<Frame>(1024);
    // returnpath: origin → registry (response frames)
    let (origin_to_edge_tx, mut origin_to_edge_rx) = mpsc::channel::<Frame>(1024);

    let tunnel_id = reg.next_tunnel_id();
    let handle = reg
        .register(
            origin_id.to_string(),
            tunnel_id,
            hostnames,
            edge_to_origin_tx,
        )
        .await;

    let origin_task = spawn_origin_loop(router, edge_to_origin_rx, origin_to_edge_tx, responder);

    // Pump origin → edge: deliver responses to the pending map.
    let dispatch_handle = handle.clone();
    let dispatch_task = tokio::spawn(async move {
        while let Some(frame) = origin_to_edge_rx.recv().await {
            if let Frame::Response(resp) = frame {
                dispatch_handle.deliver_response(resp).await;
            }
        }
    });

    InMemoryTunnel {
        tunnel_id,
        _origin_task: origin_task,
        _dispatch_task: dispatch_task,
    }
}

pub struct InMemoryTunnel {
    pub tunnel_id: u64,
    _origin_task: tokio::task::JoinHandle<()>,
    _dispatch_task: tokio::task::JoinHandle<()>,
}

/// Build a small request frame for a hostname/path pair.
pub fn make_request(hostname: &str, path: &str, body: &[u8]) -> RequestFrame {
    use crate::protocol::{body_to_base64, generate_request_id};
    let mut headers = BTreeMap::new();
    headers.insert("host".into(), hostname.into());
    RequestFrame {
        id: generate_request_id(),
        hostname: hostname.into(),
        method: "GET".into(),
        url: path.into(),
        headers,
        body: body_to_base64(body),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::echo_response;

    #[tokio::test]
    async fn end_to_end_in_memory() {
        let reg = EdgeRegistry::new();
        let router = Router::new(3000);
        let _t = wire_in_memory_tunnel(
            &reg,
            "origin-test",
            vec!["test.example".into()],
            router,
            echo_response,
        )
        .await;

        let req = make_request("test.example", "/", b"hello");
        let resp = reg.forward(req).await.unwrap();
        assert_eq!(resp.status, 200);
        assert_eq!(
            crate::protocol::body_from_base64(&resp.body).unwrap(),
            b"hello"
        );
    }
}
