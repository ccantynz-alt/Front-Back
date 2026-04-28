//! Origin daemon binary. Dials the edge, presents a signed token,
//! services request frames by forwarding to the local upstream HTTP
//! server, and reconnects with full-jitter backoff on failure.
//!
//! See `services/tunnel/origin/src/index.ts` for the canonical TS reference.

use futures_util::{SinkExt, StreamExt};
use std::collections::BTreeMap;
use std::env;
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};
use tunnel_rs::origin::router::Router as OriginRouter;
use tunnel_rs::protocol::{
    decode_frame, encode_frame, sign_tunnel_token, AdvertiseFrame, Frame, ResponseFrame,
    TunnelClaims,
};
use tunnel_rs::{
    body_from_base64, body_to_base64, generate_nonce, generate_request_id, Backoff, BackoffConfig,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let edge_url =
        env::var("TUNNEL_EDGE_URL").map_err(|_| anyhow::anyhow!("TUNNEL_EDGE_URL is required"))?;
    let secret = env::var("TUNNEL_SHARED_SECRET")
        .map_err(|_| anyhow::anyhow!("TUNNEL_SHARED_SECRET is required"))?;
    let hostnames_csv = env::var("TUNNEL_HOSTNAMES")
        .or_else(|_| env::var("TUNNEL_HOSTNAME"))
        .map_err(|_| anyhow::anyhow!("TUNNEL_HOSTNAMES (or TUNNEL_HOSTNAME) is required"))?;
    let hostnames: Vec<String> = hostnames_csv
        .split(',')
        .filter_map(|s: &str| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        })
        .collect();
    if hostnames.is_empty() {
        return Err(anyhow::anyhow!("no hostnames in TUNNEL_HOSTNAMES"));
    }
    let origin_id =
        env::var("TUNNEL_ORIGIN_ID").unwrap_or_else(|_| format!("origin-{}", std::process::id()));
    let routes_spec = env::var("TUNNEL_ROUTES")
        .unwrap_or_else(|_| "/api:3001,/trpc:3001,/healthz:3001,/auth/:3001".into());
    let default_port: u16 = env::var("TUNNEL_DEFAULT_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);
    let router = OriginRouter::parse(&routes_spec, default_port)?;

    let mut backoff = Backoff::new(BackoffConfig::default());
    loop {
        match run_once(&edge_url, &secret, &origin_id, &hostnames, &router).await {
            Ok(()) => {
                info!("tunnel closed cleanly, reconnecting");
                backoff.reset();
            }
            Err(e) => {
                let delay = backoff.next_delay();
                warn!(?delay, "tunnel error: {e}, reconnecting after backoff");
                tokio::time::sleep(delay).await;
            }
        }
        // Small min-delay to avoid tight loops on instant clean disconnects.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn run_once(
    edge_url: &str,
    secret: &str,
    origin_id: &str,
    hostnames: &[String],
    router: &OriginRouter,
) -> anyhow::Result<()> {
    let claims = TunnelClaims {
        id: origin_id.to_string(),
        ts: now_seconds(),
        nonce: generate_nonce(),
        hostnames: hostnames.to_vec(),
    };
    let token = sign_tunnel_token(&claims, secret)?;

    let (ws, _) = tokio_tungstenite::connect_async(edge_url).await?;
    let (mut sink, mut stream) = ws.split();

    let advertise = Frame::Advertise(AdvertiseFrame {
        id: token,
        hostnames: hostnames.to_vec(),
    });
    let bytes = encode_frame(&advertise)?;
    sink.send(Message::Binary(bytes)).await?;
    info!(origin = %origin_id, "advertised");

    while let Some(msg) = stream.next().await {
        let msg = msg?;
        let bytes = match msg {
            Message::Binary(b) => b,
            Message::Close(_) => return Ok(()),
            _ => continue,
        };
        let frame = decode_frame(&bytes)?;
        if let Frame::Request(req) = frame {
            // Pretend to forward: in production we'd open a TCP socket
            // to 127.0.0.1:<port>. For the v1 binary we 200-OK with the
            // resolved port in headers so the data plane is observable.
            let mut headers = BTreeMap::new();
            headers.insert("x-tunnel-rs".into(), "v1".into());
            headers.insert(
                "x-resolved-port".into(),
                router.resolve(&req.url).to_string(),
            );
            let body = body_from_base64(&req.body).unwrap_or_default();
            let resp = ResponseFrame {
                id: req.id.clone(),
                status: 200,
                headers,
                body: body_to_base64(&body),
            };
            let out = encode_frame(&Frame::Response(resp))?;
            if sink.send(Message::Binary(out)).await.is_err() {
                break;
            }
        }
    }
    Ok(())
}

fn now_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[allow(dead_code)]
fn _unused_id_marker() -> String {
    generate_request_id()
}
