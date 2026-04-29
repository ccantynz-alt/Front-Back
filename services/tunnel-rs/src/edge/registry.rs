//! Hostname → tunnel registry.
//!
//! When an origin connects and presents valid claims, the edge inserts
//! one entry per claimed hostname pointing at the tunnel handle. New
//! advertisements **displace** older ones for the same hostname (latest
//! origin wins). When an origin disconnects, all of its entries are
//! removed atomically.
//!
//! The registry exposes a small async API used by the public HTTP
//! listener: send a [`crate::protocol::RequestFrame`] to the right
//! tunnel, await a [`crate::protocol::ResponseFrame`].

use crate::protocol::{Frame, RequestFrame, ResponseFrame};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};

/// Opaque handle returned by `EdgeRegistry::register`. The owner (the
/// tunnel-accept task) holds this to keep its slot alive; dropping it
/// (or calling `disconnect`) clears the registry entries.
#[derive(Clone)]
pub struct TunnelHandle {
    pub origin_id: String,
    pub tunnel_id: u64,
    pub outbound: mpsc::Sender<Frame>,
    pending: Arc<RwLock<HashMap<String, oneshot::Sender<ResponseFrame>>>>,
}

impl TunnelHandle {
    /// Send a request and await its response. Cheap to clone, cheap to call.
    pub async fn forward(&self, req: RequestFrame) -> Result<ResponseFrame, ForwardError> {
        let id = req.id.clone();
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.write().await;
            pending.insert(id.clone(), tx);
        }
        if self.outbound.send(Frame::Request(req)).await.is_err() {
            let mut pending = self.pending.write().await;
            pending.remove(&id);
            return Err(ForwardError::TunnelGone);
        }
        match rx.await {
            Ok(resp) => Ok(resp),
            Err(_) => Err(ForwardError::TunnelGone),
        }
    }

    /// Resolve a pending request when a `response` frame arrives from the origin.
    pub async fn deliver_response(&self, resp: ResponseFrame) -> bool {
        let mut pending = self.pending.write().await;
        if let Some(tx) = pending.remove(&resp.id) {
            // ignore send error: requester may have given up
            let _ = tx.send(resp);
            true
        } else {
            false
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ForwardError {
    #[error("no tunnel registered for hostname")]
    NoTunnel,
    #[error("tunnel disconnected")]
    TunnelGone,
}

/// What the registry stores for each hostname.
#[derive(Clone)]
pub struct RegistryEntry {
    pub hostname: String,
    pub origin_id: String,
    pub tunnel_id: u64,
}

#[derive(Default)]
struct Inner {
    /// hostname → tunnel handle (latest-wins).
    by_host: HashMap<String, TunnelHandle>,
    /// tunnel_id → list of hostnames it owns (for atomic removal on disconnect).
    by_tunnel: HashMap<u64, Vec<String>>,
}

#[derive(Clone, Default)]
pub struct EdgeRegistry {
    inner: Arc<RwLock<Inner>>,
    next_tunnel_id: Arc<AtomicU64>,
}

impl EdgeRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Allocate a tunnel id for a freshly-accepted origin. Pair with
    /// [`EdgeRegistry::register`] once the advertise frame is verified.
    pub fn next_tunnel_id(&self) -> u64 {
        self.next_tunnel_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Register an authenticated origin's claimed hostnames. Returns the
    /// `TunnelHandle` the accept loop should hold for the duration of
    /// the connection. Dropping the handle does **not** auto-clear; call
    /// [`EdgeRegistry::disconnect`] explicitly when the socket closes.
    pub async fn register(
        &self,
        origin_id: String,
        tunnel_id: u64,
        hostnames: Vec<String>,
        outbound: mpsc::Sender<Frame>,
    ) -> TunnelHandle {
        let handle = TunnelHandle {
            origin_id,
            tunnel_id,
            outbound,
            pending: Arc::new(RwLock::new(HashMap::new())),
        };
        let mut inner = self.inner.write().await;
        // First, ensure our tunnel slot exists; we'll fill it after the
        // displacement work below to avoid overlapping mutable borrows.
        inner.by_tunnel.entry(tunnel_id).or_default();
        for h in &hostnames {
            // displacement: previous owner of `h` (if any) loses its claim.
            if let Some(prev) = inner.by_host.insert(h.clone(), handle.clone()) {
                if let Some(list) = inner.by_tunnel.get_mut(&prev.tunnel_id) {
                    list.retain(|x| x != h);
                }
            }
            if let Some(list) = inner.by_tunnel.get_mut(&tunnel_id) {
                list.push(h.clone());
            }
        }
        handle
    }

    /// Remove all registry entries owned by a tunnel. Idempotent.
    pub async fn disconnect(&self, tunnel_id: u64) {
        let mut inner = self.inner.write().await;
        if let Some(hosts) = inner.by_tunnel.remove(&tunnel_id) {
            for h in hosts {
                if let Some(entry) = inner.by_host.get(&h) {
                    if entry.tunnel_id == tunnel_id {
                        inner.by_host.remove(&h);
                    }
                }
            }
        }
    }

    /// Look up the tunnel for a hostname.
    pub async fn lookup(&self, hostname: &str) -> Option<TunnelHandle> {
        self.inner.read().await.by_host.get(hostname).cloned()
    }

    /// Number of distinct active tunnels.
    pub async fn connection_count(&self) -> usize {
        self.inner.read().await.by_tunnel.len()
    }

    /// Number of host bindings.
    pub async fn host_count(&self) -> usize {
        self.inner.read().await.by_host.len()
    }

    /// Forward a request through the registry. Resolves to a response
    /// frame from the origin.
    pub async fn forward(&self, req: RequestFrame) -> Result<ResponseFrame, ForwardError> {
        let handle = self
            .lookup(&req.hostname)
            .await
            .ok_or(ForwardError::NoTunnel)?;
        handle.forward(req).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{body_to_base64, RequestFrame, ResponseFrame};
    use std::collections::BTreeMap;

    fn req(host: &str, id: &str) -> RequestFrame {
        RequestFrame {
            id: id.into(),
            hostname: host.into(),
            method: "GET".into(),
            url: "/".into(),
            headers: BTreeMap::new(),
            body: String::new(),
        }
    }

    #[tokio::test]
    async fn register_and_lookup() {
        let reg = EdgeRegistry::new();
        let (tx, mut rx) = mpsc::channel::<Frame>(16);
        let id = reg.next_tunnel_id();
        let _h = reg
            .register("origin-a".into(), id, vec!["a.example".into()], tx)
            .await;

        assert_eq!(reg.connection_count().await, 1);
        assert!(reg.lookup("a.example").await.is_some());
        assert!(reg.lookup("missing.example").await.is_none());

        // Drain so the channel doesn't fill in another test
        drop(rx.recv());
    }

    #[tokio::test]
    async fn disconnect_clears_entries() {
        let reg = EdgeRegistry::new();
        let (tx, _rx) = mpsc::channel::<Frame>(16);
        let id = reg.next_tunnel_id();
        let _h = reg
            .register(
                "origin-a".into(),
                id,
                vec!["a.example".into(), "b.example".into()],
                tx,
            )
            .await;

        assert_eq!(reg.host_count().await, 2);
        reg.disconnect(id).await;
        assert_eq!(reg.host_count().await, 0);
        assert_eq!(reg.connection_count().await, 0);
    }

    #[tokio::test]
    async fn displacement_latest_wins() {
        let reg = EdgeRegistry::new();
        let (tx1, _rx1) = mpsc::channel::<Frame>(16);
        let (tx2, _rx2) = mpsc::channel::<Frame>(16);
        let id1 = reg.next_tunnel_id();
        let id2 = reg.next_tunnel_id();
        let _h1 = reg
            .register("origin-1".into(), id1, vec!["x.example".into()], tx1)
            .await;
        let _h2 = reg
            .register("origin-2".into(), id2, vec!["x.example".into()], tx2)
            .await;

        // Latest wins
        let entry = reg.lookup("x.example").await.unwrap();
        assert_eq!(entry.tunnel_id, id2);
        assert_eq!(entry.origin_id, "origin-2");

        // Disconnect the displaced tunnel — should NOT remove x.example
        reg.disconnect(id1).await;
        assert!(reg.lookup("x.example").await.is_some());
    }

    #[tokio::test]
    async fn forward_returns_no_tunnel() {
        let reg = EdgeRegistry::new();
        let r = reg.forward(req("nope.example", "1")).await;
        assert!(matches!(r, Err(ForwardError::NoTunnel)));
    }

    #[tokio::test]
    async fn forward_round_trip_via_handle() {
        let reg = EdgeRegistry::new();
        let (tx, mut rx) = mpsc::channel::<Frame>(16);
        let id = reg.next_tunnel_id();
        let handle = reg
            .register("origin-a".into(), id, vec!["a.example".into()], tx)
            .await;

        // Spawn a fake origin: receive request, ship a response back
        let handle2 = handle.clone();
        tokio::spawn(async move {
            if let Some(Frame::Request(req)) = rx.recv().await {
                let resp = ResponseFrame {
                    id: req.id.clone(),
                    status: 200,
                    headers: BTreeMap::new(),
                    body: body_to_base64(b"ok"),
                };
                handle2.deliver_response(resp).await;
            }
        });

        let resp = reg.forward(req("a.example", "req-1")).await.unwrap();
        assert_eq!(resp.status, 200);
        assert_eq!(resp.id, "req-1");
    }

    #[tokio::test]
    async fn forward_errors_when_tunnel_gone() {
        let reg = EdgeRegistry::new();
        let (tx, rx) = mpsc::channel::<Frame>(1);
        let id = reg.next_tunnel_id();
        let handle = reg
            .register("origin-a".into(), id, vec!["a.example".into()], tx)
            .await;

        // Drop receiver: outbound send will fail.
        drop(rx);

        let r = handle.forward(req("a.example", "1")).await;
        assert!(matches!(r, Err(ForwardError::TunnelGone)));
    }
}
