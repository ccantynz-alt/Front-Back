//! Edge daemon binary. Accepts origin handshakes on the control port
//! and serves public HTTP traffic on the public port.
//!
//! See `services/tunnel/edge/src/index.ts` for the canonical TS reference.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Host, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{any, get};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use std::collections::BTreeMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use tunnel_rs::protocol::{
    decode_frame, encode_frame, verify_tunnel_token, Frame, RequestFrame, VerifyOptions,
};
use tunnel_rs::{body_from_base64, body_to_base64, generate_request_id, EdgeRegistry};

#[derive(Clone)]
struct AppState {
    registry: EdgeRegistry,
    secret: Arc<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let secret = env::var("TUNNEL_SHARED_SECRET")
        .map_err(|_| anyhow::anyhow!("TUNNEL_SHARED_SECRET is required"))?;
    let control_port: u16 = env::var("TUNNEL_EDGE_CONTROL_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9094);
    let public_port: u16 = env::var("TUNNEL_EDGE_PUBLIC_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9095);
    let bind: String = env::var("TUNNEL_EDGE_HOSTNAME").unwrap_or_else(|_| "0.0.0.0".into());

    let state = AppState {
        registry: EdgeRegistry::new(),
        secret: Arc::new(secret),
    };

    let control_app = Router::new()
        .route("/tunnel", get(tunnel_handshake))
        .route("/healthz", get(|| async { "ok" }))
        .with_state(state.clone());
    let public_app = Router::new()
        .fallback(any(public_proxy))
        .with_state(state.clone());

    let control_addr: SocketAddr = format!("{bind}:{control_port}").parse()?;
    let public_addr: SocketAddr = format!("{bind}:{public_port}").parse()?;
    info!(addr=%control_addr, "edge control listener");
    info!(addr=%public_addr, "edge public listener");

    let control = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(control_addr).await?;
        axum::serve(listener, control_app).await?;
        Ok::<_, anyhow::Error>(())
    });
    let public = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(public_addr).await?;
        axum::serve(listener, public_app).await?;
        Ok::<_, anyhow::Error>(())
    });

    let _ = tokio::try_join!(control, public)?;
    Ok(())
}

async fn tunnel_handshake(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_tunnel(socket, state))
}

async fn handle_tunnel(socket: WebSocket, state: AppState) {
    let (mut sink, mut stream) = socket.split();
    // First frame must be `advertise` with valid signed token.
    let first = match stream.next().await {
        Some(Ok(Message::Binary(b))) => b,
        _ => {
            warn!("first frame not binary or stream closed");
            return;
        }
    };
    let frame = match decode_frame(&first) {
        Ok(f) => f,
        Err(e) => {
            error!("first frame decode failed: {e}");
            return;
        }
    };
    let advertise = match frame {
        Frame::Advertise(a) => a,
        other => {
            error!("expected advertise, got {other:?}");
            return;
        }
    };
    let claims = match verify_tunnel_token(&advertise.id, &state.secret, VerifyOptions::default()) {
        Ok(c) => c,
        Err(e) => {
            error!("token verification failed: {e}");
            return;
        }
    };
    // Hostname intersection: only register hostnames the claims authorise.
    let claimed: std::collections::HashSet<&String> = claims.hostnames.iter().collect();
    let approved: Vec<String> = advertise
        .hostnames
        .iter()
        .filter(|h| claimed.contains(*h))
        .cloned()
        .collect();
    if approved.is_empty() {
        warn!("advertise had no claim-approved hostnames");
        return;
    }

    let (out_tx, mut out_rx) = mpsc::channel::<Frame>(1024);
    let tunnel_id = state.registry.next_tunnel_id();
    let handle = state
        .registry
        .register(claims.id.clone(), tunnel_id, approved.clone(), out_tx)
        .await;

    info!(origin=%claims.id, hosts=?approved, "tunnel registered");

    // Outbound: edge → origin
    let outbound_task = tokio::spawn(async move {
        while let Some(frame) = out_rx.recv().await {
            let bytes = match encode_frame(&frame) {
                Ok(b) => b,
                Err(e) => {
                    error!("encode failed: {e}");
                    continue;
                }
            };
            if sink.send(Message::Binary(bytes)).await.is_err() {
                break;
            }
        }
    });

    // Inbound: origin → edge
    while let Some(msg) = stream.next().await {
        let Ok(Message::Binary(b)) = msg else {
            continue;
        };
        let frame = match decode_frame(&b) {
            Ok(f) => f,
            Err(e) => {
                warn!("frame decode failed: {e}");
                continue;
            }
        };
        if let Frame::Response(resp) = frame {
            handle.deliver_response(resp).await;
        }
    }

    state.registry.disconnect(tunnel_id).await;
    outbound_task.abort();
    info!(tunnel_id, "tunnel closed");
}

async fn public_proxy(
    Host(host): Host,
    State(state): State<AppState>,
    req: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 32 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "body too large").into_response(),
    };
    let mut headers = BTreeMap::new();
    for (k, v) in parts.headers.iter() {
        if let Ok(s) = v.to_str() {
            headers.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let url = parts
        .uri
        .path_and_query()
        .map(|p| p.to_string())
        .unwrap_or_else(|| "/".to_string());
    let frame = RequestFrame {
        id: generate_request_id(),
        hostname: host,
        method: parts.method.to_string(),
        url,
        headers,
        body: body_to_base64(&body_bytes),
    };
    match state.registry.forward(frame).await {
        Ok(resp) => {
            let body = body_from_base64(&resp.body).unwrap_or_default();
            let mut builder = axum::http::Response::builder().status(resp.status);
            for (k, v) in &resp.headers {
                builder = builder.header(k, v);
            }
            builder
                .body(axum::body::Body::from(body))
                .unwrap_or_else(|_| {
                    axum::http::Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(axum::body::Body::empty())
                        .expect("static fallback response")
                })
                .into_response()
        }
        Err(tunnel_rs::ForwardError::NoTunnel) => {
            (StatusCode::BAD_GATEWAY, "no tunnel registered for hostname").into_response()
        }
        Err(tunnel_rs::ForwardError::TunnelGone) => {
            (StatusCode::BAD_GATEWAY, "tunnel disconnected").into_response()
        }
    }
}

// silence unused-import warning when the Json import isn't used by handlers
#[allow(dead_code)]
fn _unused_json_marker() -> Json<()> {
    Json(())
}
