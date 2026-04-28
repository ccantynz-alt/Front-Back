//! End-to-end test: wire an in-memory tunnel and push thousands of
//! requests through it, verifying every response correlates correctly.

use tunnel_rs::origin::router::Router;
use tunnel_rs::transport::{make_request, wire_in_memory_tunnel};
use tunnel_rs::{body_from_base64, echo_response, EdgeRegistry};

#[tokio::test]
async fn thousand_requests_round_trip() {
    let reg = EdgeRegistry::new();
    let _t = wire_in_memory_tunnel(
        &reg,
        "origin-bench",
        vec!["bench.example".into()],
        Router::new(3000),
        echo_response,
    )
    .await;

    let mut tasks = Vec::new();
    for i in 0..1_000u32 {
        let reg = reg.clone();
        tasks.push(tokio::spawn(async move {
            let payload = format!("hello-{i}");
            let req = make_request("bench.example", "/", payload.as_bytes());
            let req_id = req.id.clone();
            let resp = reg.forward(req).await.expect("forward");
            assert_eq!(resp.status, 200);
            assert_eq!(resp.id, req_id);
            assert_eq!(body_from_base64(&resp.body).unwrap(), payload.as_bytes());
        }));
    }
    for t in tasks {
        t.await.expect("task");
    }
}

#[tokio::test]
async fn unknown_hostname_returns_no_tunnel() {
    let reg = EdgeRegistry::new();
    let _t = wire_in_memory_tunnel(
        &reg,
        "origin",
        vec!["a.example".into()],
        Router::new(3000),
        echo_response,
    )
    .await;

    let req = make_request("nope.example", "/", b"");
    let r = reg.forward(req).await;
    assert!(matches!(r, Err(tunnel_rs::ForwardError::NoTunnel)));
}
